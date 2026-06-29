<?php
namespace Pizzalog\Repositories;

use Pizzalog\Core\Database;

/**
 * Cuentas de mesa: apertura, rondas (comandas), ítems y el cálculo de la
 * cuenta en vivo. No descuenta stock ni factura: eso ocurre al cobrar (cierre).
 */
class TableSessionRepository
{
    private const OPEN_STATES = ['open', 'bill_requested'];

    // --- Apertura -----------------------------------------------------

    /** @return array{ok:bool, error?:string, busy?:string} */
    public function validateTablesFree(int $bid, array $tableIds): array
    {
        $pdo = Database::pdo();
        $in  = implode(',', array_fill(0, count($tableIds), '?'));

        // Que existan y estén activas.
        $stmt = $pdo->prepare(
            "SELECT id, label FROM tables
              WHERE business_id = ? AND is_active = 1 AND id IN ($in)"
        );
        $stmt->execute([$bid, ...$tableIds]);
        $found = $stmt->fetchAll();
        if (count($found) !== count($tableIds)) {
            return ['ok' => false, 'error' => 'Alguna mesa no existe o está inactiva'];
        }

        // Que ninguna esté en una sesión abierta.
        $stmt = $pdo->prepare(
            "SELECT t.label
               FROM session_tables st
               JOIN table_sessions s ON s.id = st.session_id
               JOIN tables t ON t.id = st.table_id
              WHERE s.business_id = ? AND s.status IN ('open','bill_requested')
                AND st.table_id IN ($in) LIMIT 1"
        );
        $stmt->execute([$bid, ...$tableIds]);
        $busy = $stmt->fetchColumn();
        if ($busy !== false) {
            return ['ok' => false, 'busy' => (string) $busy];
        }

        return ['ok' => true];
    }

    public function openSession(int $bid, int $userId, array $tableIds, ?int $partySize, ?string $note): int
    {
        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            $pdo->prepare(
                'INSERT INTO table_sessions (business_id, status, party_size, opened_by, note)
                 VALUES (?, "open", ?, ?, ?)'
            )->execute([$bid, $partySize, $userId, $note]);
            $sessionId = (int) $pdo->lastInsertId();

            $stmt = $pdo->prepare('INSERT INTO session_tables (session_id, table_id) VALUES (?, ?)');
            foreach ($tableIds as $tid) {
                $stmt->execute([$sessionId, (int) $tid]);
            }

            $pdo->commit();
            return $sessionId;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    // --- Lectura ------------------------------------------------------

    public function getSession(int $bid, int $id): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, status, party_size, opened_by, opened_at, closed_at, note
               FROM table_sessions WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $bid]);
        return $stmt->fetch() ?: null;
    }

    /** Sesiones abiertas con su subtotal y las mesas que ocupan. */
    public function listOpenSessions(int $bid): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT s.id, s.status, s.party_size, s.opened_at,
                    (SELECT COALESCE(SUM(i.qty * i.unit_price), 0)
                       FROM table_round_items i
                      WHERE i.session_id = s.id AND i.status = "ordered") AS subtotal,
                    (SELECT GROUP_CONCAT(t.label ORDER BY t.label SEPARATOR "+")
                       FROM session_tables st
                       JOIN tables t ON t.id = st.table_id
                      WHERE st.session_id = s.id) AS tables_label
               FROM table_sessions s
              WHERE s.business_id = ? AND s.status IN ("open", "bill_requested")
              ORDER BY s.opened_at'
        );
        $stmt->execute([$bid]);

        return array_map(static function (array $r): array {
            return [
                'id'           => (int) $r['id'],
                'status'       => $r['status'],
                'party_size'   => $r['party_size'] !== null ? (int) $r['party_size'] : null,
                'opened_at'    => $r['opened_at'],
                'subtotal'     => (float) $r['subtotal'],
                'tables_label' => $r['tables_label'],
            ];
        }, $stmt->fetchAll());
    }

    /** Detalle completo: la cuenta en vivo (mesas + rondas + ítems + total). */
    public function getSessionDetail(int $bid, int $id): ?array
    {
        $session = $this->getSession($bid, $id);
        if (!$session) {
            return null;
        }
        $pdo = Database::pdo();

        $stmt = $pdo->prepare(
            'SELECT t.id, t.label, a.name AS area_name
               FROM session_tables st
               JOIN tables t ON t.id = st.table_id
               JOIN table_areas a ON a.id = t.area_id
              WHERE st.session_id = ? ORDER BY t.label'
        );
        $stmt->execute([$id]);
        $tables = array_map(static function (array $t): array {
            $t['id'] = (int) $t['id'];
            return $t;
        }, $stmt->fetchAll());

        $stmt = $pdo->prepare(
            'SELECT id, number, status, note, printed_at, created_at
               FROM table_rounds WHERE session_id = ? ORDER BY number'
        );
        $stmt->execute([$id]);
        $rounds = [];
        $roundIndex = [];
        foreach ($stmt->fetchAll() as $r) {
            $r['id']         = (int) $r['id'];
            $r['number']     = (int) $r['number'];
            $r['items']      = [];
            $rounds[]        = $r;
            $roundIndex[$r['id']] = count($rounds) - 1;
        }

        $stmt = $pdo->prepare(
            'SELECT id, round_id, product_id, name, qty, unit_price, note, status
               FROM table_round_items WHERE session_id = ? ORDER BY id'
        );
        $stmt->execute([$id]);

        $subtotal = 0.0;
        $count    = 0;
        foreach ($stmt->fetchAll() as $it) {
            $it['id']         = (int) $it['id'];
            $it['round_id']   = (int) $it['round_id'];
            $it['product_id'] = $it['product_id'] !== null ? (int) $it['product_id'] : null;
            $it['qty']        = (int) $it['qty'];
            $it['unit_price'] = (float) $it['unit_price'];
            $it['line_total'] = round($it['qty'] * $it['unit_price'], 2);

            if ($it['status'] === 'ordered') {
                $subtotal += $it['line_total'];
                $count    += $it['qty'];
            }
            if (isset($roundIndex[$it['round_id']])) {
                $rounds[$roundIndex[$it['round_id']]]['items'][] = $it;
            }
        }

        $session['id']         = (int) $session['id'];
        $session['party_size'] = $session['party_size'] !== null ? (int) $session['party_size'] : null;
        $session['tables']     = $tables;
        $session['rounds']     = $rounds;
        $session['totals']     = ['items_count' => $count, 'subtotal' => round($subtotal, 2)];

        return $session;
    }

    // --- Rondas (comandas) --------------------------------------------

    /**
     * Agrega una ronda con sus ítems. Los precios y nombres se toman del
     * servidor (snapshot), nunca del cliente.
     *
     * @param array<array{product_id:int, qty:int, note?:string}> $items
     * @return int id de la ronda creada
     */
    public function addRound(int $bid, int $sessionId, int $userId, array $items, ?string $note): int
    {
        $pdo = Database::pdo();

        // Snapshot de productos.
        $ids = array_values(array_unique(array_map(static fn($i) => (int) $i['product_id'], $items)));
        $in  = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("SELECT id, name, price FROM products WHERE business_id = ? AND id IN ($in)");
        $stmt->execute([$bid, ...$ids]);
        $catalog = [];
        foreach ($stmt->fetchAll() as $p) {
            $catalog[(int) $p['id']] = $p;
        }

        $pdo->beginTransaction();
        try {
            $number = (int) $pdo->query(
                'SELECT COALESCE(MAX(number), 0) + 1 FROM table_rounds WHERE session_id = ' . $sessionId
            )->fetchColumn();

            $pdo->prepare(
                'INSERT INTO table_rounds (business_id, session_id, number, status, note, created_by)
                 VALUES (?, ?, ?, "pending", ?, ?)'
            )->execute([$bid, $sessionId, $number, $note, $userId]);
            $roundId = (int) $pdo->lastInsertId();

            $stmt = $pdo->prepare(
                'INSERT INTO table_round_items
                    (business_id, session_id, round_id, product_id, name, qty, unit_price, note)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );
            foreach ($items as $it) {
                $pid = (int) $it['product_id'];
                if (!isset($catalog[$pid])) {
                    throw new \RuntimeException('El producto ' . $pid . ' no existe');
                }
                $qty = max(1, (int) $it['qty']);
                $stmt->execute([
                    $bid, $sessionId, $roundId, $pid,
                    $catalog[$pid]['name'], $qty, $catalog[$pid]['price'],
                    isset($it['note']) ? trim((string) $it['note']) : null,
                ]);
            }

            $pdo->commit();
            return $roundId;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    public function getRound(int $bid, int $roundId): ?array
    {
        $pdo  = Database::pdo();
        $stmt = $pdo->prepare(
            'SELECT id, session_id, number, status, note, printed_at, created_at
               FROM table_rounds WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$roundId, $bid]);
        $round = $stmt->fetch();
        if (!$round) {
            return null;
        }

        $stmt = $pdo->prepare(
            'SELECT id, product_id, name, qty, unit_price, note, status
               FROM table_round_items WHERE round_id = ? ORDER BY id'
        );
        $stmt->execute([$roundId]);
        $items = array_map(static function (array $it): array {
            $it['id']         = (int) $it['id'];
            $it['product_id'] = $it['product_id'] !== null ? (int) $it['product_id'] : null;
            $it['qty']        = (int) $it['qty'];
            $it['unit_price'] = (float) $it['unit_price'];
            $it['line_total'] = round($it['qty'] * $it['unit_price'], 2);
            return $it;
        }, $stmt->fetchAll());

        $round['id']         = (int) $round['id'];
        $round['session_id'] = (int) $round['session_id'];
        $round['number']     = (int) $round['number'];
        $round['items']      = $items;
        return $round;
    }

    // --- Estado / ítems -----------------------------------------------

    public function requestBill(int $bid, int $id): bool
    {
        $stmt = Database::pdo()->prepare(
            'UPDATE table_sessions SET status = "bill_requested"
              WHERE id = ? AND business_id = ? AND status = "open"'
        );
        $stmt->execute([$id, $bid]);
        return $stmt->rowCount() > 0;
    }

    public function cancelItem(int $bid, int $sessionId, int $itemId): bool
    {
        $stmt = Database::pdo()->prepare(
            'UPDATE table_round_items SET status = "cancelled"
              WHERE id = ? AND session_id = ? AND business_id = ? AND status = "ordered"'
        );
        $stmt->execute([$itemId, $sessionId, $bid]);
        return $stmt->rowCount() > 0;
    }

    public function isOpen(array $session): bool
    {
        return in_array($session['status'], self::OPEN_STATES, true);
    }

    // --- Maniobras (juntar / transferir) ------------------------------

    /** @return int[] ids de las mesas que ocupa la sesión */
    public function getSessionTableIds(int $sessionId): array
    {
        $stmt = Database::pdo()->prepare('SELECT table_id FROM session_tables WHERE session_id = ?');
        $stmt->execute([$sessionId]);
        return array_map('intval', $stmt->fetchAll(\PDO::FETCH_COLUMN));
    }

    /**
     * Reemplaza el conjunto de mesas de la sesión (sirve para transferir y
     * para juntar/soltar mesas). Valida que las mesas nuevas estén libres.
     *
     * @return array{ok:bool, error?:string, busy?:string}
     */
    public function replaceTables(int $bid, int $sessionId, array $tableIds): array
    {
        $current = $this->getSessionTableIds($sessionId);
        $incoming = array_values(array_unique(array_map('intval', $tableIds)));
        $newOnes  = array_values(array_diff($incoming, $current));

        if ($newOnes !== []) {
            $check = $this->validateTablesFree($bid, $newOnes);
            if (!($check['ok'] ?? false)) {
                return $check;
            }
        } else {
            // Igual validar que las que quedan existan y sean del negocio.
            $check = $this->validateTablesExist($bid, $incoming);
            if (!($check['ok'] ?? false)) {
                return $check;
            }
        }

        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM session_tables WHERE session_id = ?')->execute([$sessionId]);
            $stmt = $pdo->prepare('INSERT INTO session_tables (session_id, table_id) VALUES (?, ?)');
            foreach ($incoming as $tid) {
                $stmt->execute([$sessionId, $tid]);
            }
            $pdo->commit();
            return ['ok' => true];
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /** @return array{ok:bool, error?:string} */
    public function validateTablesExist(int $bid, array $tableIds): array
    {
        if ($tableIds === []) {
            return ['ok' => false, 'error' => 'La cuenta debe ocupar al menos una mesa'];
        }
        $in   = implode(',', array_fill(0, count($tableIds), '?'));
        $stmt = Database::pdo()->prepare(
            "SELECT COUNT(*) FROM tables WHERE business_id = ? AND is_active = 1 AND id IN ($in)"
        );
        $stmt->execute([$bid, ...$tableIds]);
        return (int) $stmt->fetchColumn() === count($tableIds)
            ? ['ok' => true]
            : ['ok' => false, 'error' => 'Alguna mesa no existe o está inactiva'];
    }

    /**
     * Fusiona la sesión origen dentro de la destino: mueve sus mesas, rondas
     * e ítems, y deja la origen cancelada. Las rondas se renumeran para no
     * colisionar con las de la destino.
     */
    public function mergeSessions(int $bid, int $targetId, int $sourceId): void
    {
        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            // Mesas de la origen que no estén ya en la destino.
            $targetTables = $this->getSessionTableIds($targetId);
            foreach ($this->getSessionTableIds($sourceId) as $tid) {
                if (!in_array($tid, $targetTables, true)) {
                    $pdo->prepare('INSERT INTO session_tables (session_id, table_id) VALUES (?, ?)')
                        ->execute([$targetId, $tid]);
                }
            }
            $pdo->prepare('DELETE FROM session_tables WHERE session_id = ?')->execute([$sourceId]);

            // Renumerar y mover rondas.
            $offset = (int) $pdo->query(
                'SELECT COALESCE(MAX(number), 0) FROM table_rounds WHERE session_id = ' . $targetId
            )->fetchColumn();
            $pdo->prepare('UPDATE table_rounds SET session_id = ?, number = number + ? WHERE session_id = ?')
                ->execute([$targetId, $offset, $sourceId]);

            // Mover ítems.
            $pdo->prepare('UPDATE table_round_items SET session_id = ? WHERE session_id = ?')
                ->execute([$targetId, $sourceId]);

            // Cerrar la origen como cancelada.
            $pdo->prepare(
                'UPDATE table_sessions
                    SET status = "cancelled", closed_at = NOW(),
                        note = CONCAT(COALESCE(note, ""), " [fusionada en #' . $targetId . ']")
                  WHERE id = ? AND business_id = ?'
            )->execute([$sourceId, $bid]);

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    // --- Cierre -------------------------------------------------------

    /**
     * Ítems cobrables (no anulados) con el flag de stock del producto.
     * @return array<array{id:int, product_id:?int, name:string, qty:int,
     *                      unit_price:float, track_stock:bool}>
     */
    public function getOrderedItems(int $bid, int $sessionId): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT i.id, i.product_id, i.name, i.qty, i.unit_price,
                    COALESCE(p.track_stock, 0) AS track_stock
               FROM table_round_items i
          LEFT JOIN products p ON p.id = i.product_id
              WHERE i.session_id = ? AND i.business_id = ? AND i.status = "ordered"
              ORDER BY i.id'
        );
        $stmt->execute([$sessionId, $bid]);
        return array_map(static function (array $i): array {
            return [
                'id'          => (int) $i['id'],
                'product_id'  => $i['product_id'] !== null ? (int) $i['product_id'] : null,
                'name'        => $i['name'],
                'qty'         => (int) $i['qty'],
                'unit_price'  => (float) $i['unit_price'],
                'track_stock' => (bool) $i['track_stock'],
            ];
        }, $stmt->fetchAll());
    }

    public function markClosed(int $bid, int $sessionId): void
    {
        Database::pdo()->prepare(
            'UPDATE table_sessions SET status = "closed", closed_at = NOW()
              WHERE id = ? AND business_id = ?'
        )->execute([$sessionId, $bid]);
    }

    public function cancelSession(int $bid, int $sessionId): bool
    {
        $stmt = Database::pdo()->prepare(
            'UPDATE table_sessions SET status = "cancelled", closed_at = NOW()
              WHERE id = ? AND business_id = ? AND status IN ("open", "bill_requested")'
        );
        $stmt->execute([$sessionId, $bid]);
        return $stmt->rowCount() > 0;
    }
}
