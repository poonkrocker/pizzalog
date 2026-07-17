<?php

declare(strict_types=1);

namespace Pizzalog\Repositories;

use Pizzalog\Core\Database;

/**
 * Combos: un producto (el combo) que obliga a elegir N productos reales de la
 * carta por cada grupo ("elegí 3 pizzas", "elegí 1 bebida").
 *
 * Misma forma que VariantRepository: forProduct() para leer, sync() para
 * reemplazar todo de una.
 */
class ComboRepository
{
    /** @return array{groups: array<int, array>} */
    public function forProduct(int $bid, int $productId): array
    {
        $pdo = Database::pdo();

        $gstmt = $pdo->prepare(
            'SELECT id, name, select_count, sort_order
               FROM combo_groups
              WHERE product_id = ? AND business_id = ?
              ORDER BY sort_order, id'
        );
        $gstmt->execute([$productId, $bid]);
        $groups = $gstmt->fetchAll();

        if (!$groups) {
            return ['groups' => []];
        }

        $ids = array_map(static fn (array $g): int => (int) $g['id'], $groups);
        $in  = implode(',', array_fill(0, count($ids), '?'));

        $istmt = $pdo->prepare(
            "SELECT cgi.combo_group_id, cgi.product_id, cgi.sort_order,
                    p.name, p.price, p.image_url
               FROM combo_group_items cgi
               JOIN products p ON p.id = cgi.product_id
              WHERE cgi.combo_group_id IN ($in) AND p.business_id = ? AND p.is_active = 1
              ORDER BY cgi.sort_order, cgi.id"
        );
        $istmt->execute([...$ids, $bid]);

        $itemsByGroup = [];
        foreach ($istmt->fetchAll() as $r) {
            $itemsByGroup[(int) $r['combo_group_id']][] = [
                'product_id' => (int) $r['product_id'],
                'name'       => $r['name'],
                'price'      => (float) $r['price'],
                'image_url'  => $r['image_url'],
            ];
        }

        return ['groups' => array_map(static fn (array $g): array => [
            'id'           => (int) $g['id'],
            'name'         => $g['name'],
            'select_count' => (int) $g['select_count'],
            'sort_order'   => (int) $g['sort_order'],
            'items'        => $itemsByGroup[(int) $g['id']] ?? [],
        ], $groups)];
    }

    /**
     * Reemplaza TODOS los grupos del combo (mismo patrón que
     * PUT /products/{id}/variants). Marca products.is_combo según haya grupos.
     *
     * @param array<int, array{name:string, select_count:int, item_product_ids:int[]}> $groups
     */
    public function sync(int $bid, int $productId, array $groups): void
    {
        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM combo_groups WHERE product_id = ? AND business_id = ?')
                ->execute([$productId, $bid]);

            $insGroup = $pdo->prepare(
                'INSERT INTO combo_groups (business_id, product_id, name, select_count, sort_order)
                 VALUES (?, ?, ?, ?, ?)'
            );
            $insItem = $pdo->prepare(
                'INSERT INTO combo_group_items (combo_group_id, product_id, sort_order) VALUES (?, ?, ?)'
            );

            foreach (array_values($groups) as $gi => $g) {
                $insGroup->execute([$bid, $productId, $g['name'], $g['select_count'], $gi]);
                $groupId = (int) $pdo->lastInsertId();
                foreach (array_values($g['item_product_ids']) as $ii => $pid) {
                    $insItem->execute([$groupId, $pid, $ii]);
                }
            }

            $pdo->prepare('UPDATE products SET is_combo = ? WHERE id = ? AND business_id = ?')
                ->execute([$groups === [] ? 0 : 1, $productId, $bid]);

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Datos mínimos de los productos elegidos, para armar las líneas hijas
     * (snapshot de nombre + si descuentan stock).
     *
     * @param int[] $ids
     * @return array<int, array{name:string, track_stock:int}>
     */
    public function childProducts(int $bid, array $ids): array
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        if ($ids === []) {
            return [];
        }
        $in   = implode(',', array_fill(0, count($ids), '?'));
        $stmt = Database::pdo()->prepare(
            "SELECT id, name, track_stock FROM products
              WHERE business_id = ? AND is_active = 1 AND id IN ($in)"
        );
        $stmt->execute([$bid, ...$ids]);

        $map = [];
        foreach ($stmt->fetchAll() as $r) {
            $map[(int) $r['id']] = [
                'name'        => $r['name'],
                'track_stock' => (int) $r['track_stock'],
            ];
        }
        return $map;
    }

    /**
     * Valida las elecciones del cliente contra los grupos reales del combo.
     * Nunca se confía en el front: cantidad exacta por grupo y pertenencia.
     *
     * @param array<int, array{group_id:int, product_ids:int[]}> $selections
     * @return int[] product_ids elegidos, planos y validados
     * @throws \DomainException con el mensaje listo para devolver como 422
     */
    public function validateSelections(int $bid, int $comboProductId, array $selections): array
    {
        $combo = $this->forProduct($bid, $comboProductId);
        if ($combo['groups'] === []) {
            throw new \DomainException('El combo no tiene grupos configurados');
        }

        $byGroup = [];
        foreach ($selections as $s) {
            $gid = (int) ($s['group_id'] ?? 0);
            $byGroup[$gid] = array_map('intval', (array) ($s['product_ids'] ?? []));
        }

        $chosen = [];
        foreach ($combo['groups'] as $g) {
            $picked = $byGroup[$g['id']] ?? [];
            if (count($picked) !== $g['select_count']) {
                throw new \DomainException(
                    sprintf('En "%s" tenés que elegir %d.', $g['name'], $g['select_count'])
                );
            }
            $allowed = array_column($g['items'], 'product_id');
            foreach ($picked as $pid) {
                if (!in_array($pid, $allowed, true)) {
                    throw new \DomainException(sprintf('Hay una opción inválida en "%s".', $g['name']));
                }
                $chosen[] = $pid;
            }
        }

        return $chosen;
    }
}
