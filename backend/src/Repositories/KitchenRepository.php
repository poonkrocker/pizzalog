<?php
namespace Pizzalog\Repositories;

use Pizzalog\Core\Database;

/**
 * Vista de cocina (KDS): las comandas (rondas) activas de las mesas y pedidos,
 * con sus ítems, y el avance de estado e impresión.
 *
 * IMPORTANTE: Las comandas cobradas (s.status = 'closed') NO se borran de la
 * cocina hasta que la cocina las marque como entregadas ('served'). Solo se
 * excluyen las cuentas anuladas ('cancelled').
 */
class KitchenRepository
{
    /**
     * Rondas en los estados pedidos, más antiguas primero.
     * @param string[] $statuses
     */
    public function listActiveRounds(int $bid, array $statuses): array
    {
        $in   = implode(',', array_fill(0, count($statuses), '?'));
        $stmt = Database::pdo()->prepare(
            "SELECT r.id, r.session_id, r.number, r.status, r.note, r.printed_at, r.created_at,
                    s.status AS session_status, s.label AS session_label,
                    (SELECT GROUP_CONCAT(t.label ORDER BY t.label SEPARATOR '+')
                       FROM session_tables st
                       JOIN tables t ON t.id = st.table_id
                      WHERE st.session_id = r.session_id) AS raw_tables_label
               FROM table_rounds r
          LEFT JOIN table_sessions s ON s.id = r.session_id
              WHERE r.business_id = ?
                AND (s.id IS NULL OR s.status != 'cancelled')
                AND r.status IN ($in)
              ORDER BY r.created_at"
        );
        $stmt->execute([$bid, ...$statuses]);
        $rounds = $stmt->fetchAll();
        if (!$rounds) {
            return [];
        }

        // Ítems de todas las rondas en una sola consulta.
        $ids   = array_map(static fn($r) => (int) $r['id'], $rounds);
        $inIds = implode(',', array_fill(0, count($ids), '?'));
        $istmt = Database::pdo()->prepare(
            "SELECT round_id, id, product_id, name, qty, note
               FROM table_round_items
              WHERE round_id IN ($inIds) AND status = 'ordered'
              ORDER BY id"
        );
        $istmt->execute($ids);

        $itemsByRound = [];
        foreach ($istmt->fetchAll() as $it) {
            $itemsByRound[(int) $it['round_id']][] = [
                'id'         => (int) $it['id'],
                'product_id' => $it['product_id'] !== null ? (int) $it['product_id'] : null,
                'name'       => $it['name'],
                'qty'        => (int) $it['qty'],
                'note'       => $it['note'],
            ];
        }

        return array_map(static function (array $r) use ($itemsByRound): array {
            $rid        = (int) $r['id'];
            $tLabel     = trim((string) ($r['raw_tables_label'] ?? ''));
            $sLabel     = trim((string) ($r['session_label'] ?? ''));
            $combined   = $tLabel !== '' && $sLabel !== ''
                ? ($tLabel . ' · ' . $sLabel)
                : ($tLabel !== '' ? $tLabel : ($sLabel !== '' ? $sLabel : 'Mostrador'));

            if (($r['session_status'] ?? '') === 'closed' && !str_contains($combined, 'Cobrado')) {
                $combined .= ' ✓';
            }

            return [
                'id'           => $rid,
                'session_id'   => (int) $r['session_id'],
                'number'       => (int) $r['number'],
                'status'       => $r['status'],
                'tables_label' => $combined,
                'is_paid'      => ($r['session_status'] ?? '') === 'closed',
                'note'         => $r['note'],
                'printed'      => $r['printed_at'] !== null,
                'printed_at'   => $r['printed_at'],
                'created_at'   => $r['created_at'],
                'items'        => $itemsByRound[$rid] ?? [],
            ];
        }, $rounds);
    }

    public function updateStatus(int $bid, int $roundId, string $status): bool
    {
        $stmt = Database::pdo()->prepare(
            'UPDATE table_rounds SET status = ? WHERE id = ? AND business_id = ?'
        );
        $stmt->execute([$status, $roundId, $bid]);
        return $stmt->rowCount() >= 0;
    }

    public function markPrinted(int $bid, int $roundId): void
    {
        Database::pdo()
            ->prepare('UPDATE table_rounds SET printed_at = NOW() WHERE id = ? AND business_id = ?')
            ->execute([$roundId, $bid]);
    }
}
