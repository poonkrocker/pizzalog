<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Repositories\StockRepository;
use Pizzalog\Services\SaleService;

class SaleController
{
    private const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'mp', 'other'];

    private StockRepository $stock;
    private SaleService $sales;

    public function __construct()
    {
        $this->stock = new StockRepository();
        $this->sales = new SaleService();
    }

    /** GET /sales?from=YYYY-MM-DD&to=YYYY-MM-DD&channel=&limit=&offset= */
    public function index(Request $req): void
    {
        $where  = ['s.business_id = ?'];
        $params = [(int) $req->auth['business_id']];

        $from = $req->query['from'] ?? null;
        $to   = $req->query['to'] ?? null;
        if ($from) {
            $where[]  = 's.created_at >= ?';
            $params[] = $from . ' 00:00:00';
        }
        if ($to) {
            $where[]  = 's.created_at <= ?';
            $params[] = $to . ' 23:59:59';
        }
        if (!empty($req->query['channel'])) {
            $where[]  = 's.channel = ?';
            $params[] = $req->query['channel'];
        }

        $limit  = min(max((int) ($req->query['limit'] ?? 50), 1), 200);
        $offset = max((int) ($req->query['offset'] ?? 0), 0);

        $sql = 'SELECT s.id, s.sale_number, s.user_id, u.name AS user_name,
                       s.subtotal, s.discount, s.total, s.payment_method, s.channel,
                       s.status, s.created_at
                  FROM sales s
                  LEFT JOIN users u ON u.id = s.user_id
                 WHERE ' . implode(' AND ', $where) . '
                 ORDER BY s.created_at DESC
                 LIMIT ' . $limit . ' OFFSET ' . $offset;

        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);

        Response::ok(['sales' => array_map([$this, 'castSale'], $stmt->fetchAll())]);
    }

    /** GET /sales/{id} */
    public function show(Request $req): void
    {
        $sale = $this->findOwnedById((int) $req->auth['business_id'], (int) $req->param('id'));
        Response::ok(['sale' => $this->withItems($sale)]);
    }

    /**
     * POST /sales  (venta directa de mostrador)
     * Body: {
     *   client_uuid?, payment_method?, discount?, note?, cash_session_id?,
     *   items: [ { product_id, quantity, unit_price? }, ... ]
     * }
     */
    public function store(Request $req): void
    {
        $bid    = (int) $req->auth['business_id'];
        $userId = (int) $req->auth['user_id'];

        $items = $req->input('items');
        if (!is_array($items) || $items === []) {
            Response::error('La venta debe tener al menos un ítem', 422);
        }

        $paymentMethod = (string) $req->input('payment_method', 'cash');
        if (!in_array($paymentMethod, self::PAYMENT_METHODS, true)) {
            Response::error('Medio de pago inválido', 422);
        }

        $discount = $req->input('discount', 0);
        if (!is_numeric($discount) || (float) $discount < 0) {
            Response::error('El descuento debe ser un número positivo', 422);
        }
        $discount = (float) $discount;

        $clientUuid = $req->input('client_uuid');
        $clientUuid = (is_string($clientUuid) && $clientUuid !== '') ? $clientUuid : null;

        // Idempotencia para reintentos de sincronización offline.
        if ($clientUuid !== null) {
            $dup = $this->findByUuid($bid, $clientUuid);
            if ($dup) {
                Response::ok(['sale' => $this->withItems($dup), 'idempotent' => true]);
            }
        }

        $cashSessionId = $req->input('cash_session_id');
        $cashSessionId = ($cashSessionId === null || $cashSessionId === '') ? null : (int) $cashSessionId;
        if ($cashSessionId !== null && !$this->openSessionBelongs($bid, $cashSessionId)) {
            Response::error('La sesión de caja no existe o está cerrada', 422);
        }

        // Canal de la venta (mostrador, para llevar, delivery propio…).
        $channel = (string) $req->input('channel', 'counter');
        $allowedChannels = ['counter', 'takeaway', 'delivery', 'web', 'whatsapp', 'pedidosya', 'rappi', 'phone', 'dine_in'];
        if (!in_array($channel, $allowedChannels, true)) {
            Response::error('Canal de venta inválido', 422);
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

        // Cargar variantes referenciadas, para tomar su precio y etiqueta.
        $variantIds = [];
        foreach ($items as $it) {
            if (isset($it['variant_id']) && (int) $it['variant_id'] > 0) {
                $variantIds[] = (int) $it['variant_id'];
            }
        }
        $variants = $this->loadVariants($bid, array_values(array_unique($variantIds)));

        // Armar líneas con snapshots de nombre y precio.
        $lines    = [];
        $subtotal = 0.0;
        foreach ($items as $it) {
            $pid     = (int) $it['product_id'];
            $qty     = (float) $it['quantity'];
            $product = $products[$pid];

            $variantId   = null;
            $productName = $product['name'];

            if ((int) $product['has_variants'] === 1) {
                // Producto con variantes: hay que elegir una válida.
                $vid = (int) ($it['variant_id'] ?? 0);
                if ($vid <= 0 || !isset($variants[$vid]) || (int) $variants[$vid]['product_id'] !== $pid) {
                    Response::error("Elegí una variante válida para «{$product['name']}»", 422);
                }
                $variantId   = $vid;
                $unitPrice   = (float) $variants[$vid]['price'];
                $productName = $product['name'] . ' — ' . $variants[$vid]['label'];
            } elseif ((int) $product['is_open_price'] === 1) {
                // Precio abierto: el monto lo define el cajero al vender.
                if (!isset($it['unit_price']) || !is_numeric($it['unit_price']) || (float) $it['unit_price'] <= 0) {
                    Response::error("Ingresá el precio de «{$product['name']}»", 422);
                }
                $unitPrice = (float) $it['unit_price'];
            } else {
                // Producto normal.
                $unitPrice = (isset($it['unit_price']) && is_numeric($it['unit_price']))
                    ? (float) $it['unit_price']
                    : (float) $product['price'];
            }

            $lineTotal = round($unitPrice * $qty, 2);
            $subtotal += $lineTotal;
            $lines[]   = [
                'product_id'   => $pid,
                'variant_id'   => $variantId,
                'product_name' => $productName,
                'unit_price'   => $unitPrice,
                'quantity'     => $qty,
                'line_total'   => $lineTotal,
                'track_stock'  => (int) $product['track_stock'] === 1,
            ];
        }
        if ($discount > round($subtotal, 2)) {
            Response::error('El descuento no puede superar el subtotal', 422);
        }

        $note = trim((string) $req->input('note', '')) ?: null;

        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            $saleId = $this->sales->create(
                $bid, $userId, $lines, $paymentMethod, $discount,
                $channel, $cashSessionId, $clientUuid, $note
            );
            $pdo->commit();
        } catch (\PDOException $e) {
            $pdo->rollBack();
            if ($clientUuid !== null && $e->getCode() === '23000') {
                $dup = $this->findByUuid($bid, $clientUuid);
                if ($dup) {
                    Response::ok(['sale' => $this->withItems($dup), 'idempotent' => true]);
                }
            }
            throw $e;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        Response::ok(['sale' => $this->withItems($this->findOwnedById($bid, $saleId))], 201);
    }

    /** POST /sales/{id}/cancel — anula y devuelve stock */
    public function cancel(Request $req): void
    {
        $bid    = (int) $req->auth['business_id'];
        $userId = (int) $req->auth['user_id'];
        $id     = (int) $req->param('id');

        $sale = $this->findOwnedById($bid, $id);
        if ($sale['status'] === 'cancelled') {
            Response::error('La venta ya está anulada', 422);
        }

        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE sales SET status = "cancelled" WHERE id = ? AND business_id = ?')
                ->execute([$id, $bid]);

            $items = $pdo->prepare(
                'SELECT si.product_id, si.quantity, p.track_stock
                   FROM sale_items si
                   JOIN products p ON p.id = si.product_id
                  WHERE si.sale_id = ? AND p.business_id = ?'
            );
            $items->execute([$id, $bid]);

            foreach ($items->fetchAll() as $it) {
                if ((int) $it['track_stock'] === 1) {
                    $this->stock->applyMovement(
                        $bid, (int) $it['product_id'], 'adjustment',
                        (int) round((float) $it['quantity']), null, $userId,
                        'Anulación de venta #' . $sale['sale_number']
                    );
                }
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        Response::ok(['sale' => $this->withItems($this->findOwnedById($bid, $id))]);
    }

    // -----------------------------------------------------------------

    private function withItems(array $sale): array
    {
        $sale = $this->castSale($sale);
        $stmt = Database::pdo()->prepare(
            'SELECT id, product_id, variant_id, product_name, unit_price, quantity, line_total
               FROM sale_items WHERE sale_id = ? ORDER BY id'
        );
        $stmt->execute([(int) $sale['id']]);

        $sale['items'] = array_map(static function (array $i): array {
            $i['id']         = (int) $i['id'];
            $i['product_id'] = $i['product_id'] !== null ? (int) $i['product_id'] : null;
            $i['variant_id'] = $i['variant_id'] !== null ? (int) $i['variant_id'] : null;
            $i['unit_price'] = (float) $i['unit_price'];
            $i['quantity']   = (float) $i['quantity'];
            $i['line_total'] = (float) $i['line_total'];
            return $i;
        }, $stmt->fetchAll());

        return $sale;
    }

    private function castSale(array $s): array
    {
        foreach (['id', 'sale_number', 'user_id', 'cash_session_id'] as $k) {
            if (array_key_exists($k, $s) && $s[$k] !== null) {
                $s[$k] = (int) $s[$k];
            }
        }
        foreach (['subtotal', 'discount', 'total'] as $k) {
            if (array_key_exists($k, $s)) {
                $s[$k] = (float) $s[$k];
            }
        }
        return $s;
    }

    private function findOwnedById(int $bid, int $id): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, sale_number, client_uuid, user_id, cash_session_id,
                    subtotal, discount, total, payment_method, channel, status, note, created_at
               FROM sales WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $bid]);
        $sale = $stmt->fetch();

        if (!$sale) {
            Response::error('Venta no encontrada', 404);
        }
        return $sale;
    }

    private function findByUuid(int $bid, string $uuid): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, sale_number, client_uuid, user_id, cash_session_id,
                    subtotal, discount, total, payment_method, channel, status, note, created_at
               FROM sales WHERE business_id = ? AND client_uuid = ? LIMIT 1'
        );
        $stmt->execute([$bid, $uuid]);
        return $stmt->fetch() ?: null;
    }

    /** @param int[] $ids @return array<int, array> mapa product_id => fila */
    private function loadProducts(int $bid, array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = Database::pdo()->prepare(
            "SELECT id, name, price, track_stock, has_variants, is_open_price
               FROM products
              WHERE business_id = ? AND id IN ($placeholders)"
        );
        $stmt->execute(array_merge([$bid], $ids));

        $map = [];
        foreach ($stmt->fetchAll() as $row) {
            $map[(int) $row['id']] = $row;
        }
        return $map;
    }

    /** @param int[] $ids @return array<int, array> mapa variant_id => fila */
    private function loadVariants(int $bid, array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = Database::pdo()->prepare(
            "SELECT id, product_id, label, price
               FROM product_variants
              WHERE business_id = ? AND id IN ($placeholders)"
        );
        $stmt->execute(array_merge([$bid], $ids));
        $map = [];
        foreach ($stmt->fetchAll() as $row) {
            $map[(int) $row['id']] = $row;
        }
        return $map;
    }

    private function openSessionBelongs(int $bid, int $sessionId): bool
    {
        $stmt = Database::pdo()->prepare(
            'SELECT 1 FROM cash_sessions
              WHERE id = ? AND business_id = ? AND status = "open" LIMIT 1'
        );
        $stmt->execute([$sessionId, $bid]);
        return (bool) $stmt->fetch();
    }
}
