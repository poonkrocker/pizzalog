<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Ingredients\ExtractorFactory;
use Pizzalog\Repositories\IngredientRepository;

class ProductController
{
    private IngredientRepository $ingredients;

    public function __construct()
    {
        $this->ingredients = new IngredientRepository();
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
        $stmt = Database::pdo()->prepare(
            'SELECT id, category_id, name, description, price, cost, image_url,
                    track_stock, stock_quantity, stock_min, is_active
               FROM products
              WHERE business_id = ?
              ORDER BY name'
        );
        $stmt->execute([(int) $req->auth['business_id']]);
        $products = $stmt->fetchAll();

        foreach ($products as &$p) {
            $p['ingredients'] = $this->ingredients->forProduct((int) $p['id']);
        }
        unset($p);

        Response::ok(['products' => $products]);
    }

    /** GET /products/{id} */
    public function show(Request $req): void
    {
        $product = $this->findOwned($req, (int) $req->param('id'));
        $product['ingredients'] = $this->ingredients->forProduct((int) $product['id']);
        Response::ok(['product' => $product]);
    }

    /**
     * POST /products
     * Body: { name, description?, price, cost?, category_id?, track_stock?,
     *         stock_quantity?, stock_min?, ingredients?: string[] }
     * Los ingredientes llegan YA confirmados por el usuario (desde el preview).
     */
    public function store(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $d   = $this->validate($req, $bid);
        $pdo = Database::pdo();

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'INSERT INTO products
                    (business_id, category_id, name, description, price, cost,
                     track_stock, stock_quantity, stock_min)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $bid, $d['category_id'], $d['name'], $d['description'], $d['price'],
                $d['cost'], $d['track_stock'], $d['stock_quantity'], $d['stock_min'],
            ]);
            $productId = (int) $pdo->lastInsertId();

            $ids = $this->ingredients->resolveNames($bid, $d['ingredients']);
            $this->ingredients->syncProduct($productId, $ids);

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        $product = $this->findOwned($req, $productId);
        $product['ingredients'] = $this->ingredients->forProduct($productId);
        Response::ok(['product' => $product], 201);
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
                        track_stock = ?, stock_quantity = ?, stock_min = ?
                  WHERE id = ? AND business_id = ?'
            );
            $stmt->execute([
                $d['category_id'], $d['name'], $d['description'], $d['price'], $d['cost'],
                $d['track_stock'], $d['stock_quantity'], $d['stock_min'], $id, $bid,
            ]);

            $ids = $this->ingredients->resolveNames($bid, $d['ingredients']);
            $this->ingredients->syncProduct($id, $ids);

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        $product = $this->findOwned($req, $id);
        $product['ingredients'] = $this->ingredients->forProduct($id);
        Response::ok(['product' => $product]);
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

        $cost = $req->input('cost');
        $ingredients = $req->input('ingredients');

        return [
            'name'           => $name,
            'description'    => trim((string) $req->input('description', '')) ?: null,
            'price'          => (float) $price,
            'cost'           => is_numeric($cost) ? (float) $cost : 0.0,
            'category_id'    => $categoryId,
            'track_stock'    => (int) (bool) $req->input('track_stock', false),
            'stock_quantity' => (int) $req->input('stock_quantity', 0),
            'stock_min'      => (int) $req->input('stock_min', 0),
            'ingredients'    => is_array($ingredients) ? $ingredients : [],
        ];
    }

    private function findOwned(Request $req, int $id): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, category_id, name, description, price, cost, image_url,
                    track_stock, stock_quantity, stock_min, is_active
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
