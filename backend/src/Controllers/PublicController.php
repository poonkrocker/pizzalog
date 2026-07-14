<?php
namespace Pizzalog\Controllers;

use DateTimeImmutable;
use Pizzalog\Core\Database;
use Pizzalog\Core\ProductVisibility;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Repositories\BusinessRepository;
use Pizzalog\Repositories\ComboRepository;
use Pizzalog\Repositories\VariantRepository;
use Pizzalog\Services\OrderService;

/**
 * Endpoints PÚBLICOS (sin token). El negocio se identifica por su slug.
 *
 * Solo exponen datos públicos (menú) y crean pedidos de canal 'web'. Los
 * precios SIEMPRE se toman del servidor, nunca del cliente. El pedido entra
 * como 'received' y no afecta stock ni facturación hasta que el local lo
 * confirme y concrete desde el panel.
 *
 * Visibilidad (migración 011):
 *   - show_online = 0  → no sale nunca por acá (existe solo para el TPV/salón).
 *   - is_secret = 1    → no sale en /menu, sí en /menu/secreta.
 *   - visible_days/from/until → `is_available_now`; se sigue mostrando, pero
 *     atenuado, y el checkout lo rechaza.
 * Horario (migración 012): gatea el PEDIDO, no la carta.
 */
class PublicController
{
    private const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'mp', 'other'];

    private const BUSINESS_FIELDS = 'id, name, slug, phone, address, google_maps_url, description,
                                     logo_url, theme, accepts_online_orders';

    private const PRODUCT_FIELDS = 'id, category_id, sort_order, name, description, price, image_url,
                                    has_variants, is_combo, is_open_price, is_vegan_opt, badge_text,
                                    visible_days, visible_from, visible_until';

    private OrderService $orders;
    private VariantRepository $variants;
    private ComboRepository $combos;
    private BusinessRepository $businesses;

    public function __construct()
    {
        $this->orders     = new OrderService();
        $this->variants   = new VariantRepository();
        $this->combos     = new ComboRepository();
        $this->businesses = new BusinessRepository();
    }

    /** GET /public/{slug}/menu */
    public function menu(Request $req): void
    {
        $this->respondMenu((string) $req->param('slug'), false);
    }

    /**
     * GET /public/{slug}/menu/secreta
     * Solo los productos con is_secret = 1. Mismo shape que menu(). No se
     * linkea desde la carta pública: es un link que se comparte por fuera.
     */
    public function secretMenu(Request $req): void
    {
        $this->respondMenu((string) $req->param('slug'), true);
    }

    private function respondMenu(string $slug, bool $secret): void
    {
        $business = $this->businessBySlug($slug);
        $bid      = (int) $business['id'];
        $now      = new DateTimeImmutable('now');
        $pdo      = Database::pdo();

        $cats = $pdo->prepare(
            'SELECT id, name, sort_order FROM categories
              WHERE business_id = ? AND is_active = 1
              ORDER BY sort_order, name'
        );
        $cats->execute([$bid]);

        $prods = $pdo->prepare(
            'SELECT ' . self::PRODUCT_FIELDS . '
               FROM products
              WHERE business_id = ? AND is_active = 1 AND show_online = 1 AND is_secret = ?
              ORDER BY sort_order ASC, id ASC'
        );
        $prods->execute([$bid, $secret ? 1 : 0]);

        Response::ok([
            'business' => [
                'name'              => $business['name'],
                'slug'              => $business['slug'],
                'phone'             => $business['phone'],
                'address'           => $business['address'],
                'google_maps_url'   => $business['google_maps_url'],
                'description'       => $business['description'],
                'logo_url'          => $business['logo_url'],
                'theme'             => $business['theme'] !== null
                    ? json_decode((string) $business['theme'], true)
                    : null,
                'social_links'      => array_map(static fn (array $l): array => [
                    'platform' => $l['platform'],
                    'url'      => $l['url'],
                ], $this->businesses->socialLinks($bid)),
                'is_open_for_orders' => $this->businesses->isOpenForOrders($business, $now),
            ],
            'categories' => array_map(static fn (array $c): array => [
                'id'         => (int) $c['id'],
                'name'       => $c['name'],
                'sort_order' => (int) $c['sort_order'],
            ], $cats->fetchAll()),
            'products' => $this->buildMenuProducts($bid, $prods->fetchAll(), $now),
        ]);
    }

    private function buildMenuProducts(int $bid, array $rows, DateTimeImmutable $now): array
    {
        $out = [];
        foreach ($rows as $p) {
            $item = [
                'id'               => (int) $p['id'],
                'category_id'      => $p['category_id'] !== null ? (int) $p['category_id'] : null,
                'sort_order'       => (int) $p['sort_order'],
                'name'             => $p['name'],
                'description'      => $p['description'],
                'price'            => (float) $p['price'],
                'image_url'        => $p['image_url'],
                'has_variants'     => (int) $p['has_variants'],
                'is_combo'         => (int) $p['is_combo'],
                'is_open_price'    => (int) $p['is_open_price'],
                'is_vegan_opt'     => (int) $p['is_vegan_opt'],
                'badge_text'       => $p['badge_text'],
                'is_available_now' => ProductVisibility::isVisibleNow($p, $now),
            ];
            if ((int) $p['has_variants'] === 1) {
                $data = $this->variants->forProduct($bid, (int) $p['id']);
                $item['options']  = $data['options'];
                $item['variants'] = $data['variants'];
            }
            if ((int) $p['is_combo'] === 1) {
                $item['combo'] = $this->combos->forProduct($bid, (int) $p['id']);
            }
            $out[] = $item;
        }
        return $out;
    }

    /**
     * POST /public/{slug}/orders
     * Body: { customer_name, customer_phone, address?, payment_method?, notes?,
     *         items: [ { product_id, quantity, notes?,
     *                    combo_selections?: [{ group_id, product_ids: number[] }] } ] }
     */
    public function createOrder(Request $req): void
    {
        $business = $this->businessBySlug((string) $req->param('slug'));
        $bid      = (int) $business['id'];
        $now      = new DateTimeImmutable('now');

        // El horario gatea en el SERVIDOR, no solo en la UI: la carta se puede
        // seguir viendo y el WhatsApp manual sigue andando, pero el checkout no.
        if (!$this->businesses->isOpenForOrders($business, $now)) {
            Response::error('El local no está aceptando pedidos en este momento', 422);
        }

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

        $products = $this->loadOrderableProducts($bid, array_values(array_unique($productIds)));
        foreach (array_unique($productIds) as $pid) {
            if (!isset($products[$pid])) {
                Response::error('Hay un producto que ya no está disponible', 422);
            }
            if (!ProductVisibility::isVisibleNow($products[$pid], $now)) {
                Response::error(
                    sprintf('"%s" no está disponible en este horario', $products[$pid]['name']),
                    422
                );
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

            $selections = $it['combo_selections'] ?? null;
            if ((int) $product['is_combo'] === 1 && !is_array($selections)) {
                Response::error(sprintf('Elegí las opciones de "%s"', $product['name']), 422);
            }

            $lines[] = [
                'product_id'       => $pid,
                'product_name'     => $product['name'],
                'unit_price'       => $unitPrice,
                'quantity'         => $qty,
                'line_total'       => $lineTotal,
                'notes'            => isset($it['notes']) ? (trim((string) $it['notes']) ?: null) : null,
                'combo_selections' => is_array($selections) ? $selections : null,
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
        } catch (\DomainException $e) {
            $pdo->rollBack();
            Response::error($e->getMessage(), 422);
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
            'SELECT ' . self::BUSINESS_FIELDS . '
               FROM businesses
              WHERE slug = ? AND is_active = 1 LIMIT 1'
        );
        $stmt->execute([$slug]);
        $b = $stmt->fetch();

        if (!$b) {
            Response::error('Local no encontrado', 404);
        }
        return $b;
    }

    /**
     * Pedibles por web: activos y con show_online = 1. Los secretos SÍ se
     * pueden pedir (para eso se comparte el link), los ocultos no.
     *
     * @param int[] $ids @return array<int, array>
     */
    private function loadOrderableProducts(int $bid, array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = Database::pdo()->prepare(
            "SELECT id, name, price, is_combo, visible_days, visible_from, visible_until
               FROM products
              WHERE business_id = ? AND is_active = 1 AND show_online = 1
                AND id IN ($placeholders)"
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
            'SELECT product_name, unit_price, quantity, line_total, parent_order_item_id
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
            'items'         => array_map(static fn (array $i): array => [
                'product_name' => $i['product_name'],
                'unit_price'   => (float) $i['unit_price'],
                'quantity'     => (float) $i['quantity'],
                'line_total'   => (float) $i['line_total'],
                'is_child'     => $i['parent_order_item_id'] !== null,
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
            $qty = rtrim(rtrim(number_format($i['quantity'], 3, '.', ''), '0'), '.');
            // Las líneas hijas del combo van indentadas y sin precio.
            $lines[] = $i['is_child']
                ? '   ↳ ' . $qty . 'x ' . $i['product_name']
                : '• ' . $qty . 'x ' . $i['product_name']
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
