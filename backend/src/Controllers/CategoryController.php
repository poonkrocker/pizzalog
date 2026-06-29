<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

class CategoryController
{
    /** GET /categories  (incluye cuántos productos activos tiene cada una) */
    public function index(Request $req): void
    {
        $stmt = Database::pdo()->prepare(
            'SELECT c.id, c.name, c.sort_order, c.is_active,
                    (SELECT COUNT(*) FROM products p
                      WHERE p.category_id = c.id AND p.is_active = 1) AS product_count
               FROM categories c
              WHERE c.business_id = ? AND c.is_active = 1
              ORDER BY c.sort_order, c.name'
        );
        $stmt->execute([(int) $req->auth['business_id']]);

        $categories = array_map(static function (array $c): array {
            $c['id']            = (int) $c['id'];
            $c['sort_order']    = (int) $c['sort_order'];
            $c['is_active']     = (int) $c['is_active'];
            $c['product_count'] = (int) $c['product_count'];
            return $c;
        }, $stmt->fetchAll());

        Response::ok(['categories' => $categories]);
    }

    /** GET /categories/{id} */
    public function show(Request $req): void
    {
        Response::ok(['category' => $this->findOwned($req, (int) $req->param('id'))]);
    }

    /** POST /categories   Body: { name, sort_order? } */
    public function store(Request $req): void
    {
        $bid  = (int) $req->auth['business_id'];
        $name = trim((string) $req->input('name', ''));

        if ($name === '') {
            Response::error('El nombre es obligatorio', 422);
        }
        if ($this->nameExists($bid, $name)) {
            Response::error('Ya existe una categoría con ese nombre', 422);
        }

        $stmt = Database::pdo()->prepare(
            'INSERT INTO categories (business_id, name, sort_order) VALUES (?, ?, ?)'
        );
        $stmt->execute([$bid, $name, (int) $req->input('sort_order', 0)]);
        $id = (int) Database::pdo()->lastInsertId();

        Response::ok(['category' => $this->findOwned($req, $id)], 201);
    }

    /** PUT /categories/{id}   Body: { name, sort_order?, is_active? } */
    public function update(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        $this->findOwned($req, $id);

        $name = trim((string) $req->input('name', ''));
        if ($name === '') {
            Response::error('El nombre es obligatorio', 422);
        }
        if ($this->nameExists($bid, $name, $id)) {
            Response::error('Ya existe otra categoría con ese nombre', 422);
        }

        $stmt = Database::pdo()->prepare(
            'UPDATE categories SET name = ?, sort_order = ?, is_active = ?
              WHERE id = ? AND business_id = ?'
        );
        $stmt->execute([
            $name,
            (int) $req->input('sort_order', 0),
            (int) (bool) $req->input('is_active', true),
            $id,
            $bid,
        ]);

        Response::ok(['category' => $this->findOwned($req, $id)]);
    }

    /** DELETE /categories/{id}  (baja lógica; sus productos quedan sin categoría) */
    public function destroy(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        $this->findOwned($req, $id);

        Database::pdo()
            ->prepare('UPDATE categories SET is_active = 0 WHERE id = ? AND business_id = ?')
            ->execute([$id, $bid]);

        Response::ok(['deleted' => true]);
    }

    // -----------------------------------------------------------------

    private function findOwned(Request $req, int $id): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, name, sort_order, is_active
               FROM categories WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$id, (int) $req->auth['business_id']]);
        $cat = $stmt->fetch();

        if (!$cat) {
            Response::error('Categoría no encontrada', 404);
        }

        $cat['id']         = (int) $cat['id'];
        $cat['sort_order'] = (int) $cat['sort_order'];
        $cat['is_active']  = (int) $cat['is_active'];
        return $cat;
    }

    /** Evita nombres duplicados (entre categorías activas del negocio). */
    private function nameExists(int $bid, string $name, ?int $exceptId = null): bool
    {
        $sql    = 'SELECT 1 FROM categories WHERE business_id = ? AND name = ? AND is_active = 1';
        $params = [$bid, $name];
        if ($exceptId !== null) {
            $sql     .= ' AND id <> ?';
            $params[] = $exceptId;
        }
        $sql .= ' LIMIT 1';

        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        return (bool) $stmt->fetch();
    }
}
