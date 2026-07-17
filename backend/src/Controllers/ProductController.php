<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\ProductVisibility;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Ingredients\ExtractorFactory;
use Pizzalog\Repositories\ComboRepository;
use Pizzalog\Repositories\IngredientRepository;
use Pizzalog\Repositories\VariantRepository;

class ProductController
{
    /** Columnas del producto para el panel (gestión interna: se ve todo siempre). */
    private const FIELDS = 'id, category_id, sort_order, name, description, price, cost, image_url,
                            track_stock, stock_quantity, stock_min, is_active, has_variants, is_combo,
                            is_open_price, show_online, is_secret, is_vegan_opt, badge_text,
                            visible_days, visible_from, visible_until';

    private IngredientRepository $ingredients;
    private VariantRepository $variants;
    private ComboRepository $combos;

    public function __construct()
    {
        $this->ingredients = new IngredientRepository();
        $this->variants    = new VariantRepository();
        $this->combos      = new ComboRepository();
    }

    /**
     * POST /products/preview-ingredients   Body: { description }
     * Detecta ingredientes SIN guardar nada. El front los muestra para que
     * el usuario confirme o edite antes de crear el producto.
     */
    public function previewIngredients(Request $req): void
    {
        $description = trim((string) $req->input('description', ''));
        if ($description === '') {
            Response::error('La descripción es obligatoria', 422);
        }

        $extractor = ExtractorFactory::forBusiness((int) $req->auth['business_id']);
        Response::ok(['ingredients' => $extractor->extract($description)]);
    }

    /** GET /products */
    public function index(Request $req): void
    {
        $bid  = (int) $req->auth['business_id'];
        $stmt = Database::pdo()->prepare(
            'SELECT ' . self::FIELDS . '
               FROM products
              WHERE business_id = ?
              ORDER BY sort_order ASC, id ASC'
        );
        $stmt->execute([$bid]);

        $products = [];
        foreach ($stmt->fetchAll() as $row) {
            $products[] = $this->hydrate($bid, $row);
        }

        Response::ok(['products' => $products]);
    }

    /** GET /products/{id} */
    public function show(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        Response::ok([
            'product' => $this->hydrate($bid, $this->findOwned($req, (int) $req->param('id'))),
        ]);
    }

    /**
     * POST /products
     * Body: { name, description?, price, cost?, category_id?, track_stock?,
     *         stock_quantity?, stock_min?, ingredients?: string[],
     *         show_online?, is_secret?, is_vegan_opt?, badge_text?,
     *         visible_days?: string[], visible_from?, visible_until? }
     */
    public function store(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $d   = $this->validate($req, $bid);
        $pdo = Database::pdo();

        $pdo->beginTransaction();
        try {
            // Entra al final de su categoría, no al principio con el default 0.
            $next = $pdo->prepare(
                'SELECT COALESCE(MAX(sort_order), -1) + 1 FROM products
                  WHERE business_id = ? AND category_id <=> ?'
            );
            $next->execute([$bid, $d['category_id']]);
            $sortOrder = (int) $next->fetchColumn();

            $stmt = $pdo->prepare(
                'INSERT INTO products
                    (business_id, category_id, sort_order, name, description, price, cost,
                     track_stock, stock_quantity, stock_min, is_open_price, image_url,
                     show_online, is_secret, is_vegan_opt, badge_text,
                     visible_days, visible_from, visible_until)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $bid, $d['category_id'], $sortOrder, $d['name'], $d['description'], $d['price'],
                $d['cost'], $d['track_stock'], $d['stock_quantity'], $d['stock_min'],
                $d['is_open_price'], $d['image_url'],
                $d['show_online'], $d['is_secret'], $d['is_vegan_opt'], $d['badge_text'],
                $d['visible_days'], $d['visible_from'], $d['visible_until'],
            ]);
            $productId = (int) $pdo->lastInsertId();

            $ids = $this->ingredients->resolveNames($bid, $d['ingredients']);
            $this->ingredients->syncProduct($productId, $ids);

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        Response::ok(['product' => $this->hydrate($bid, $this->findOwned($req, $productId))], 201);
    }

    /** PUT /products/{id} */
    public function update(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        $this->findOwned($req, $id); // 404 si no es de este negocio
        $d   = $this->validate($req, $bid);
        $pdo = Database::pdo();

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'UPDATE products
                    SET category_id = ?, name = ?, description = ?, price = ?, cost = ?,
                        track_stock = ?, stock_quantity = ?, stock_min = ?, is_open_price = ?,
                        image_url = ?, show_online = ?, is_secret = ?, is_vegan_opt = ?,
                        badge_text = ?, visible_days = ?, visible_from = ?, visible_until = ?
                  WHERE id = ? AND business_id = ?'
            );
            $stmt->execute([
                $d['category_id'], $d['name'], $d['description'], $d['price'], $d['cost'],
                $d['track_stock'], $d['stock_quantity'], $d['stock_min'], $d['is_open_price'],
                $d['image_url'], $d['show_online'], $d['is_secret'], $d['is_vegan_opt'],
                $d['badge_text'], $d['visible_days'], $d['visible_from'], $d['visible_until'],
                $id, $bid,
            ]);

            $ids = $this->ingredients->resolveNames($bid, $d['ingredients']);
            $this->ingredients->syncProduct($id, $ids);

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        Response::ok(['product' => $this->hydrate($bid, $this->findOwned($req, $id))]);
    }

    /**
     * PUT /products/reorder
     * Body: { category_id: number|null, product_ids: number[] }
     * El array completo de esa categoría, en el orden final. Todo o nada:
     * si falta o sobra alguno, o hay uno de otra categoría, 422 sin guardar.
     */
    public function reorder(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];

        $categoryId = $req->input('category_id');
        $categoryId = ($categoryId === null || $categoryId === '') ? null : (int) $categoryId;

        $ids = $req->input('product_ids');
        if (!is_array($ids) || $ids === []) {
            Response::error('Mandá el listado completo de productos de la categoría', 422);
        }
        $ids = array_map('intval', $ids);
        if (count($ids) !== count(array_unique($ids))) {
            Response::error('Hay productos repetidos en el orden enviado', 422);
        }

        $pdo  = Database::pdo();
        $stmt = $pdo->prepare(
            'SELECT id FROM products WHERE business_id = ? AND category_id <=> ? AND is_active = 1'
        );
        $stmt->execute([$bid, $categoryId]);
        $actual = array_map('intval', $stmt->fetchAll(\PDO::FETCH_COLUMN));

        $sent = $ids;
        sort($actual);
        sort($sent);
        if ($actual !== $sent) {
            Response::error(
                'El orden enviado no coincide con los productos de esa categoría. Recargá y probá de nuevo.',
                422
            );
        }

        $pdo->beginTransaction();
        try {
            $upd = $pdo->prepare('UPDATE products SET sort_order = ? WHERE id = ? AND business_id = ?');
            foreach ($ids as $pos => $pid) {
                $upd->execute([$pos, $pid, $bid]);
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        Response::ok(['reordered' => count($ids)]);
    }

    /** DELETE /products/{id}  (baja lógica: preserva históricos de venta) */
    public function destroy(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        $this->findOwned($req, $id);

        Database::pdo()
            ->prepare('UPDATE products SET is_active = 0 WHERE id = ? AND business_id = ?')
            ->execute([$id, $bid]);

        Response::ok(['deleted' => true]);
    }

    // ----------------------------------------------------------------

    /** Suma ingredientes, variantes y combo, y normaliza los campos nuevos. */
    private function hydrate(int $bid, array $p): array
    {
        $p['ingredients'] = $this->ingredients->forProduct((int) $p['id']);

        if ((int) $p['has_variants'] === 1) {
            $data = $this->variants->forProduct($bid, (int) $p['id']);
            $p['options']  = $data['options'];
            $p['variants'] = $data['variants'];
        }
        if ((int) $p['is_combo'] === 1) {
            $p['combo'] = $this->combos->forProduct($bid, (int) $p['id']);
        }

        $p['visible_days']  = ProductVisibility::decodeDays($p['visible_days'] ?? null);
        $p['visible_from']  = $p['visible_from'] !== null ? substr((string) $p['visible_from'], 0, 5) : null;
        $p['visible_until'] = $p['visible_until'] !== null ? substr((string) $p['visible_until'], 0, 5) : null;

        return $p;
    }

    private function validate(Request $req, int $bid): array
    {
        $name  = trim((string) $req->input('name', ''));
        $price = $req->input('price');

        if ($name === '') {
            Response::error('El nombre es obligatorio', 422);
        }
        if (!is_numeric($price)) {
            Response::error('El precio es obligatorio y debe ser numérico', 422);
        }

        $categoryId = $req->input('category_id');
        $categoryId = ($categoryId === null || $categoryId === '') ? null : (int) $categoryId;
        if ($categoryId !== null && !$this->categoryBelongs($bid, $categoryId)) {
            Response::error('La categoría indicada no existe', 422);
        }

        $cost        = $req->input('cost');
        $ingredients = $req->input('ingredients');

        $badge = trim((string) $req->input('badge_text', ''));
        if (mb_strlen($badge) > 40) {
            Response::error('El badge no puede superar los 40 caracteres', 422);
        }

        $days = ProductVisibility::decodeDays($req->input('visible_days'));

        return [
            'name'           => $name,
            'description'    => trim((string) $req->input('description', '')) ?: null,
            'price'          => (float) $price,
            'cost'           => is_numeric($cost) ? (float) $cost : 0.0,
            'category_id'    => $categoryId,
            'track_stock'    => (int) (bool) $req->input('track_stock', false),
            'stock_quantity' => (int) $req->input('stock_quantity', 0),
            'stock_min'      => (int) $req->input('stock_min', 0),
            'is_open_price'  => (int) (bool) $req->input('is_open_price', false),
            'image_url'      => substr(trim((string) $req->input('image_url', '')), 0, 300) ?: null,
            'ingredients'    => is_array($ingredients) ? $ingredients : [],
            'show_online'    => (int) (bool) $req->input('show_online', true),
            'is_secret'      => (int) (bool) $req->input('is_secret', false),
            'is_vegan_opt'   => (int) (bool) $req->input('is_vegan_opt', false),
            'badge_text'     => $badge !== '' ? $badge : null,
            'visible_days'   => $days !== null ? json_encode($days) : null,
            'visible_from'   => $this->time($req->input('visible_from')),
            'visible_until'  => $this->time($req->input('visible_until')),
        ];
    }

    private function time(mixed $v): ?string
    {
        $v = trim((string) ($v ?? ''));
        if ($v === '') {
            return null;
        }
        if (!preg_match('/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/', $v)) {
            Response::error('Horario inválido (usá el formato HH:MM)', 422);
        }
        return strlen($v) === 5 ? $v . ':00' : $v;
    }

    private function findOwned(Request $req, int $id): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT ' . self::FIELDS . '
               FROM products
              WHERE id = ? AND business_id = ?
              LIMIT 1'
        );
        $stmt->execute([$id, (int) $req->auth['business_id']]);
        $product = $stmt->fetch();

        if (!$product) {
            Response::error('Producto no encontrado', 404);
        }
        return $product;
    }

    private function categoryBelongs(int $bid, int $categoryId): bool
    {
        $stmt = Database::pdo()->prepare(
            'SELECT 1 FROM categories WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$categoryId, $bid]);
        return (bool) $stmt->fetch();
    }
}
