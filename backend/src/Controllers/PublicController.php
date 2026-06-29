<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Services\OrderService;

/**
 * Endpoints PÚBLICOS (sin token). El negocio se identifica por su slug.
 *
 * Solo exponen datos públicos (menú) y crean pedidos de canal 'web'. Los
 * precios SIEMPRE se toman del servidor, nunca del cliente. El pedido entra
 * como 'received' y no afecta stock ni facturación hasta que el local lo
 * confirme y concrete desde el panel.
 */
class PublicController
{
    private const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'mp', 'other'];

    private OrderService $orders;

    public function __construct()
    {
        $this->orders = new OrderService();
    }

    /** GET /public/{slug}/menu */
    public function menu(Request $req): void
    {
        $business = $this->businessBySlug((string) $req->param('slug'));
        $pdo      = Database::pdo();

        $cats = $pdo->prepare(
            'SELECT id, name, sort_order FROM categories
              WHERE business_id = ? AND is_active = 1
              ORDER BY sort_order, name'
        );
        $cats->execute([(int) $business['id']]);

        $prods = $pdo->prepare(
            'SELECT id, category_id, name, description, price, image_url
               FROM products
              WHERE business_id = ? AND is_active = 1
              ORDER BY name'
        );
        $prods->execute([(int) $business['id']]);

        Response::ok([
            'business' => [
                'name'    => $business['name'],
                'slug'    => $business['slug'],
                'phone'   => $business['phone'],
                'address' => $business['address'],
            ],
            'categories' => array_map(static fn(array $c): array => [
                'id'         => (int) $c['id'],
                'name'       => $c['name'],
                'sort_order' => (int) $c['sort_order'],
            ], $cats->fetchAll()),
            'products' => array_map(static fn(array $p): array => [
                'id'          => (int) $p['id'],
                'category_id' => $p['category_id'] !== null ? (int) $p['category_id'] : null,
                'name'        => $p['name'],
                'description' => $p['description'],
                'price'       => (float) $p['price'],
                'image_url'   => $p['image_url'],
            ], $prods->fetchAll()),
        ]);
    }

    /**
     * POST /public/{slug}/orders
     * Body: { customer_name, customer_phone, address?, payment_method?, notes?,
     *         items: [ { product_id, quantity, notes? } ] }
     */
    public function createOrder(Request $req): void
    {
        $business = $this->businessBySlug((string) $req->param('slug'));
        $bid      = (int) $business['id'];

        $name  = trim((string) $req->input('customer_name', ''));
        $phone = trim((string) $req->input('customer_phone', ''));
        if ($name === '' || $phone === '') {
            Response::error('Nombre y teléfono son obligatorios', 422);
        }

        $paymentMethod = $req->input('payment_method');
        if ($paymentMethod !== null && $paymentMethod !== '' && !in_array($paymentMethod, self::PAYMENT_METHODS, true)) {
            Response::error('Medio de pago inválido', 422);
        }
        $paymentMethod = ($paymentMethod === '' ? null : $paymentMethod);

        $items = $req->input('items');
        if (!is_array($items) || $items === []) {
            Response::error('El pedido debe tener al menos un ítem', 422);
        }

        $productIds = [];
        foreach ($items as $it) {
            $pid = (int) ($it['product_id'] ?? 0);
            $qty = $it['quantity'] ?? null;
            if ($pid <= 0 || !is_numeric($qty) || (float) $qty <= 0) {
                Response::error('Cada ítem necesita product_id y quantity mayor a 0', 422);
            }
            $productIds[] = $pid;
        }

        $products = $this->loadActiveProducts($bid, array_values(array_unique($productIds)));
        foreach (array_unique($productIds) as $pid) {
            if (!isset($products[$pid])) {
                Response::error('Hay un producto que ya no está disponible', 422);
            }
        }

        // Precios SIEMPRE del servidor (el cliente no puede manipularlos).
        $lines = [];
        foreach ($items as $it) {
            $pid       = (int) $it['product_id'];
            $qty       = (float) $it['quantity'];
            $product   = $products[$pid];
            $unitPrice = (float) $product['price'];
            $lineTotal = round($unitPrice * $qty, 2);
            $lines[]   = [
                'product_id'   => $pid,
                'product_name' => $product['name'],
                'unit_price'   => $unitPrice,
                'quantity'     => $qty,
                'line_total'   => $lineTotal,
                'notes'        => isset($it['notes']) ? (trim((string) $it['notes']) ?: null) : null,
            ];
        }

        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            // delivery_fee = 0: el envío lo define el local al confirmar.
            $orderId = $this->orders->create(
                $bid, 'web', $lines, 0.0, $name, $phone,
                trim((string) $req->input('address', '')) ?: null,
                $paymentMethod,
                trim((string) $req->input('notes', '')) ?: null,
                null
            );
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        $order = $this->orderSummary($bid, $orderId);
        Response::ok([
            'order'        => $order,
            'whatsapp_url' => $this->whatsappUrl($business, $order),
        ], 201);
    }

    // -----------------------------------------------------------------

    private function businessBySlug(string $slug): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, name, slug, phone, address FROM businesses
              WHERE slug = ? AND is_active = 1 LIMIT 1'
        );
        $stmt->execute([$slug]);
        $b = $stmt->fetch();

        if (!$b) {
            Response::error('Local no encontrado', 404);
        }
        return $b;
    }

    /** @param int[] $ids @return array<int, array> */
    private function loadActiveProducts(int $bid, array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = Database::pdo()->prepare(
            "SELECT id, name, price FROM products
              WHERE business_id = ? AND is_active = 1 AND id IN ($placeholders)"
        );
        $stmt->execute(array_merge([$bid], $ids));

        $map = [];
        foreach ($stmt->fetchAll() as $row) {
            $map[(int) $row['id']] = $row;
        }
        return $map;
    }

    private function orderSummary(int $bid, int $orderId): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, order_number, channel, status, customer_name, customer_phone,
                    address, total, created_at
               FROM orders WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$orderId, $bid]);
        $o = $stmt->fetch();

        $items = Database::pdo()->prepare(
            'SELECT product_name, unit_price, quantity, line_total
               FROM order_items WHERE order_id = ? ORDER BY id'
        );
        $items->execute([$orderId]);

        return [
            'id'            => (int) $o['id'],
            'order_number'  => (int) $o['order_number'],
            'status'        => $o['status'],
            'customer_name' => $o['customer_name'],
            'address'       => $o['address'],
            'total'         => (float) $o['total'],
            'items'         => array_map(static fn(array $i): array => [
                'product_name' => $i['product_name'],
                'unit_price'   => (float) $i['unit_price'],
                'quantity'     => (float) $i['quantity'],
                'line_total'   => (float) $i['line_total'],
            ], $items->fetchAll()),
        ];
    }

    /** Arma el link wa.me con el pedido pre-cargado. Usa el teléfono del local. */
    private function whatsappUrl(array $business, array $order): ?string
    {
        $number = preg_replace('/\D+/', '', (string) $business['phone']);
        if ($number === null || $number === '') {
            return null;
        }

        $lines = ["Hola! Quiero hacer un pedido en {$business['name']}:", ''];
        foreach ($order['items'] as $i) {
            $qty     = rtrim(rtrim(number_format($i['quantity'], 3, '.', ''), '0'), '.');
            $lines[] = '• ' . $qty . 'x ' . $i['product_name']
                . ' - $' . number_format($i['line_total'], 2, ',', '.');
        }
        $lines[] = '';
        $lines[] = 'Total: $' . number_format($order['total'], 2, ',', '.');
        $lines[] = 'Nombre: ' . $order['customer_name'];
        if (!empty($order['address'])) {
            $lines[] = 'Dirección: ' . $order['address'];
        }
        $lines[] = 'Pedido #' . $order['order_number'];

        return 'https://wa.me/' . $number . '?text=' . rawurlencode(implode("\n", $lines));
    }
}
