<?php
namespace Pizzalog\Services;

use Pizzalog\Controllers\SaleController;
use Pizzalog\Core\Database;
use Pizzalog\Repositories\TableSessionRepository;

/**
 * Cierre/cobro de una cuenta de mesa o cuenta diferida (Llevar / Delivery).
 * Convierte los ítems de la sesión en una o varias ventas usando SaleService,
 * descuenta stock y deja la sesión cerrada. Las rondas en cocina permanecen
 * visibles hasta que cocina las marque como entregadas ('served').
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
        float $discount = 0.0,
        array $payments = []
    ): array {
        $items = $this->sessions->getOrderedItems($bid, $sessionId);
        if ($items === []) {
            $this->sessions->markClosed($bid, $sessionId);
            return [];
        }

        $validPayments = [];
        foreach ($payments as $p) {
            if (is_array($p) && isset($p['amount']) && is_numeric($p['amount']) && (float) $p['amount'] > 0) {
                $validPayments[] = [
                    'amount'         => round((float) $p['amount'], 2),
                    'payment_method' => (string) ($p['payment_method'] ?? $paymentMethod),
                    'label'          => trim((string) ($p['label'] ?? '')),
                ];
            }
        }

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

        $sessionInfo = $this->sessions->getSession($bid, $sessionId);
        $sessLabel   = mb_strtolower((string) ($sessionInfo['label'] ?? ''));
        $saleChannel = 'dine_in';
        if (str_contains($sessLabel, 'delivery') || str_contains($sessLabel, '🛵')) {
            $saleChannel = 'delivery';
        } elseif (str_contains($sessLabel, 'llevar') || str_contains($sessLabel, '🛍')) {
            $saleChannel = 'takeaway';
        }

        $pdo->beginTransaction();
        try {
            $saleIds = [];
            if ($splits === [] && count($validPayments) > 1) {
                $lines = array_map(static function (array $it): array {
                    return [
                        'product_id'   => $it['product_id'],
                        'variant_id'   => $it['variant_id'] ?? null,
                        'product_name' => $it['name'],
                        'unit_price'   => (float) $it['unit_price'],
                        'quantity'     => (float) $it['qty'],
                        'line_total'   => round((float) $it['qty'] * (float) $it['unit_price'], 2),
                        'track_stock'  => $it['track_stock'],
                    ];
                }, $items);

                $n = count($validPayments);
                foreach ($validPayments as $idx => $pay) {
                    $amt = $pay['amount'];
                    $lbl = $pay['label'];
                    $normalizedMethod = SaleController::normalizePaymentMethod($pay['payment_method']);
                    $payNote = 'Pago ' . ($idx + 1) . '/' . $n
                        . ($lbl !== '' ? " ($lbl)" : '')
                        . ($note ? ' · ' . $note : '');

                    if ($idx === 0) {
                        $saleIds[] = $this->sales->create(
                            $bid, $userId, $lines, $normalizedMethod,
                            max(0.0, $discount), $saleChannel, $cashSessionId, null, $payNote, $sessionId, false, $amt
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
                        $saleIds[] = $this->sales->create(
                            $bid, $userId, $partLines, $normalizedMethod,
                            0.0, $saleChannel, $cashSessionId, null, $payNote, $sessionId, false, $amt
                        );
                    }
                }
            } else {
                $remainingDiscount = max(0.0, $discount);
                foreach ($groups as $g) {
                    $lines = array_map(static function (array $it): array {
                        return [
                            'product_id'   => $it['product_id'],
                            'variant_id'   => $it['variant_id'] ?? null,
                            'product_name' => $it['name'],
                            'unit_price'   => (float) $it['unit_price'],
                            'quantity'     => (float) $it['qty'],
                            'line_total'   => round((float) $it['qty'] * (float) $it['unit_price'], 2),
                            'track_stock'  => $it['track_stock'],
                        ];
                    }, $g['items']);

                    $groupSubtotal = array_reduce($lines, static fn($acc, $l) => $acc + $l['line_total'], 0.0);
                    $groupDiscount = min($remainingDiscount, $groupSubtotal);
                    $remainingDiscount -= $groupDiscount;

                    $normalizedMethod = SaleController::normalizePaymentMethod(
                        count($validPayments) === 1 ? $validPayments[0]['payment_method'] : $g['payment_method']
                    );

                    $saleIds[] = $this->sales->create(
                        $bid, $userId, $lines, $normalizedMethod,
                        $groupDiscount, $saleChannel, $cashSessionId, null, $note, $sessionId
                    );
                }
            }

            $this->sessions->markClosed($bid, $sessionId);
            $pdo->commit();
            return $saleIds;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

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
