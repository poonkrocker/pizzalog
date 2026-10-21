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

    /** GET /sales?from=YYYY-MM-DD&to=YYYY-MM-DD&channel=&without_cash_session=&limit=&offset= */
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
        if (!empty($req->query['without_cash_session'])) {
            $where[] = 's.cash_session_id IS NULL';
        }

        $limit  = min(max((int) ($req->query['limit'] ?? 50), 1), 200);
        $offset = max((int) ($req->query['offset'] ?? 0), 0);

        $sql = 'SELECT s.id, s.sale_number, s.user_id, u.name AS user_name, s.cash_session_id,
                       s.subtotal, s.discount, s.total, s.payment_method, s.channel,
                       s.status, s.note, s.created_at
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
     * POST /sales  (venta directa de mostrador / llevar / delivery)
     */
    public function store(Request $req): void
    {
        $bid    = (int) $req->auth['business_id'];
        $userId = (int) $req->auth['user_id'];

        $items = $req->input('items');
        if (!is_array($items) || $items === []) {
            Response::error('La venta debe tener al menos un ítem', 422);
        }

        $paymentMethod = self::normalizePaymentMethod((string) $req->input('payment_method', 'cash'));
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

        if ($clientUuid !== null) {
            $dup = $this->findByUuid($bid, $clientUuid);
            if ($dup) {
                Response::ok(['sale' => $this->withItems($dup), 'idempotent' => true]);
            }
        }

        $cashSessionId = $req->input('cash_session_id');
        $cashSessionId = ($cashSessionId === null || $cashSessionId === '') ? null : (int) $cashSessionId;
        if ($cashSessionId !== null && !$this->openSessionBelongs($bid, $cashSessionId)) {
            $cashSessionId = null;
        }
        if ($cashSessionId === null) {
            $cashSessionId = $this->findCurrentOpenCashSessionId($bid);
        }

        $channel = (string) $req->input('channel', 'counter');
        $allowedChannels = ['counter', 'takeaway', 'delivery', 'web', 'whatsapp', 'pedidosya', 'rappi', 'phone', 'dine_in'];
        if (!in_array($channel, $allowedChannels, true)) {
            Response::error('Canal de venta inválido', 422);
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
        $products = $this->loadProducts($bid, array_values(array_unique($productIds)));
        foreach (array_unique($productIds) as $pid) {
            if (!isset($products[$pid])) {
                Response::error("El producto #$pid no existe en este negocio", 422);
            }
        }

        $variantIds = [];
        foreach ($items as $it) {
            if (isset($it['variant_id']) && (int) $it['variant_id'] > 0) {
                $variantIds[] = (int) $it['variant_id'];
            }
        }
        $variants = $this->loadVariants($bid, array_values(array_unique($variantIds)));

        $lines    = [];
        $subtotal = 0.0;
        foreach ($items as $it) {
            $pid     = (int) $it['product_id'];
            $qty     = (float) $it['quantity'];
            $product = $products[$pid];

            $variantId   = null;
            $productName = !empty($it['product_name']) && is_string($it['product_name'])
                ? trim($it['product_name'])
                : $product['name'];

            if ((int) $product['has_variants'] === 1) {
                $vid = (int) ($it['variant_id'] ?? 0);
                if ($vid <= 0 || !isset($variants[$vid]) || (int) $variants[$vid]['product_id'] !== $pid) {
                    Response::error("Elegí una variante válida para «{$product['name']}»", 422);
                }
                $variantId = $vid;
                $unitPrice = (isset($it['unit_price']) && is_numeric($it['unit_price']) && (float) $it['unit_price'] >= 0)
                    ? (float) $it['unit_price']
                    : (float) $variants[$vid]['price'];
                if (empty($it['product_name'])) {
                    $productName = $product['name'] . ' — ' . $variants[$vid]['label'];
                }
            } elseif ((int) $product['is_open_price'] === 1) {
                if (!isset($it['unit_price']) || !is_numeric($it['unit_price']) || (float) $it['unit_price'] <= 0) {
                    Response::error("Ingresá el precio de «{$product['name']}»", 422);
                }
                $unitPrice = (float) $it['unit_price'];
            } else {
                $unitPrice = (isset($it['unit_price']) && is_numeric($it['unit_price']) && (float) $it['unit_price'] >= 0)
                    ? (float) $it['unit_price']
                    : (float) $product['price'];
            }

            $lineTotal = round($unitPrice * $qty, 2);
            $subtotal += $lineTotal;
            $lines[]   = [
                'product_id'       => $pid,
                'variant_id'       => $variantId,
                'product_name'     => $productName,
                'unit_price'       => $unitPrice,
                'quantity'         => $qty,
                'line_total'       => $lineTotal,
                'track_stock'      => (int) $product['track_stock'] === 1,
                'combo_selections' => !empty($it['combo_selections']) && is_array($it['combo_selections'])
                    ? $it['combo_selections']
                    : null,
            ];
        }
        if ($discount > round($subtotal, 2)) {
            Response::error('El descuento no puede superar el subtotal', 422);
        }

        $note = trim((string) $req->input('note', '')) ?: null;
        if ($cashSessionId === null) {
            $note = $note ? ($note . ' [Sin caja abierta]') : '[Sin caja abierta]';
        }

        $useDigitalKds = $this->usesDigitalKds($bid);

        $paymentsRaw   = $req->input('payments', []);
        $validPayments = [];
        if (is_array($paymentsRaw)) {
            foreach ($paymentsRaw as $p) {
                if (is_array($p) && isset($p['amount']) && is_numeric($p['amount']) && (float) $p['amount'] > 0) {
                    $m = self::normalizePaymentMethod((string) ($p['payment_method'] ?? $paymentMethod));
                    if (in_array($m, self::PAYMENT_METHODS, true)) {
                        $validPayments[] = [
                            'amount'         => round((float) $p['amount'], 2),
                            'payment_method' => $m,
                            'label'          => trim((string) ($p['label'] ?? '')),
                        ];
                    }
                }
            }
        }

        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            if (count($validPayments) > 1) {
                $saleId = 0;
                $n = count($validPayments);
                foreach ($validPayments as $idx => $pay) {
                    $amt = $pay['amount'];
                    $lbl = $pay['label'];
                    $payNote = 'Pago ' . ($idx + 1) . '/' . $n
                        . ($lbl !== '' ? " ($lbl)" : '')
                        . ($note ? ' · ' . $note : '');
                    if ($idx === 0) {
                        $saleId = $this->sales->create(
                            $bid, $userId, $lines, $pay['payment_method'], $discount,
                            $channel, $cashSessionId, $clientUuid, $payNote, null, $useDigitalKds, $amt
                        );
                    } else {
                        $partLines = [[
                            'product_id'   => null,
                            'variant_id'   => null,
                            'product_name' => 'Cobro compartido ' . ($idx + 1) . '/' . $n . ($lbl !== '' ? " ($lbl)" : ''),
                            'unit_price'   => $amt,
                            'quantity'     => 1.0,
                            'line_total'   => $amt,
                            'track_stock'  => false,
                        ]];
                        $this->sales->create(
                            $bid, $userId, $partLines, $pay['payment_method'], 0.0,
                            $channel, $cashSessionId, null, $payNote, null, false, $amt
                        );
                    }
                }
            } else {
                $finalMethod = count($validPayments) === 1 ? $validPayments[0]['payment_method'] : $paymentMethod;
                $saleId = $this->sales->create(
                    $bid, $userId, $lines, $finalMethod, $discount,
                    $channel, $cashSessionId, $clientUuid, $note, null, $useDigitalKds
                );
            }
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

        Response::ok([
            'sale'                => $this->withItems($this->findOwnedById($bid, $saleId)),
            'without_cash_session'=> $cashSessionId === null,
        ], 201);
    }

    /**
     * POST /sales/import
     * Importador de ventas históricas (Loyverse CSV u otros sistemas previos), con soporte
     * opcional de API Key de DeepSeek para armonizar encabezados y formatos no estándar.
     * Body: { csv_text: string, deepseek_api_key?: string, use_ai?: bool }
     */
    public function import(Request $req): void
    {
        $bid    = (int) $req->auth['business_id'];
        $userId = (int) $req->auth['user_id'];
        $csvRaw = (string) $req->input('csv_text', '');
        $apiKey = trim((string) $req->input('deepseek_api_key', ''));
        $useAi  = (bool) $req->input('use_ai', false);

        if (trim($csvRaw) === '') {
            Response::error('Pegá o seleccioná un archivo CSV con los datos a importar', 422);
        }

        // Quitar BOM UTF-8 si existe
        $csvRaw = preg_replace('/^\xEF\xBB\xBF/', '', $csvRaw) ?? $csvRaw;
        $lines  = preg_split('/\r\n|\r|\n/', trim($csvRaw));
        if (!$lines || count($lines) < 2) {
            Response::error('El archivo CSV debe tener una fila de encabezados y al menos una fila de datos', 422);
        }

        // Detectar delimitador (coma o punto y coma)
        $firstLine = $lines[0];
        $delimiter = (substr_count($firstLine, ';') > substr_count($firstLine, ',')) ? ';' : ',';

        $headers = array_map(static fn($h) => trim((string) $h), str_getcsv($firstLine, $delimiter));
        $rows    = [];
        for ($i = 1, $n = count($lines); $i < $n; $i++) {
            if (trim($lines[$i]) === '') continue;
            $r = str_getcsv($lines[$i], $delimiter);
            if (count($r) === 1 && ($r[0] === null || trim((string) $r[0]) === '')) continue;
            $rows[] = $r;
        }

        if ($rows === []) {
            Response::error('No se encontraron filas válidas en el CSV', 422);
        }

        // Mapeo automático heurístico de columnas (Loyverse ES / EN y genéricos)
        $map = $this->detectCsvColumns($headers);

        // Si el usuario proporcionó DeepSeek API Key y pidió armonización con IA (o faltan columnas clave)
        $aiUsed = false;
        if ($apiKey !== '' && ($useAi || $map['item'] === null || $map['price'] === null)) {
            $aiMap = $this->harmonizeWithDeepSeek($apiKey, $headers, array_slice($rows, 0, 5));
            if (is_array($aiMap)) {
                foreach ($aiMap as $k => $colIdx) {
                    if (is_int($colIdx) && $colIdx >= 0 && $colIdx < count($headers)) {
                        $map[$k] = $colIdx;
                    }
                }
                $aiUsed = true;
            }
        }

        // Cargar catálogo actual del negocio para vincular productos por nombre
        $pdo = Database::pdo();
        $prodStmt = $pdo->prepare('SELECT id, name, price FROM products WHERE business_id = ?');
        $prodStmt->execute([$bid]);
        $catalog = [];
        foreach ($prodStmt->fetchAll() as $p) {
            $catalog[mb_strtolower(trim((string) $p['name']))] = $p;
        }

        // Agrupar filas por recibo (o por fila individual si es un resumen por recibo)
        $receipts = [];
        foreach ($rows as $idx => $row) {
            $get = static fn(?int $col): string => ($col !== null && isset($row[$col])) ? trim((string) $row[$col]) : '';

            $typeTxt = mb_strtolower($get($map['type']));
            if ($typeTxt !== '' && (str_contains($typeTxt, 'reembolso') || str_contains($typeTxt, 'refund') || str_contains($typeTxt, 'anulad') || str_contains($typeTxt, 'cancel'))) {
                continue;
            }

            $receiptNo = $get($map['receipt']);
            $dateRaw   = $get($map['date']);
            $dateSql   = $this->parseFlexibleDate($dateRaw);

            if ($receiptNo === '') {
                $receiptNo = 'ROW-' . ($idx + 1) . '-' . substr(md5($dateSql . implode('|', $row)), 0, 6);
            }

            $itemName  = $get($map['item']);
            $variant   = $get($map['variant']);
            $qtyRaw    = $get($map['qty']);
            $priceRaw  = $get($map['price']);
            $discRaw   = $get($map['discount']);
            $payRaw    = $get($map['payment']);
            $chanRaw   = $get($map['channel']);

            $qty       = $qtyRaw !== '' ? max(0.01, $this->parseNumber($qtyRaw)) : 1.0;
            $lineAmount= $priceRaw !== '' ? max(0.0, $this->parseNumber($priceRaw)) : 0.0;
            $discAmount= $discRaw !== '' ? abs($this->parseNumber($discRaw)) : 0.0;

            if ($itemName === '') {
                $itemName = 'Venta importada #' . $receiptNo;
            }
            $fullName = ($variant !== '' && mb_strtolower($variant) !== mb_strtolower($itemName))
                ? ($itemName . ' — ' . $variant)
                : $itemName;

            $matchedProd = $catalog[mb_strtolower($itemName)] ?? $catalog[mb_strtolower($fullName)] ?? null;
            $pid         = $matchedProd ? (int) $matchedProd['id'] : null;

            // En Loyverse "Ventas brutas" es el total de la línea (precio * cantidad)
            $unitPrice = $qty > 0 ? round($lineAmount / $qty, 2) : $lineAmount;
            if ($unitPrice <= 0 && $matchedProd) {
                $unitPrice  = (float) $matchedProd['price'];
                $lineAmount = round($unitPrice * $qty, 2);
            }

            if (!isset($receipts[$receiptNo])) {
                $receipts[$receiptNo] = [
                    'receipt_no' => $receiptNo,
                    'created_at' => $dateSql,
                    'payment'    => $this->normalizeLoyversePayment($payRaw),
                    'channel'    => $this->normalizeLoyverseChannel($chanRaw),
                    'discount'   => 0.0,
                    'lines'      => [],
                ];
            }

            $receipts[$receiptNo]['discount'] += $discAmount;
            $receipts[$receiptNo]['lines'][] = [
                'product_id'   => $pid,
                'product_name' => mb_substr($fullName, 0, 180),
                'unit_price'   => $unitPrice,
                'quantity'     => $qty,
                'line_total'   => round($lineAmount, 2),
            ];
        }

        if ($receipts === []) {
            Response::error('No se encontraron ventas activas para importar', 422);
        }

        SaleService::ensureTableSessionSchema($pdo);
        $numStmt = $pdo->prepare('SELECT COALESCE(MAX(sale_number), 0) FROM sales WHERE business_id = ?');
        $numStmt->execute([$bid]);
        $nextSaleNumber = (int) $numStmt->fetchColumn();

        $importedCount = 0;
        $skippedCount  = 0;
        $totalImportedAmount = 0.0;

        $pdo->beginTransaction();
        try {
            $insertSale = $pdo->prepare(
                'INSERT INTO sales
                    (business_id, sale_number, client_uuid, user_id, cash_session_id,
                     subtotal, discount, total, payment_method, status, channel, note, created_at)
                 VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, "completed", ?, ?, ?)'
            );
            $insertItem = $pdo->prepare(
                'INSERT INTO sale_items
                    (sale_id, product_id, variant_id, parent_sale_item_id, product_name,
                     unit_price, quantity, line_total)
                 VALUES (?, ?, NULL, NULL, ?, ?, ?, ?)'
            );

            foreach ($receipts as $r) {
                $uuid = 'loy-' . substr(md5($bid . '|' . $r['receipt_no'] . '|' . $r['created_at']), 0, 28);
                if ($this->findByUuid($bid, $uuid)) {
                    $skippedCount++;
                    continue;
                }

                $subtotal = 0.0;
                foreach ($r['lines'] as $l) {
                    $subtotal += $l['line_total'];
                }
                $subtotal = round($subtotal, 2);
                $discount = min($subtotal, round($r['discount'], 2));
                $total    = max(0.0, round($subtotal - $discount, 2));

                if ($subtotal <= 0 && count($r['lines']) === 0) {
                    $skippedCount++;
                    continue;
                }

                $nextSaleNumber++;
                $note = 'Importado Loyverse #' . $r['receipt_no'];

                $insertSale->execute([
                    $bid,
                    $nextSaleNumber,
                    $uuid,
                    $userId,
                    $subtotal,
                    $discount,
                    $total,
                    $r['payment'],
                    $r['channel'],
                    $note,
                    $r['created_at'],
                ]);
                $saleId = (int) $pdo->lastInsertId();

                foreach ($r['lines'] as $l) {
                    $insertItem->execute([
                        $saleId,
                        $l['product_id'],
                        $l['product_name'],
                        $l['unit_price'],
                        $l['quantity'],
                        $l['line_total'],
                    ]);
                }

                $importedCount++;
                $totalImportedAmount += $total;
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            Response::error('Error al importar ventas: ' . $e->getMessage(), 422);
        }

        Response::ok([
            'imported_sales' => $importedCount,
            'skipped_duplicates' => $skippedCount,
            'total_amount'   => round($totalImportedAmount, 2),
            'ai_harmonized'  => $aiUsed,
        ]);
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

    private function usesDigitalKds(int $bid): bool
    {
        try {
            $pdo = Database::pdo();
            $col = $pdo->query("SHOW COLUMNS FROM businesses LIKE 'use_digital_kds'")->fetch();
            if (!$col) {
                return true;
            }
            $stmt = $pdo->prepare('SELECT use_digital_kds FROM businesses WHERE id = ? LIMIT 1');
            $stmt->execute([$bid]);
            $val = $stmt->fetchColumn();
            return $val === false ? true : ((int) $val === 1);
        } catch (\Throwable) {
            return true;
        }
    }

    /**
     * Detecta columnas de Loyverse (en español o inglés) o CSVs de ventas generales.
     * @param string[] $headers
     * @return array<string, ?int>
     */
    private function detectCsvColumns(array $headers): array
    {
        $map = [
            'receipt'  => null,
            'date'     => null,
            'type'     => null,
            'item'     => null,
            'variant'  => null,
            'qty'      => null,
            'price'    => null,
            'discount' => null,
            'payment'  => null,
            'channel'  => null,
        ];

        foreach ($headers as $i => $h) {
            $k = mb_strtolower(trim($h));
            $k = strtr($k, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u']);

            if ($map['receipt'] === null && (str_contains($k, 'recibo') || str_contains($k, 'receipt') || str_contains($k, 'comprobante') || str_contains($k, 'ticket') || $k === 'id')) {
                if (!str_contains($k, 'tipo') && !str_contains($k, 'type')) {
                    $map['receipt'] = $i;
                }
            }
            if ($map['type'] === null && (str_contains($k, 'tipo de recibo') || str_contains($k, 'receipt type') || $k === 'estado' || $k === 'status')) {
                $map['type'] = $i;
            }
            if ($map['date'] === null && (str_contains($k, 'fecha') || str_contains($k, 'date') || str_contains($k, 'hora') || str_contains($k, 'created'))) {
                $map['date'] = $i;
            }
            if ($map['item'] === null && (str_contains($k, 'articulo') || str_contains($k, 'item') || str_contains($k, 'producto') || str_contains($k, 'product') || str_contains($k, 'descripcion'))) {
                $map['item'] = $i;
            }
            if ($map['variant'] === null && (str_contains($k, 'variante') || str_contains($k, 'variant') || str_contains($k, 'opcion'))) {
                $map['variant'] = $i;
            }
            if ($map['qty'] === null && (str_contains($k, 'cantidad') || str_contains($k, 'quantity') || $k === 'cant' || $k === 'qty' || str_contains($k, 'unidades'))) {
                $map['qty'] = $i;
            }
            if ($map['price'] === null && (str_contains($k, 'ventas brutas') || str_contains($k, 'gross sales') || str_contains($k, 'ventas netas') || str_contains($k, 'net sales') || str_contains($k, 'total') || str_contains($k, 'importe') || str_contains($k, 'precio') || str_contains($k, 'monto'))) {
                $map['price'] = $i;
            }
            if ($map['discount'] === null && (str_contains($k, 'descuento') || str_contains($k, 'discount'))) {
                $map['discount'] = $i;
            }
            if ($map['payment'] === null && (str_contains($k, 'pago') || str_contains($k, 'payment') || str_contains($k, 'medio'))) {
                $map['payment'] = $i;
            }
            if ($map['channel'] === null && (str_contains($k, 'consumo') || str_contains($k, 'dining') || str_contains($k, 'canal') || str_contains($k, 'modalidad'))) {
                $map['channel'] = $i;
            }
        }

        return $map;
    }

    /**
     * Usa la API de DeepSeek para armonizar encabezados desconocidos de un CSV hacia el esquema de Pizzalog.
     */
    private function harmonizeWithDeepSeek(string $apiKey, array $headers, array $sampleRows): ?array
    {
        try {
            $prompt = "Analiza estos encabezados de un CSV de ventas de gastronomía (ej. Loyverse u otro POS) y las primeras filas de muestra.\n"
                . "Encabezados (con su índice 0-based): " . json_encode($headers, JSON_UNESCAPED_UNICODE) . "\n"
                . "Muestra: " . json_encode($sampleRows, JSON_UNESCAPED_UNICODE) . "\n"
                . "Devuelve ÚNICAMENTE un objeto JSON con los índices numéricos (int o null) correspondientes a cada campo:\n"
                . '{"receipt": int|null, "date": int|null, "type": int|null, "item": int|null, "variant": int|null, "qty": int|null, "price": int|null, "discount": int|null, "payment": int|null, "channel": int|null}';

            $ch = curl_init('https://api.deepseek.com/chat/completions');
            if (!$ch) return null;
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST           => true,
                CURLOPT_HTTPHEADER     => [
                    'Content-Type: application/json',
                    'Authorization: Bearer ' . $apiKey,
                ],
                CURLOPT_POSTFIELDS     => json_encode([
                    'model'           => 'deepseek-chat',
                    'messages'        => [
                        ['role' => 'system', 'content' => 'Eres un asistente experto en migración de datos POS para pizzerías. Responde solo en JSON válido.'],
                        ['role' => 'user', 'content' => $prompt],
                    ],
                    'response_format' => ['type' => 'json_object'],
                    'temperature'     => 0.0,
                ]),
                CURLOPT_TIMEOUT        => 15,
            ]);
            $resp = curl_exec($ch);
            curl_close($ch);
            if (!is_string($resp) || $resp === '') return null;
            $data = json_decode($resp, true);
            $content = $data['choices'][0]['message']['content'] ?? null;
            if (!is_string($content)) return null;
            $parsed = json_decode($content, true);
            return is_array($parsed) ? $parsed : null;
        } catch (\Throwable) {
            return null;
        }
    }

    private function parseNumber(string $raw): float
    {
        $clean = preg_replace('/[^\d,.-]/', '', $raw) ?? '';
        if ($clean === '') return 0.0;
        // Si tiene punto de miles y coma decimal (ej. 12.500,00)
        if (str_contains($clean, '.') && str_contains($clean, ',')) {
            if (strrpos($clean, ',') > strrpos($clean, '.')) {
                $clean = str_replace('.', '', $clean);
                $clean = str_replace(',', '.', $clean);
            } else {
                $clean = str_replace(',', '', $clean);
            }
        } elseif (str_contains($clean, ',')) {
            $clean = str_replace(',', '.', $clean);
        }
        return (float) $clean;
    }

    private function parseFlexibleDate(string $raw): string
    {
        $raw = trim($raw);
        if ($raw === '') {
            return date('Y-m-d H:i:s');
        }
        // Intentar formatos dd/mm/yyyy HH:MM o dd-mm-yyyy
        if (preg_match('#^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?#', $raw, $m)) {
            $d = str_pad($m[1], 2, '0', STR_PAD_LEFT);
            $mo = str_pad($m[2], 2, '0', STR_PAD_LEFT);
            $y = strlen($m[3]) === 2 ? ('20' . $m[3]) : $m[3];
            $t = !empty($m[4]) ? (strlen($m[4]) === 5 ? $m[4] . ':00' : $m[4]) : '20:00:00';
            return "$y-$mo-$d $t";
        }
        $ts = strtotime($raw);
        if ($ts !== false) {
            return date('Y-m-d H:i:s', $ts);
        }
        return date('Y-m-d H:i:s');
    }

    private function normalizeLoyversePayment(string $raw): string
    {
        $k = mb_strtolower(trim($raw));
        if (str_contains($k, 'efectivo') || str_contains($k, 'cash')) return 'cash';
        if (str_contains($k, 'tarjeta') || str_contains($k, 'card') || str_contains($k, 'debito') || str_contains($k, 'credito')) return 'card';
        if (str_contains($k, 'transfer')) return 'transfer';
        if (str_contains($k, 'mercado') || $k === 'mp' || str_contains($k, 'qr')) return 'mp';
        return 'cash';
    }

    private function normalizeLoyverseChannel(string $raw): string
    {
        $k = mb_strtolower(trim($raw));
        if (str_contains($k, 'llevar') || str_contains($k, 'take')) return 'takeaway';
        if (str_contains($k, 'domicilio') || str_contains($k, 'delivery') || str_contains($k, 'envio')) return 'delivery';
        if (str_contains($k, 'aqui') || str_contains($k, 'salon') || str_contains($k, 'mesa') || str_contains($k, 'dine')) return 'dine_in';
        return 'counter';
    }

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
        if (!array_key_exists('cash_session_id', $s)) {
            $s['cash_session_id'] = null;
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

    public static function normalizePaymentMethod(?string $method): string
    {
        return match (strtolower(trim((string) $method))) {
            'efectivo', 'cash'                  => 'cash',
            'tarjeta', 'card'                   => 'card',
            'transferencia', 'transfer'         => 'transfer',
            'mp', 'mercadopago', 'mercado_pago' => 'mp',
            'otro', 'other'                     => 'other',
            default                             => 'other',
        };
    }

    private function findCurrentOpenCashSessionId(int $bid): ?int
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id FROM cash_sessions WHERE business_id = ? AND status = "open" ORDER BY opened_at DESC LIMIT 1'
        );
        $stmt->execute([$bid]);
        $id = $stmt->fetchColumn();
        return $id !== false ? (int) $id : null;
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
