<?php
namespace Pizzalog\Repositories;

use Pizzalog\Core\Database;

/**
 * Centraliza los cambios de stock. Cada movimiento ajusta el stock "vivo"
 * del producto y deja su rastro en stock_movements (historial auditable).
 *
 * quantityChange negativo descuenta (venta); positivo repone (reversa, ingreso).
 * Reutilizable por ventas, anulaciones y el futuro módulo de inventario.
 */
class StockRepository
{
    public function applyMovement(
        int $businessId,
        int $productId,
        string $type,            // 'sale' | 'restock' | 'adjustment'
        int $quantityChange,
        ?int $saleId = null,
        ?int $userId = null,
        ?string $reason = null
    ): void {
        $pdo = Database::pdo();

        $pdo->prepare(
            'UPDATE products SET stock_quantity = stock_quantity + ?
              WHERE id = ? AND business_id = ?'
        )->execute([$quantityChange, $productId, $businessId]);

        $pdo->prepare(
            'INSERT INTO stock_movements
                (business_id, product_id, type, quantity_change, reason, sale_id, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([$businessId, $productId, $type, $quantityChange, $reason, $saleId, $userId]);
    }
}
