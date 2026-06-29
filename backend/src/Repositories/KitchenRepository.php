<?php
namespace Pizzalog\Repositories;

use Pizzalog\Core\Database;

/**
 * Vista de cocina (KDS): las comandas (rondas) activas de las mesas abiertas,
 * con sus ítems, y el avance de estado e impresión.
 */
class KitchenRepository
{
    /**
     * Rondas en los estados pedidos, de sesiones abiertas, más antiguas primero.
     * @param string[] $statuses
     */
    public function listActiveRounds(int $bid, array $statuses): array
    {
        $in   = implode(',', array_fill(0, count($statuses), '?'));
        $stmt = Database::pdo()->prepare(
            "SELECT r.id, r.session_id, r.number, r.status, r.note, r.printed_at, r.created_at,
                    (SELECT GROUP_CONCAT(t.label ORDER BY t.label SEPARATOR '+')
                       FROM session_tables st
                       JOIN tables t ON t.id = st.table_id
                      WHERE st.session_id = r.session_id) AS tables_label
               FROM table_rounds r
               JOIN table_sessions s ON s.id = r.session_id
              WHERE r.business_id = ? AND s.status IN ('open','bill_requested')
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
            $rid = (int) $r['id'];
            return [
                'id'           => $rid,
                'session_id'   => (int) $r['session_id'],
                'number'       => (int) $r['number'],
                'status'       => $r['status'],
                'tables_label' => $r['tables_label'],
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
