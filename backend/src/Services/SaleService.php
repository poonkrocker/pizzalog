<?php
namespace Pizzalog\Services;

use Pizzalog\Core\Database;
use Pizzalog\Repositories\ComboRepository;
use Pizzalog\Repositories\StockRepository;

/**
 * Núcleo de creación de ventas, compartido por el TPV (SaleController) y por
 * los pedidos de delivery (OrderController). Inserta la venta y sus líneas,
 * y descuenta stock de los productos que lo controlan.
 *
 * IMPORTANTE: debe ejecutarse DENTRO de una transacción abierta por el caller.
 */
class SaleService
{
    private static ?bool $hasTableSessionCol = null;
    private StockRepository $stock;
    private ComboRepository $combos;

    public function __construct()
    {
        $this->stock  = new StockRepository();
        $this->combos = new ComboRepository();
        self::ensureTableSessionSchema(Database::pdo());
    }

    /**
     * @param array<int, array{product_id:?int, product_name:string, unit_price:float,
     *                          quantity:float, line_total:float, track_stock:bool,
     *                          combo_selections?:array}> $lines
     * @return int sale_id
     * @throws \DomainException si una selección de combo es inválida (→ 422)
     */
    public function create(
        int $bid,
        int $userId,
        array $lines,
        string $paymentMethod,
        float $discount = 0.0,
        string $channel = 'counter',
        ?int $cashSessionId = null,
        ?string $clientUuid = null,
        ?string $note = null,
        ?int $tableSessionId = null,
        bool $createKitchenRound = false
    ): int {
        $pdo = Database::pdo();

        $stmt = $pdo->prepare('SELECT COALESCE(MAX(sale_number), 0) + 1 FROM sales WHERE business_id = ?');
        $stmt->execute([$bid]);
        $saleNumber = (int) $stmt->fetchColumn();

        $subtotal = 0.0;
        foreach ($lines as $l) {
            $subtotal += $l['line_total'];
        }
        $subtotal = round($subtotal, 2);
        $total    = max(0.0, round($subtotal - $discount, 2));

        // Si es una venta directa (ej. Llevar / Delivery cobrada en el acto) y no viene de una
        // cuenta de mesa existente, generamos su comanda en cocina para que NO falte ni se borre de cocina.
        if ($createKitchenRound && $tableSessionId === null && $lines !== []) {
            $chLabel = match ($channel) {
                'delivery' => "🛵 Delivery #$saleNumber",
                'takeaway' => "🛍️ Llevar #$saleNumber",
                default    => "Mostrador #$saleNumber",
            };
            if ($note) {
                $chLabel .= ' (' . mb_substr($note, 0, 40) . ')';
            }
            $pdo->prepare(
                'INSERT INTO table_sessions (business_id, status, party_size, label, opened_by, closed_at, note)
                 VALUES (?, "closed", NULL, ?, ?, NOW(), ?)'
            )->execute([$bid, $chLabel, $userId, $note]);
            $tableSessionId = (int) $pdo->lastInsertId();

            $pdo->prepare(
                'INSERT INTO table_rounds (business_id, session_id, number, status, note, created_by)
                 VALUES (?, ?, 1, "pending", ?, ?)'
            )->execute([$bid, $tableSessionId, $note, $userId]);
            $roundId = (int) $pdo->lastInsertId();

            $rItemStmt = $pdo->prepare(
                'INSERT INTO table_round_items
                    (business_id, session_id, round_id, product_id, variant_id, name, qty, unit_price, note, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, "ordered")'
            );
            foreach ($lines as $l) {
                $rItemStmt->execute([
                    $bid,
                    $tableSessionId,
                    $roundId,
                    $l['product_id'],
                    $l['variant_id'] ?? null,
                    $l['product_name'],
                    max(1, (int) round((float) $l['quantity'])),
                    $l['unit_price'],
                ]);
            }
        }

        if (self::$hasTableSessionCol) {
            $stmt = $pdo->prepare(
                'INSERT INTO sales
                    (business_id, sale_number, client_uuid, user_id, cash_session_id,
                     subtotal, discount, total, payment_method, status, channel, note, table_session_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "completed", ?, ?, ?)'
            );
            $stmt->execute([
                $bid, $saleNumber, $clientUuid, $userId, $cashSessionId,
                $subtotal, $discount, $total, $paymentMethod, $channel, $note, $tableSessionId,
            ]);
        } else {
            $stmt = $pdo->prepare(
                'INSERT INTO sales
                    (business_id, sale_number, client_uuid, user_id, cash_session_id,
                     subtotal, discount, total, payment_method, status, channel, note)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "completed", ?, ?)'
            );
            $stmt->execute([
                $bid, $saleNumber, $clientUuid, $userId, $cashSessionId,
                $subtotal, $discount, $total, $paymentMethod, $channel, $note,
            ]);
        }
        $saleId = (int) $pdo->lastInsertId();

        $itemStmt = $pdo->prepare(
            'INSERT INTO sale_items
                (sale_id, product_id, variant_id, parent_sale_item_id, product_name,
                 unit_price, quantity, line_total)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );

        foreach ($lines as $l) {
            $itemStmt->execute([
                $saleId, $l['product_id'], $l['variant_id'] ?? null, null, $l['product_name'],
                $l['unit_price'], $l['quantity'], $l['line_total'],
            ]);
            $parentId = (int) $pdo->lastInsertId();

            if (!empty($l['track_stock']) && $l['product_id'] !== null) {
                $this->stock->applyMovement(
                    $bid, (int) $l['product_id'], 'sale',
                    -(int) round($l['quantity']), $saleId, $userId
                );
            }

            if (empty($l['combo_selections']) || $l['product_id'] === null) {
                continue;
            }

            $chosen   = $this->combos->validateSelections($bid, (int) $l['product_id'], $l['combo_selections']);
            $children = $this->combos->childProducts($bid, $chosen);

            foreach ($chosen as $childId) {
                if (!isset($children[$childId])) {
                    throw new \DomainException('Hay una opción del combo que ya no está disponible');
                }
                $child = $children[$childId];
                $qty   = (float) $l['quantity'];

                $itemStmt->execute([
                    $saleId, $childId, null, $parentId, $child['name'],
                    0.0, $qty, 0.0,
                ]);

                if ($child['track_stock'] === 1) {
                    $this->stock->applyMovement(
                        $bid, $childId, 'sale', -(int) round($qty), $saleId, $userId
                    );
                }
            }
        }

        return $saleId;
    }

    public static function ensureTableSessionSchema(\PDO $pdo): bool
    {
        if (self::$hasTableSessionCol !== null) {
            return self::$hasTableSessionCol;
        }

        try {
            $col = $pdo->query("SHOW COLUMNS FROM sales LIKE 'table_session_id'")->fetch();
            if (!$col) {
                $pdo->exec("ALTER TABLE sales ADD COLUMN table_session_id BIGINT UNSIGNED NULL AFTER channel");
                $col = $pdo->query("SHOW COLUMNS FROM sales LIKE 'table_session_id'")->fetch();
            }
            self::$hasTableSessionCol = (bool) $col;

            // Asegurar que channel sea VARCHAR(32) para soportar takeaway, delivery, dine_in, loyverse, etc.
            $channelCol = $pdo->query("SHOW COLUMNS FROM sales LIKE 'channel'")->fetch();
            if ($channelCol && isset($channelCol['Type']) && stripos((string) $channelCol['Type'], 'enum') !== false) {
                $pdo->exec("ALTER TABLE sales MODIFY channel VARCHAR(32) NOT NULL DEFAULT 'counter'");
            }
        } catch (\Throwable) {
            self::$hasTableSessionCol = false;
        }

        return self::$hasTableSessionCol ?? false;
    }
}
