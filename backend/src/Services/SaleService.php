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
 * COMBOS: una línea puede traer `combo_selections`
 * ([{ group_id, product_ids: number[] }]). La línea del combo se inserta con
 * su precio completo y, por cada producto elegido, se inserta una línea HIJA
 * con unit_price = 0 y parent_sale_item_id apuntando al combo. Así:
 *   - la facturación no se infla (las hijas suman $0);
 *   - el ranking de popularidad sí ve cada sabor elegido;
 *   - el stock de los productos hijos se descuenta igual que cualquier otro.
 *
 * IMPORTANTE: debe ejecutarse DENTRO de una transacción abierta por el caller,
 * para que la operación sea atómica junto con lo que el caller haga alrededor.
 */
class SaleService
{
    private StockRepository $stock;
    private ComboRepository $combos;

    public function __construct()
    {
        $this->stock  = new StockRepository();
        $this->combos = new ComboRepository();
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

            // Nunca se confía en el front: cantidad exacta por grupo y pertenencia.
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
}
