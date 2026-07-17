<?php
namespace Pizzalog\Services;

use Pizzalog\Core\Database;
use Pizzalog\Repositories\ComboRepository;

/**
 * Núcleo de creación de pedidos, compartido por el panel (OrderController) y
 * el checkout público (PublicController). Inserta el pedido y sus ítems y
 * calcula totales y número correlativo.
 *
 * COMBOS: igual que SaleService — la línea del combo lleva su precio completo
 * y cada producto elegido entra como ítem hijo con unit_price = 0 y
 * parent_order_item_id apuntando al combo.
 *
 * Debe ejecutarse DENTRO de una transacción abierta por el caller.
 */
class OrderService
{
    private ComboRepository $combos;

    public function __construct()
    {
        $this->combos = new ComboRepository();
    }

    /**
     * @param array<int, array{product_id:?int, product_name:string, unit_price:float,
     *                          quantity:float, line_total:float, notes:?string,
     *                          combo_selections?:array}> $lines
     * @return int order_id
     * @throws \DomainException si una selección de combo es inválida (→ 422)
     */
    public function create(
        int $bid,
        string $channel,
        array $lines,
        float $deliveryFee,
        ?string $customerName,
        ?string $customerPhone,
        ?string $address,
        ?string $paymentMethod,
        ?string $notes,
        ?int $createdBy
    ): int {
        $pdo = Database::pdo();

        $stmt = $pdo->prepare('SELECT COALESCE(MAX(order_number), 0) + 1 FROM orders WHERE business_id = ?');
        $stmt->execute([$bid]);
        $orderNumber = (int) $stmt->fetchColumn();

        $itemsTotal = 0.0;
        foreach ($lines as $l) {
            $itemsTotal += $l['line_total'];
        }
        $itemsTotal = round($itemsTotal, 2);
        $total      = round($itemsTotal + $deliveryFee, 2);

        $pdo->prepare(
            'INSERT INTO orders
                (business_id, order_number, channel, status, customer_name, customer_phone,
                 address, delivery_fee, items_total, total, payment_method, notes, created_by)
             VALUES (?, ?, ?, "received", ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $bid, $orderNumber, $channel, $customerName, $customerPhone, $address,
            $deliveryFee, $itemsTotal, $total, $paymentMethod, $notes, $createdBy,
        ]);
        $orderId = (int) $pdo->lastInsertId();

        $itemStmt = $pdo->prepare(
            'INSERT INTO order_items
                (order_id, product_id, parent_order_item_id, product_name,
                 unit_price, quantity, line_total, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );

        foreach ($lines as $l) {
            $itemStmt->execute([
                $orderId, $l['product_id'], null, $l['product_name'],
                $l['unit_price'], $l['quantity'], $l['line_total'], $l['notes'] ?? null,
            ]);
            $parentId = (int) $pdo->lastInsertId();

            if (empty($l['combo_selections']) || $l['product_id'] === null) {
                continue;
            }

            $chosen   = $this->combos->validateSelections($bid, (int) $l['product_id'], $l['combo_selections']);
            $children = $this->combos->childProducts($bid, $chosen);

            foreach ($chosen as $childId) {
                if (!isset($children[$childId])) {
                    throw new \DomainException('Hay una opción del combo que ya no está disponible');
                }
                $itemStmt->execute([
                    $orderId, $childId, $parentId, $children[$childId]['name'],
                    0.0, (float) $l['quantity'], 0.0, null,
                ]);
            }
        }

        return $orderId;
    }
}
