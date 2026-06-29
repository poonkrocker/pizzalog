<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Repositories\StockRepository;

/**
 * Inventario (stock simple por unidad).
 *
 * Reutiliza StockRepository, el mismo motor que descuenta stock en las ventas,
 * así que todo (ventas, reposiciones, ajustes) queda en un único historial
 * auditable: stock_movements. Solo aplica a productos con track_stock = 1.
 */
class InventoryController
{
    private StockRepository $stock;

    public function __construct()
    {
        $this->stock = new StockRepository();
    }

    /** GET /inventory/stock — productos que controlan stock */
    public function stock(Request $req): void
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, name, stock_quantity, stock_min, is_active
               FROM products
              WHERE business_id = ? AND track_stock = 1
              ORDER BY name'
        );
        $stmt->execute([(int) $req->auth['business_id']]);
        Response::ok(['products' => array_map([$this, 'castStock'], $stmt->fetchAll())]);
    }

    /** GET /inventory/low-stock — en o por debajo del mínimo (para alertas) */
    public function lowStock(Request $req): void
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, name, stock_quantity, stock_min, is_active
               FROM products
              WHERE business_id = ? AND track_stock = 1 AND is_active = 1
                AND stock_quantity <= stock_min
              ORDER BY (stock_quantity - stock_min), name'
        );
        $stmt->execute([(int) $req->auth['business_id']]);
        Response::ok(['products' => array_map([$this, 'castStock'], $stmt->fetchAll())]);
    }

    /** POST /inventory/restock   { product_id, quantity, reason? }  — entró mercadería */
    public function restock(Request $req): void
    {
        $bid     = (int) $req->auth['business_id'];
        $product = $this->trackedProduct($req, (int) $req->input('product_id', 0));

        $qty = $req->input('quantity');
        if (!is_numeric($qty) || (int) $qty <= 0) {
            Response::error('La cantidad debe ser un entero mayor a 0', 422);
        }

        $reason = trim((string) $req->input('reason', '')) ?: 'Reposición';
        $this->run($bid, (int) $product['id'], 'restock', (int) $qty, $reason, (int) $req->auth['user_id']);

        Response::ok(['product' => $this->castStock($this->reload($bid, (int) $product['id']))], 201);
    }

    /** POST /inventory/adjustment   { product_id, quantity_change, reason }  — rotura, vencimiento... */
    public function adjustment(Request $req): void
    {
        $bid     = (int) $req->auth['business_id'];
        $product = $this->trackedProduct($req, (int) $req->input('product_id', 0));

        $delta = $req->input('quantity_change');
        if (!is_numeric($delta) || (int) $delta === 0) {
            Response::error('quantity_change debe ser un entero distinto de 0 (negativo descuenta)', 422);
        }

        $reason = trim((string) $req->input('reason', ''));
        if ($reason === '') {
            Response::error('El motivo del ajuste es obligatorio', 422);
        }

        $this->run($bid, (int) $product['id'], 'adjustment', (int) $delta, $reason, (int) $req->auth['user_id']);
        Response::ok(['product' => $this->castStock($this->reload($bid, (int) $product['id']))], 201);
    }

    /** POST /inventory/count   { product_id, counted_quantity, reason? }  — recuento físico */
    public function count(Request $req): void
    {
        $bid     = (int) $req->auth['business_id'];
        $product = $this->trackedProduct($req, (int) $req->input('product_id', 0));

        $counted = $req->input('counted_quantity');
        if (!is_numeric($counted) || (int) $counted < 0) {
            Response::error('counted_quantity debe ser un entero positivo o cero', 422);
        }
        $counted = (int) $counted;
        $delta   = $counted - (int) $product['stock_quantity'];

        // Registramos el ajuste solo si el recuento difiere del stock actual.
        if ($delta !== 0) {
            $reason = trim((string) $req->input('reason', '')) ?: 'sin observaciones';
            $this->run(
                $bid, (int) $product['id'], 'adjustment', $delta,
                'Recuento físico (' . $reason . ')', (int) $req->auth['user_id']
            );
        }

        Response::ok(['product' => $this->castStock($this->reload($bid, (int) $product['id']))]);
    }

    /** GET /inventory/movements?product_id=&type=&from=&to=&limit=&offset= */
    public function movements(Request $req): void
    {
        $where  = ['sm.business_id = ?'];
        $params = [(int) $req->auth['business_id']];

        if (!empty($req->query['product_id'])) {
            $where[]  = 'sm.product_id = ?';
            $params[] = (int) $req->query['product_id'];
        }
        if (!empty($req->query['type']) && in_array($req->query['type'], ['sale', 'restock', 'adjustment'], true)) {
            $where[]  = 'sm.type = ?';
            $params[] = $req->query['type'];
        }
        if (!empty($req->query['from'])) {
            $where[]  = 'sm.created_at >= ?';
            $params[] = $req->query['from'] . ' 00:00:00';
        }
        if (!empty($req->query['to'])) {
            $where[]  = 'sm.created_at <= ?';
            $params[] = $req->query['to'] . ' 23:59:59';
        }

        $limit  = min(max((int) ($req->query['limit'] ?? 100), 1), 500);
        $offset = max((int) ($req->query['offset'] ?? 0), 0);

        $sql = 'SELECT sm.id, sm.product_id, p.name AS product_name, sm.type,
                       sm.quantity_change, sm.reason, sm.sale_id,
                       sm.created_by, u.name AS created_by_name, sm.created_at
                  FROM stock_movements sm
             LEFT JOIN products p ON p.id = sm.product_id
             LEFT JOIN users u ON u.id = sm.created_by
                 WHERE ' . implode(' AND ', $where) . '
                 ORDER BY sm.created_at DESC, sm.id DESC
                 LIMIT ' . $limit . ' OFFSET ' . $offset;

        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);

        Response::ok(['movements' => array_map(static fn(array $r): array => [
            'id'              => (int) $r['id'],
            'product_id'      => $r['product_id'] !== null ? (int) $r['product_id'] : null,
            'product_name'    => $r['product_name'],
            'type'            => $r['type'],
            'quantity_change' => (int) $r['quantity_change'],
            'reason'          => $r['reason'],
            'sale_id'         => $r['sale_id'] !== null ? (int) $r['sale_id'] : null,
            'created_by'      => $r['created_by'] !== null ? (int) $r['created_by'] : null,
            'created_by_name' => $r['created_by_name'],
            'created_at'      => $r['created_at'],
        ], $stmt->fetchAll())]);
    }

    // -----------------------------------------------------------------

    private function run(int $bid, int $productId, string $type, int $delta, string $reason, int $userId): void
    {
        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            $this->stock->applyMovement($bid, $productId, $type, $delta, null, $userId, $reason);
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    private function trackedProduct(Request $req, int $productId): array
    {
        if ($productId <= 0) {
            Response::error('product_id es obligatorio', 422);
        }
        $stmt = Database::pdo()->prepare(
            'SELECT id, name, stock_quantity, stock_min, track_stock
               FROM products WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$productId, (int) $req->auth['business_id']]);
        $product = $stmt->fetch();

        if (!$product) {
            Response::error('Producto no encontrado', 404);
        }
        if ((int) $product['track_stock'] !== 1) {
            Response::error('Este producto no controla stock. Activá el control de stock para gestionarlo.', 422);
        }
        return $product;
    }

    private function reload(int $bid, int $id): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, name, stock_quantity, stock_min, is_active
               FROM products WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $bid]);
        return $stmt->fetch();
    }

    private function castStock(array $p): array
    {
        return [
            'id'             => (int) $p['id'],
            'name'           => $p['name'],
            'stock_quantity' => (int) $p['stock_quantity'],
            'stock_min'      => (int) $p['stock_min'],
            'is_active'      => isset($p['is_active']) ? (int) $p['is_active'] : null,
            'below_min'      => (int) $p['stock_quantity'] <= (int) $p['stock_min'],
        ];
    }
}
