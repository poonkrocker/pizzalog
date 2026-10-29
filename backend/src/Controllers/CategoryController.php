<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

class CategoryController
{
    public function __construct()
    {
        self::ensureSchema();
    }

    public static function ensureSchema(): void
    {
        try {
            $pdo = Database::pdo();
            $col = $pdo->query("SHOW COLUMNS FROM categories LIKE 'allows_extras'")->fetch();
            if (!$col) {
                $pdo->exec("ALTER TABLE categories ADD COLUMN allows_extras TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active");
            }
            $col2 = $pdo->query("SHOW COLUMNS FROM categories LIKE 'target_category_ids'")->fetch();
            if (!$col2) {
                $pdo->exec("ALTER TABLE categories ADD COLUMN target_category_ids TEXT NULL AFTER allows_extras");
            }
            // Inicializar allows_extras = 1 para categorías habituales si ninguna está habilitada aún
            $enabledCount = (int) $pdo->query("SELECT COUNT(*) FROM categories WHERE allows_extras = 1")->fetchColumn();
            if ($enabledCount === 0) {
                $pdo->exec("UPDATE categories SET allows_extras = 1 WHERE name REGEXP '(?i)(pizza|entrada|sangu|sandwich|burger|hamburguesa|lomo)'");
            }
        } catch (\Throwable) {}
    }

    /** GET /categories  (incluye cuántos productos activos tiene cada una) */
    public function index(Request $req): void
    {
        $stmt = Database::pdo()->prepare(
            'SELECT c.id, c.name, c.sort_order, c.is_active, COALESCE(c.allows_extras, 0) AS allows_extras, c.target_category_ids,
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
            $c['product_count']  = (int) $c['product_count'];
            $c['allows_extras']  = (int) $c['allows_extras'];
            $c['products_count'] = (int) $c['product_count'];
            if (!empty($c['target_category_ids'])) {
                $dec = json_decode($c['target_category_ids'], true);
                $c['target_category_ids'] = is_array($dec) ? array_values(array_map('intval', $dec)) : array_values(array_filter(array_map('intval', explode(',', $c['target_category_ids']))));
            } else {
                $c['target_category_ids'] = null;
            }
            return $c;
        }, $stmt->fetchAll());

        Response::ok(['categories' => $categories]);
    }

    /** PUT /categories/reorder   Body: { ids: [1, 2, 3] } o { category_ids: [...] } */
    public function reorder(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $ids = (array) ($req->input('ids') ?? $req->input('category_ids') ?? []);

        if (empty($ids)) {
            Response::error('Se requiere un array de ids de categorías', 422);
        }

        $pdo = Database::pdo();
        $stmt = $pdo->prepare('UPDATE categories SET sort_order = ? WHERE id = ? AND business_id = ?');
        foreach ($ids as $index => $id) {
            $stmt->execute([$index * 10, (int) $id, $bid]);
        }

        Response::ok(['reordered' => true]);
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

        $targetIds = $req->input('target_category_ids');
        $targetJson = is_array($targetIds) ? json_encode(array_values(array_unique(array_filter(array_map('intval', $targetIds))))) : null;

        $stmt = Database::pdo()->prepare(
            'INSERT INTO categories (business_id, name, sort_order, allows_extras, target_category_ids) VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([$bid, $name, (int) $req->input('sort_order', 0), (int) (bool) $req->input('allows_extras', 0), $targetJson]);
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

        $targetIds = $req->input('target_category_ids');
        $targetJson = null;
        if (is_array($targetIds)) {
            $intIds = array_values(array_unique(array_filter(array_map('intval', $targetIds))));
            $targetJson = json_encode($intIds);

            // Sincronizar allows_extras en las categorías destino para máxima coherencia
            $pdo = Database::pdo();
            if (!empty($intIds)) {
                $inP = implode(',', array_fill(0, count($intIds), '?'));
                $stmtEn = $pdo->prepare("UPDATE categories SET allows_extras = 1 WHERE business_id = ? AND id IN ($inP)");
                $stmtEn->execute(array_merge([$bid], $intIds));

                $stmtDis = $pdo->prepare("UPDATE categories SET allows_extras = 0 WHERE business_id = ? AND id NOT IN ($inP) AND id != ?");
                $stmtDis->execute(array_merge([$bid], $intIds, [$id]));
            } else {
                $stmtDis = $pdo->prepare("UPDATE categories SET allows_extras = 0 WHERE business_id = ? AND id != ?");
                $stmtDis->execute([$bid, $id]);
            }
        }

        $stmt = Database::pdo()->prepare(
            'UPDATE categories SET name = ?, sort_order = ?, is_active = ?, allows_extras = ?, target_category_ids = COALESCE(?, target_category_ids)
              WHERE id = ? AND business_id = ?'
        );
        $stmt->execute([
            $name,
            (int) $req->input('sort_order', 0),
            (int) (bool) $req->input('is_active', true),
            (int) (bool) $req->input('allows_extras', 0),
            $targetJson,
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
            'SELECT id, name, sort_order, is_active, COALESCE(allows_extras, 0) AS allows_extras, target_category_ids
               FROM categories WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$id, (int) $req->auth['business_id']]);
        $cat = $stmt->fetch();

        if (!$cat) {
            Response::error('Categoría no encontrada', 404);
        }

        $cat['id']            = (int) $cat['id'];
        $cat['sort_order']    = (int) $cat['sort_order'];
        $cat['is_active']     = (int) $cat['is_active'];
        $cat['allows_extras'] = (int) $cat['allows_extras'];
        if (!empty($cat['target_category_ids'])) {
            $dec = json_decode($cat['target_category_ids'], true);
            $cat['target_category_ids'] = is_array($dec) ? array_values(array_map('intval', $dec)) : array_values(array_filter(array_map('intval', explode(',', $cat['target_category_ids']))));
        } else {
            $cat['target_category_ids'] = null;
        }
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
