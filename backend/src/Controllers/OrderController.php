<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Services\OrderService;
use Pizzalog\Services\SaleService;

/**
 * Pedidos de delivery, agnósticos al canal.
 *
 * Ciclo de vida: received → confirmed → preparing → on_the_way → delivered.
 * 'cancelled' es alcanzable desde cualquier estado no final.
 * El pedido NO toca stock ni facturación hasta concretarse: al "completar"
 * genera una venta (vía SaleService) con el canal correspondiente y, recién
 * ahí, descuenta stock. Así un pedido cancelado no afecta reportes ni stock.
 */
class OrderController
{
    private const CHANNELS = ['web', 'whatsapp', 'pedidosya', 'rappi', 'phone', 'counter'];
    private const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'mp', 'other'];

    /** Orden del flujo; sirve para validar que el estado solo avance. */
    private const FLOW = [
        'received'   => 0,
        'confirmed'  => 1,
        'preparing'  => 2,
        'on_the_way' => 3,
        'delivered'  => 4,
    ];

    private SaleService $sales;
    private OrderService $orders;

    public function __construct()
    {
        $this->sales  = new SaleService();
        $this->orders = new OrderService();
    }

    /** GET /orders?status=&channel=&from=&to=&limit=&offset= */
    public function index(Request $req): void
    {
        $where  = ['o.business_id = ?'];
        $params = [(int) $req->auth['business_id']];

        if (!empty($req->query['status'])) {
            $where[]  = 'o.status = ?';
            $params[] = $req->query['status'];
        }
        if (!empty($req->query['channel'])) {
            $where[]  = 'o.channel = ?';
            $params[] = $req->query['channel'];
        }
        if (!empty($req->query['from'])) {
            $where[]  = 'o.created_at >= ?';
            $params[] = $req->query['from'] . ' 00:00:00';
        }
        if (!empty($req->query['to'])) {
            $where[]  = 'o.created_at <= ?';
            $params[] = $req->query['to'] . ' 23:59:59';
        }

        $limit  = min(max((int) ($req->query['limit'] ?? 100), 1), 300);
        $offset = max((int) ($req->query['offset'] ?? 0), 0);

        $sql = 'SELECT o.id, o.order_number, o.channel, o.status, o.customer_name,
                       o.customer_phone, o.address, o.delivery_fee, o.items_total,
                       o.total, o.payment_method, o.notes, o.sale_id, o.created_at
                  FROM orders o
                 WHERE ' . implode(' AND ', $where) . '
                 ORDER BY o.created_at DESC
                 LIMIT ' . $limit . ' OFFSET ' . $offset;

        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        Response::ok(['orders' => array_map([$this, 'castOrder'], $stmt->fetchAll())]);
    }

    /** GET /orders/{id} */
    public function show(Request $req): void
    {
        $order = $this->findOwned((int) $req->auth['business_id'], (int) $req->param('id'));
        Response::ok(['order' => $this->withItems($order)]);
    }

    /**
     * POST /orders
     * Body: { channel, customer_name?, customer_phone?, address?, delivery_fee?,
     *         payment_method?, notes?, items: [ { product_id, quantity, unit_price?, notes? } ] }
     */
    public function store(Request $req): void
    {
        $bid    = (int) $req->auth['business_id'];
        $userId = (int) $req->auth['user_id'];

        $channel = (string) $req->input('channel', 'phone');
        if (!in_array($channel, self::CHANNELS, true)) {
            Response::error('Canal inválido', 422);
        }

        $paymentMethod = $req->input('payment_method');
        if ($paymentMethod !== null && $paymentMethod !== '' && !in_array($paymentMethod, self::PAYMENT_METHODS, true)) {
            Response::error('Medio de pago inválido', 422);
        }
        $paymentMethod = ($paymentMethod === '' ? null : $paymentMethod);

        $deliveryFee = $req->input('delivery_fee', 0);
        if (!is_numeric($deliveryFee) || (float) $deliveryFee < 0) {
            Response::error('El costo de envío debe ser un número positivo', 422);
        }
        $deliveryFee = (float) $deliveryFee;

        $items = $req->input('items');
        if (!is_array($items) || $items === []) {
            Response::error('El pedido debe tener al menos un ítem', 422);
        }

        // Validar ítems y cargar productos.
        $productIds = [];
        foreach ($items as $it) {
            $pid = (int) ($it['product_id'] ?? 0);
            $qty = $it['quantity'] ?? null;
            if ($pid <= 0 || !is_numeric($qty) || (float) $qty <= 0) {
                Response::error('Cada ítem necesita product_id y quantity mayor a 0', 422);
            }
            $productIds[] = $pid;
        }
        $products = $this->loadProducts($bid, array_values(array_unique($productIds)));
        foreach (array_unique($productIds) as $pid) {
            if (!isset($products[$pid])) {
                Response::error("El producto #$pid no existe en este negocio", 422);
            }
        }

        $lines      = [];
        $itemsTotal = 0.0;
        foreach ($items as $it) {
            $pid       = (int) $it['product_id'];
            $qty       = (float) $it['quantity'];
            $product   = $products[$pid];
            $unitPrice = (isset($it['unit_price']) && is_numeric($it['unit_price']))
                ? (float) $it['unit_price']
                : (float) $product['price'];
            $lineTotal  = round($unitPrice * $qty, 2);
            $itemsTotal += $lineTotal;
            $lines[]    = [
                'product_id'   => $pid,
                'product_name' => $product['name'],
                'unit_price'   => $unitPrice,
                'quantity'     => $qty,
                'line_total'   => $lineTotal,
                'notes'        => isset($it['notes']) ? (trim((string) $it['notes']) ?: null) : null,
            ];
        }
        $itemsTotal = round($itemsTotal, 2);
        $total      = round($itemsTotal + $deliveryFee, 2);

        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            $orderId = $this->orders->create(
                $bid, $channel, $lines, $deliveryFee,
                trim((string) $req->input('customer_name', '')) ?: null,
                trim((string) $req->input('customer_phone', '')) ?: null,
                trim((string) $req->input('address', '')) ?: null,
                $paymentMethod,
                trim((string) $req->input('notes', '')) ?: null,
                $userId
            );
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        Response::ok(['order' => $this->withItems($this->findOwned($bid, $orderId))], 201);
    }

    /** PUT /orders/{id}/status   Body: { status }  (avanzar el flujo o cancelar) */
    public function updateStatus(Request $req): void
    {
        $bid   = (int) $req->auth['business_id'];
        $id    = (int) $req->param('id');
        $order = $this->findOwned($bid, $id);

        $status = (string) $req->input('status', '');

        if ($status === 'delivered') {
            Response::error('Para concretar el pedido usá /orders/{id}/complete', 422);
        }
        if ($status === 'cancelled') {
            $this->doCancel($bid, $id, $order);
            Response::ok(['order' => $this->withItems($this->findOwned($bid, $id))]);
        }
        if (!isset(self::FLOW[$status])) {
            Response::error('Estado inválido', 422);
        }
        if (in_array($order['status'], ['delivered', 'cancelled'], true)) {
            Response::error('El pedido ya está finalizado', 422);
        }
        if (self::FLOW[$status] <= self::FLOW[$order['status']]) {
            Response::error('El estado solo puede avanzar', 422);
        }

        Database::pdo()
            ->prepare('UPDATE orders SET status = ? WHERE id = ? AND business_id = ?')
            ->execute([$status, $id, $bid]);

        Response::ok(['order' => $this->withItems($this->findOwned($bid, $id))]);
    }

    /**
     * POST /orders/{id}/complete   Body: { payment_method? }
     * Concreta el pedido: genera la venta (con el canal del pedido), descuenta
     * stock y lo marca como entregado. El costo de envío entra como una línea.
     */
    public function complete(Request $req): void
    {
        $bid    = (int) $req->auth['business_id'];
        $userId = (int) $req->auth['user_id'];
        $id     = (int) $req->param('id');
        $order  = $this->findOwned($bid, $id);

        if ($order['status'] === 'cancelled') {
            Response::error('El pedido está cancelado', 422);
        }
        if ($order['sale_id'] !== null) {
            Response::error('El pedido ya fue concretado', 422);
        }

        $paymentMethod = (string) ($req->input('payment_method') ?: $order['payment_method'] ?: 'cash');
        if (!in_array($paymentMethod, self::PAYMENT_METHODS, true)) {
            Response::error('Medio de pago inválido', 422);
        }

        // Cargar ítems del pedido + el track_stock actual de cada producto.
        $stmt = Database::pdo()->prepare(
            'SELECT oi.product_id, oi.product_name, oi.unit_price, oi.quantity, oi.line_total,
                    p.track_stock
               FROM order_items oi
          LEFT JOIN products p ON p.id = oi.product_id
              WHERE oi.order_id = ?'
        );
        $stmt->execute([$id]);

        $lines = [];
        foreach ($stmt->fetchAll() as $r) {
            $lines[] = [
                'product_id'   => $r['product_id'] !== null ? (int) $r['product_id'] : null,
                'product_name' => $r['product_name'],
                'unit_price'   => (float) $r['unit_price'],
                'quantity'     => (float) $r['quantity'],
                'line_total'   => (float) $r['line_total'],
                'track_stock'  => (int) ($r['track_stock'] ?? 0) === 1,
            ];
        }

        // El costo de envío se factura como una línea más (sin producto, sin stock).
        if ((float) $order['delivery_fee'] > 0) {
            $lines[] = [
                'product_id'   => null,
                'product_name' => 'Envío',
                'unit_price'   => (float) $order['delivery_fee'],
                'quantity'     => 1.0,
                'line_total'   => (float) $order['delivery_fee'],
                'track_stock'  => false,
            ];
        }

        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            $saleId = $this->sales->create(
                $bid, $userId, $lines, $paymentMethod, 0.0,
                $order['channel'], null, null,
                'Pedido #' . $order['order_number']
            );

            $pdo->prepare(
                'UPDATE orders SET status = "delivered", sale_id = ?, payment_method = ?
                  WHERE id = ? AND business_id = ?'
            )->execute([$saleId, $paymentMethod, $id, $bid]);

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        Response::ok([
            'order'   => $this->withItems($this->findOwned($bid, $id)),
            'sale_id' => $saleId,
        ]);
    }

    /** POST /orders/{id}/cancel */
    public function cancel(Request $req): void
    {
        $bid   = (int) $req->auth['business_id'];
        $id    = (int) $req->param('id');
        $order = $this->findOwned($bid, $id);
        $this->doCancel($bid, $id, $order);

        Response::ok(['order' => $this->withItems($this->findOwned($bid, $id))]);
    }

    // -----------------------------------------------------------------

    private function doCancel(int $bid, int $id, array $order): void
    {
        if ($order['status'] === 'delivered' || $order['sale_id'] !== null) {
            Response::error('No se puede cancelar un pedido ya concretado', 422);
        }
        if ($order['status'] === 'cancelled') {
            Response::error('El pedido ya está cancelado', 422);
        }
        Database::pdo()
            ->prepare('UPDATE orders SET status = "cancelled" WHERE id = ? AND business_id = ?')
            ->execute([$id, $bid]);
    }

    private function findOwned(int $bid, int $id): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, order_number, channel, status, customer_name, customer_phone, address,
                    delivery_fee, items_total, total, payment_method, notes, sale_id, created_at
               FROM orders WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $bid]);
        $order = $stmt->fetch();

        if (!$order) {
            Response::error('Pedido no encontrado', 404);
        }
        return $order;
    }

    private function withItems(array $order): array
    {
        $order = $this->castOrder($order);
        $stmt  = Database::pdo()->prepare(
            'SELECT id, product_id, product_name, unit_price, quantity, line_total, notes
               FROM order_items WHERE order_id = ? ORDER BY id'
        );
        $stmt->execute([(int) $order['id']]);

        $order['items'] = array_map(static function (array $i): array {
            $i['id']         = (int) $i['id'];
            $i['product_id'] = $i['product_id'] !== null ? (int) $i['product_id'] : null;
            $i['unit_price'] = (float) $i['unit_price'];
            $i['quantity']   = (float) $i['quantity'];
            $i['line_total'] = (float) $i['line_total'];
            return $i;
        }, $stmt->fetchAll());

        return $order;
    }

    private function castOrder(array $o): array
    {
        $o['id']           = (int) $o['id'];
        $o['order_number'] = $o['order_number'] !== null ? (int) $o['order_number'] : null;
        $o['sale_id']      = $o['sale_id'] !== null ? (int) $o['sale_id'] : null;
        foreach (['delivery_fee', 'items_total', 'total'] as $k) {
            $o[$k] = (float) $o[$k];
        }
        return $o;
    }

    /** @param int[] $ids @return array<int, array> */
    private function loadProducts(int $bid, array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = Database::pdo()->prepare(
            "SELECT id, name, price, track_stock
               FROM products WHERE business_id = ? AND id IN ($placeholders)"
        );
        $stmt->execute(array_merge([$bid], $ids));

        $map = [];
        foreach ($stmt->fetchAll() as $row) {
            $map[(int) $row['id']] = $row;
        }
        return $map;
    }
}
