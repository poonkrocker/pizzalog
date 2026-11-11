<?php
namespace Pizzalog\Services;

use Pizzalog\Core\Database;

/**
 * Resuelve artículos de Loyverse contra el catálogo del negocio.
 *
 * Política:
 * - >= 0.95: vinculación automática.
 * - 0.80..0.9499: revisión; no fusiona ni crea un producto.
 * - < 0.80: artículo nuevo; se crea oculto en canales públicos.
 *
 * Las variantes se conservan como identidad externa del artículo, pero no
 * generan productos independientes.
 */
class LoyverseProductMatcher
{
    public static function ensureTable(?\PDO $pdo = null): void
    {
        $pdo ??= Database::pdo();
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS loyverse_product_links (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                business_id BIGINT UNSIGNED NOT NULL,
                external_key CHAR(64) NOT NULL,
                external_ref VARCHAR(64) NULL,
                external_name VARCHAR(180) NOT NULL,
                external_category VARCHAR(120) NULL,
                external_variant VARCHAR(180) NULL,
                product_id BIGINT UNSIGNED NULL,
                variant_id BIGINT UNSIGNED NULL,
                match_status ENUM('matched','created','review') NOT NULL DEFAULT 'review',
                match_confidence DECIMAL(5,4) NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uq_loyverse_link_business_key (business_id, external_key),
                KEY idx_loyverse_link_product (business_id, product_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
    }

    public function resolve(int $businessId, string $name, string $category, string $variant, ?string $externalRef = null): array
    {
        $name = trim($name);
        if ($name === '') {
            throw new \InvalidArgumentException('El artículo de Loyverse no tiene nombre.');
        }

        $pdo = Database::pdo();
        self::ensureTable($pdo);
        // REF es la identidad estable de Loyverse; si no existe, usar clave compuesta.
        $identity = trim((string) $externalRef) !== ''
            ? 'ref:' . trim((string) $externalRef)
            : 'fallback:' . implode('|', [
                $this->normalize($name),
                $this->normalize($category),
                $this->normalize($variant),
            ]);
        $externalKey = hash('sha256', $businessId . '|' . $identity);

        $existingLink = $pdo->prepare(
            'SELECT id, product_id, variant_id, match_status, match_confidence
               FROM loyverse_product_links
              WHERE business_id = ? AND external_key = ? LIMIT 1'
        );
        $existingLink->execute([$businessId, $externalKey]);
        $link = $existingLink->fetch(\PDO::FETCH_ASSOC);
        if ($link) {
            return [
                'action' => 'existing_link',
                'product_id' => $link['product_id'] !== null ? (int) $link['product_id'] : null,
                'variant_id' => $link['variant_id'] !== null ? (int) $link['variant_id'] : null,
                'status' => $link['match_status'],
                'confidence' => $link['match_confidence'] !== null ? (float) $link['match_confidence'] : null,
            ];
        }

        $categoryId = $this->findCategoryId($businessId, $category);
        $stmt = $pdo->prepare(
            'SELECT p.id, p.name, p.category_id
               FROM products p
              WHERE p.business_id = ? AND p.is_active = 1'
        );
        $stmt->execute([$businessId]);

        $best = null;
        $second = null;
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $product) {
            $score = $this->similarity($name, (string) $product['name']);
            if ($categoryId !== null && (int) ($product['category_id'] ?? 0) === $categoryId) {
                $score = min(1.0, $score + 0.04);
            } elseif ($categoryId !== null && $product['category_id'] !== null) {
                $score = max(0.0, $score - 0.08);
            }
            $candidate = ['id' => (int) $product['id'], 'name' => $product['name'], 'score' => $score];
            if ($best === null || $score > $best['score']) {
                $second = $best;
                $best = $candidate;
            } elseif ($second === null || $score > $second['score']) {
                $second = $candidate;
            }
        }

        $decision = 'created';
        $productId = null;
        $confidence = $best['score'] ?? 0.0;

        // Evitar unir dos productos que puntúan prácticamente igual.
        $ambiguousTop = $best !== null && $second !== null && ($best['score'] - $second['score']) < 0.035;
        if ($best !== null && $best['score'] >= 0.95 && !$ambiguousTop) {
            $decision = 'matched';
            $productId = $best['id'];
        } elseif ($best !== null && $best['score'] >= 0.80) {
            $decision = 'review';
        } else {
            $productId = $this->createHiddenProduct($businessId, $name, $categoryId);
        }

        $insert = $pdo->prepare(
            'INSERT INTO loyverse_product_links
                (business_id, external_key, external_ref, external_name, external_category,
                 external_variant, product_id, match_status, match_confidence)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $insert->execute([
            $businessId, $externalKey, $externalRef, mb_substr($name, 0, 180),
            $category !== '' ? mb_substr($category, 0, 120) : null,
            $variant !== '' ? mb_substr($variant, 0, 180) : null,
            $productId, $decision, round($confidence, 4),
        ]);

        return [
            'action' => $decision,
            'product_id' => $productId,
            'variant_id' => null,
            'status' => $decision,
            'confidence' => round($confidence, 4),
            'candidate' => $decision === 'review' ? $best : null,
        ];
    }

    private function createHiddenProduct(int $businessId, string $name, ?int $categoryId): int
    {
        $pdo = Database::pdo();
        $sort = $pdo->prepare(
            'SELECT COALESCE(MAX(sort_order), -1) + 1
               FROM products WHERE business_id = ? AND category_id <=> ?'
        );
        $sort->execute([$businessId, $categoryId]);
        $sortOrder = (int) $sort->fetchColumn();

        // Precio/costo/imagen/descripción no se inventan. No se publica en carta ni web.
        $insert = $pdo->prepare(
            'INSERT INTO products
                (business_id, category_id, sort_order, name, price, track_stock, stock_quantity,
                 stock_min, is_active, show_online, show_in_salon, is_available)
             VALUES (?, ?, ?, ?, 0, 0, 0, 0, 1, 0, 0, 0)'
        );
        $insert->execute([$businessId, $categoryId, $sortOrder, mb_substr($name, 0, 120)]);
        return (int) $pdo->lastInsertId();
    }

    private function findCategoryId(int $businessId, string $category): ?int
    {
        if (trim($category) === '') return null;
        $stmt = Database::pdo()->prepare('SELECT id, name FROM categories WHERE business_id = ? AND is_active = 1');
        $stmt->execute([$businessId]);
        $target = $this->normalize($category);
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
            if ($this->normalize((string) $row['name']) === $target) return (int) $row['id'];
        }
        return null;
    }

    private function similarity(string $a, string $b): float
    {
        $a = $this->normalize($a);
        $b = $this->normalize($b);
        if ($a === $b) return 1.0;
        if ($a === '' || $b === '') return 0.0;
        similar_text($a, $b, $pct);
        $lev = levenshtein(mb_substr($a, 0, 250), mb_substr($b, 0, 250));
        $levScore = 1.0 - ($lev / max(mb_strlen($a), mb_strlen($b), 1));
        return max(0.0, min(1.0, (0.65 * ($pct / 100)) + (0.35 * $levScore)));
    }

    private function normalize(string $value): string
    {
        $value = mb_strtolower(trim($value));
        $value = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value) ?: $value;
        $value = preg_replace('/[^a-z0-9]+/', ' ', $value) ?? $value;
        return trim(preg_replace('/\s+/', ' ', $value) ?? $value);
    }
}
