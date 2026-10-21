<?php
namespace Pizzalog\Services;

use Pizzalog\Core\Database;
use Pizzalog\Repositories\ComboRepository;
use Pizzalog\Repositories\CustomerRepository;

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
    private static bool $ensured = false;
    private ComboRepository $combos;
    private CustomerRepository $customers;

    public function __construct()
    {
        self::ensureSchema();
        $this->combos    = new ComboRepository();
        $this->customers = new CustomerRepository();
    }

    public static function ensureSchema(): void
    {
        if (self::$ensured) {
            return;
        }
        try {
            $pdo = Database::pdo();
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS delivery_drivers (
                    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    business_id INT UNSIGNED NOT NULL,
                    name VARCHAR(120) NOT NULL,
                    phone VARCHAR(40) NULL,
                    vehicle_type VARCHAR(20) NOT NULL DEFAULT 'moto',
                    vehicle_plate VARCHAR(30) NULL,
                    fee_per_trip DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_drivers_business (business_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");

            $pdo->exec("
                CREATE TABLE IF NOT EXISTS orders (
                    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    business_id INT UNSIGNED NOT NULL,
                    order_number INT UNSIGNED NOT NULL DEFAULT 1,
                    channel VARCHAR(30) NOT NULL DEFAULT 'web',
                    status VARCHAR(30) NOT NULL DEFAULT 'received',
                    customer_name VARCHAR(120) NULL,
                    customer_phone VARCHAR(40) NULL,
                    address VARCHAR(255) NULL,
                    delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                    items_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                    discount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                    total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                    payment_method VARCHAR(30) NULL,
                    sale_id INT UNSIGNED NULL,
                    notes TEXT NULL,
                    created_by INT UNSIGNED NULL,
                    delivery_driver_id INT UNSIGNED NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_orders_business (business_id, created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");

            $cols = [
                'delivery_driver_id' => "ALTER TABLE orders ADD COLUMN delivery_driver_id INT UNSIGNED NULL AFTER created_by",
                'discount'           => "ALTER TABLE orders ADD COLUMN discount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER items_total",
                'sale_id'            => "ALTER TABLE orders ADD COLUMN sale_id INT UNSIGNED NULL AFTER payment_method",
                'updated_at'         => "ALTER TABLE orders ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at",
            ];
            foreach ($cols as $col => $ddl) {
                $exists = $pdo->query("SHOW COLUMNS FROM orders LIKE '$col'")->fetch();
                if (!$exists) {
                    $pdo->exec($ddl);
                }
            }

            $pdo->exec("
                CREATE TABLE IF NOT EXISTS order_items (
                    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    order_id INT UNSIGNED NOT NULL,
                    product_id INT UNSIGNED NULL,
                    parent_order_item_id INT UNSIGNED NULL,
                    product_name VARCHAR(180) NOT NULL,
                    unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                    quantity DECIMAL(10,3) NOT NULL DEFAULT 1.000,
                    line_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                    notes VARCHAR(255) NULL,
                    INDEX idx_order_items_order (order_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");

            $itemCols = [
                'parent_order_item_id' => "ALTER TABLE order_items ADD COLUMN parent_order_item_id INT UNSIGNED NULL AFTER product_id",
                'notes'                => "ALTER TABLE order_items ADD COLUMN notes VARCHAR(255) NULL AFTER line_total",
            ];
            foreach ($itemCols as $col => $ddl) {
                $exists = $pdo->query("SHOW COLUMNS FROM order_items LIKE '$col'")->fetch();
                if (!$exists) {
                    $pdo->exec($ddl);
                }
            }

            self::$ensured = true;
        } catch (\Throwable $e) {
            // Ignorar errores de permisos DDL
        }
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

        // Auto-guardar cliente en planilla de clientes exclusivamente por teléfono (#10)
        try {
            if ($customerPhone !== null && trim($customerPhone) !== '') {
                $this->customers->upsertByPhone($bid, $customerName, $customerPhone, $address);
            }
        } catch (\Throwable $e) {
            // No bloquear el pedido si falla el auto-guardado de cliente
        }

        return $orderId;
    }
}
