<?php
namespace Pizzalog\Services;

use Pizzalog\Controllers\SaleController;
use Pizzalog\Core\Database;
use Pizzalog\Repositories\TableSessionRepository;

/**
 * Cierre/cobro de una cuenta de mesa. Convierte los ítems de la sesión en
 * una o varias ventas (división por ítems) usando el SaleService, descuenta
 * stock y deja la sesión cerrada. Todo en una sola transacción.
 */
class TableCheckoutService
{
    private TableSessionRepository $sessions;
    private SaleService $sales;

    public function __construct()
    {
        $this->sessions = new TableSessionRepository();
        $this->sales    = new SaleService();
    }

    /**
     * @param array $splits  Para dividir: [ ['item_ids'=>[...], 'payment_method'=>'cash'], ... ].
     *                        Vacío = una sola venta con todo.
     * @return int[] ids de las ventas generadas
     * @throws \RuntimeException con mensaje de validación
     */
    public function close(
        int $bid,
        int $userId,
        int $sessionId,
        string $paymentMethod,
        array $splits = [],
        ?int $cashSessionId = null,
        ?string $note = null,
        float $discount = 0.0
    ): array {
        $items = $this->sessions->getOrderedItems($bid, $sessionId);
        if ($items === []) {
            // Si la mesa no tiene consumos registrados, se cierra y libera la mesa directamente
            $this->sessions->markClosed($bid, $sessionId);
            return [];
        }

        // Definir los grupos a facturar.
        $groups = $splits === []
            ? [['items' => $items, 'payment_method' => $paymentMethod]]
            : $this->buildSplitGroups($items, $splits);

        $pdo = Database::pdo();

        if ($cashSessionId === null) {
            $csStmt = $pdo->prepare(
                'SELECT id FROM cash_sessions WHERE business_id = ? AND status = "open" ORDER BY opened_at DESC LIMIT 1'
            );
            $csStmt->execute([$bid]);
            $csId = $csStmt->fetchColumn();
            $cashSessionId = $csId !== false ? (int) $csId : null;
        }

        $pdo->beginTransaction();
        try {
            $saleIds = [];
            $remainingDiscount = max(0.0, $discount);
            foreach ($groups as $g) {
                $lines = array_map(static function (array $it): array {
                    return [
                        'product_id'   => $it['product_id'],
                        'variant_id'   => $it['variant_id'] ?? null,
                        'product_name' => $it['name'],
                        'unit_price'   => $it['unit_price'],
                        'quantity'     => $it['qty'],
                        'line_total'   => round($it['qty'] * $it['unit_price'], 2),
                        'track_stock'  => $it['track_stock'],
                    ];
                }, $g['items']);

                $groupSubtotal = array_reduce($lines, static fn($acc, $l) => $acc + $l['line_total'], 0.0);
                $groupDiscount = min($remainingDiscount, $groupSubtotal);
                $remainingDiscount -= $groupDiscount;

                $normalizedMethod = SaleController::normalizePaymentMethod($g['payment_method']);

                $saleIds[] = $this->sales->create(
                    $bid, $userId, $lines, $normalizedMethod,
                    $groupDiscount, 'dine_in', $cashSessionId, null, $note, $sessionId
                );
            }

            $this->sessions->markClosed($bid, $sessionId);
            $pdo->commit();
            return $saleIds;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Valida que los grupos de la división cubran exactamente todos los
     * ítems cobrables (sin faltantes ni repetidos) y arma los grupos.
     */
    private function buildSplitGroups(array $items, array $splits): array
    {
        $byId = [];
        foreach ($items as $it) {
            $byId[$it['id']] = $it;
        }

        $seen   = [];
        $groups = [];
        foreach ($splits as $s) {
            $ids = array_map('intval', $s['item_ids'] ?? []);
            if ($ids === []) {
                throw new \RuntimeException('Cada parte de la división debe tener al menos un ítem');
            }
            $groupItems = [];
            foreach ($ids as $id) {
                if (!isset($byId[$id])) {
                    throw new \RuntimeException('El ítem ' . $id . ' no pertenece a la cuenta');
                }
                if (isset($seen[$id])) {
                    throw new \RuntimeException('El ítem ' . $id . ' está repetido en la división');
                }
                $seen[$id]    = true;
                $groupItems[] = $byId[$id];
            }
            $groups[] = [
                'items'          => $groupItems,
                'payment_method' => (string) ($s['payment_method'] ?? 'cash'),
            ];
        }

        if (count($seen) !== count($byId)) {
            throw new \RuntimeException('La división debe cubrir todos los ítems de la cuenta');
        }

        return $groups;
    }
}
