<?php
namespace Pizzalog\Services;

use Pizzalog\Core\Database;
use Pizzalog\Repositories\StockRepository;

/**
 * Núcleo de creación de ventas, compartido por el TPV (SaleController) y por
 * los pedidos de delivery (OrderController). Inserta la venta y sus líneas,
 * y descuenta stock de los productos que lo controlan.
 *
 * IMPORTANTE: debe ejecutarse DENTRO de una transacción abierta por el caller,
 * para que la operación sea atómica junto con lo que el caller haga alrededor.
 */
class SaleService
{
    private StockRepository $stock;

    public function __construct()
    {
        $this->stock = new StockRepository();
    }

    /**
     * @param array<int, array{product_id:?int, product_name:string, unit_price:float,
     *                          quantity:float, line_total:float, track_stock:bool}> $lines
     * @return int sale_id
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
        ?int $tableSessionId = null
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
        $total    = round($subtotal - $discount, 2);

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
        $saleId = (int) $pdo->lastInsertId();

        $itemStmt = $pdo->prepare(
            'INSERT INTO sale_items (sale_id, product_id, variant_id, product_name, unit_price, quantity, line_total)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        foreach ($lines as $l) {
            $itemStmt->execute([
                $saleId, $l['product_id'], $l['variant_id'] ?? null, $l['product_name'],
                $l['unit_price'], $l['quantity'], $l['line_total'],
            ]);
            if (!empty($l['track_stock']) && $l['product_id'] !== null) {
                $this->stock->applyMovement(
                    $bid, (int) $l['product_id'], 'sale',
                    -(int) round($l['quantity']), $saleId, $userId
                );
            }
        }

        return $saleId;
    }
}
