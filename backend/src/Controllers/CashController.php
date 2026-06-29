<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

/**
 * Caja / arqueo.
 *
 * Se asume una sola caja abierta por negocio a la vez (un local chico, una
 * caja física). El arqueo considera SOLO el efectivo: las ventas con tarjeta,
 * transferencia o MP no están en el cajón, así que no entran en el esperado.
 *
 * Esperado = monto inicial + ventas en efectivo + ingresos − egresos.
 * Diferencia = contado al cerrar − esperado.
 */
class CashController
{
    /** POST /cash/open   Body: { opening_amount, note? } */
    public function open(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];

        if ($this->findOpenSession($bid)) {
            Response::error('Ya hay una caja abierta. Cerrala antes de abrir otra.', 422);
        }

        $opening = $req->input('opening_amount', 0);
        if (!is_numeric($opening) || (float) $opening < 0) {
            Response::error('El monto inicial debe ser un número positivo', 422);
        }

        $pdo = Database::pdo();
        $pdo->prepare(
            'INSERT INTO cash_sessions (business_id, opened_by, opening_amount, status, note)
             VALUES (?, ?, ?, "open", ?)'
        )->execute([
            $bid, (int) $req->auth['user_id'], (float) $opening,
            trim((string) $req->input('note', '')) ?: null,
        ]);

        Response::ok(['session' => $this->detail($bid, (int) $pdo->lastInsertId())], 201);
    }

    /** GET /cash/current — la caja abierta, con totales calculados en vivo */
    public function current(Request $req): void
    {
        $bid     = (int) $req->auth['business_id'];
        $session = $this->findOpenSession($bid);

        Response::ok(['session' => $session ? $this->detail($bid, (int) $session['id']) : null]);
    }

    /** POST /cash/movement   Body: { type: in|out, amount, reason? } */
    public function movement(Request $req): void
    {
        $bid     = (int) $req->auth['business_id'];
        $session = $this->findOpenSession($bid);
        if (!$session) {
            Response::error('No hay una caja abierta', 422);
        }

        $type = (string) $req->input('type', '');
        if (!in_array($type, ['in', 'out'], true)) {
            Response::error('El tipo debe ser "in" (ingreso) o "out" (egreso)', 422);
        }

        $amount = $req->input('amount');
        if (!is_numeric($amount) || (float) $amount <= 0) {
            Response::error('El monto debe ser mayor a 0', 422);
        }

        Database::pdo()->prepare(
            'INSERT INTO cash_movements (cash_session_id, type, amount, reason, created_by)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([
            (int) $session['id'], $type, (float) $amount,
            trim((string) $req->input('reason', '')) ?: null,
            (int) $req->auth['user_id'],
        ]);

        Response::ok(['session' => $this->detail($bid, (int) $session['id'])], 201);
    }

    /** POST /cash/close   Body: { closing_amount, note? } */
    public function close(Request $req): void
    {
        $bid     = (int) $req->auth['business_id'];
        $session = $this->findOpenSession($bid);
        if (!$session) {
            Response::error('No hay una caja abierta', 422);
        }

        $closing = $req->input('closing_amount');
        if (!is_numeric($closing) || (float) $closing < 0) {
            Response::error('El monto contado debe ser un número positivo', 422);
        }
        $closing = (float) $closing;

        $totals     = $this->sessionTotals((int) $session['id'], (float) $session['opening_amount']);
        $expected   = $totals['expected'];
        $difference = round($closing - $expected, 2);

        $note = $req->input('note');
        $note = ($note !== null && trim((string) $note) !== '') ? trim((string) $note) : $session['note'];

        Database::pdo()->prepare(
            'UPDATE cash_sessions
                SET closed_at = NOW(), closing_amount = ?, expected_amount = ?,
                    difference = ?, status = "closed", note = ?
              WHERE id = ? AND business_id = ?'
        )->execute([$closing, $expected, $difference, $note, (int) $session['id'], $bid]);

        Response::ok(['session' => $this->detail($bid, (int) $session['id'])]);
    }

    /** GET /cash?from=&to=&limit=&offset= — historial (admin/manager) */
    public function index(Request $req): void
    {
        $where  = ['cs.business_id = ?'];
        $params = [(int) $req->auth['business_id']];

        if (!empty($req->query['from'])) {
            $where[]  = 'cs.opened_at >= ?';
            $params[] = $req->query['from'] . ' 00:00:00';
        }
        if (!empty($req->query['to'])) {
            $where[]  = 'cs.opened_at <= ?';
            $params[] = $req->query['to'] . ' 23:59:59';
        }

        $limit  = min(max((int) ($req->query['limit'] ?? 50), 1), 200);
        $offset = max((int) ($req->query['offset'] ?? 0), 0);

        $sql = 'SELECT cs.id, cs.opened_by, uo.name AS opened_by_name,
                       cs.opened_at, cs.closed_at, cs.opening_amount, cs.closing_amount,
                       cs.expected_amount, cs.difference, cs.status, cs.note
                  FROM cash_sessions cs
             LEFT JOIN users uo ON uo.id = cs.opened_by
                 WHERE ' . implode(' AND ', $where) . '
                 ORDER BY cs.opened_at DESC
                 LIMIT ' . $limit . ' OFFSET ' . $offset;

        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        Response::ok(['sessions' => array_map([$this, 'castSession'], $stmt->fetchAll())]);
    }

    /** GET /cash/{id} — detalle con movimientos (admin/manager) */
    public function show(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        Response::ok(['session' => $this->detail($bid, (int) $req->param('id'))]);
    }

    // -----------------------------------------------------------------

    private function findOpenSession(int $bid): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, opening_amount, note FROM cash_sessions
              WHERE business_id = ? AND status = "open"
              ORDER BY opened_at DESC LIMIT 1'
        );
        $stmt->execute([$bid]);
        return $stmt->fetch() ?: null;
    }

    private function sessionRow(int $bid, int $id): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT cs.id, cs.opened_by, uo.name AS opened_by_name,
                    cs.opened_at, cs.closed_at, cs.opening_amount, cs.closing_amount,
                    cs.expected_amount, cs.difference, cs.status, cs.note
               FROM cash_sessions cs
          LEFT JOIN users uo ON uo.id = cs.opened_by
              WHERE cs.id = ? AND cs.business_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $bid]);
        $row = $stmt->fetch();

        if (!$row) {
            Response::error('Caja no encontrada', 404);
        }
        return $row;
    }

    /** Sesión + totales + ventas por método + movimientos. */
    private function detail(int $bid, int $id): array
    {
        $session = $this->castSession($this->sessionRow($bid, $id));
        $totals  = $this->sessionTotals($id, (float) $session['opening_amount']);

        $session['cash_sales']    = $totals['cash_sales'];
        $session['movements_in']  = $totals['movements_in'];
        $session['movements_out'] = $totals['movements_out'];
        // Si está abierta, el esperado se calcula en vivo; si cerró, queda el del cierre.
        $session['expected_amount'] = $session['status'] === 'closed'
            ? $session['expected_amount']
            : $totals['expected'];

        $session['sales_by_method'] = $this->salesByMethod($id);
        $session['movements']       = $this->movements($id);
        return $session;
    }

    /** @return array{cash_sales:float, movements_in:float, movements_out:float, expected:float} */
    private function sessionTotals(int $sessionId, float $opening): array
    {
        $pdo = Database::pdo();

        $stmt = $pdo->prepare(
            'SELECT COALESCE(SUM(total), 0) FROM sales
              WHERE cash_session_id = ? AND status = "completed" AND payment_method = "cash"'
        );
        $stmt->execute([$sessionId]);
        $cashSales = (float) $stmt->fetchColumn();

        $stmt = $pdo->prepare(
            'SELECT COALESCE(SUM(CASE WHEN type = "in"  THEN amount ELSE 0 END), 0) AS ins,
                    COALESCE(SUM(CASE WHEN type = "out" THEN amount ELSE 0 END), 0) AS outs
               FROM cash_movements WHERE cash_session_id = ?'
        );
        $stmt->execute([$sessionId]);
        $m    = $stmt->fetch();
        $ins  = (float) $m['ins'];
        $outs = (float) $m['outs'];

        return [
            'cash_sales'    => round($cashSales, 2),
            'movements_in'  => round($ins, 2),
            'movements_out' => round($outs, 2),
            'expected'      => round($opening + $cashSales + $ins - $outs, 2),
        ];
    }

    private function salesByMethod(int $sessionId): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT payment_method, COALESCE(SUM(total), 0) AS total, COUNT(*) AS count
               FROM sales WHERE cash_session_id = ? AND status = "completed"
              GROUP BY payment_method'
        );
        $stmt->execute([$sessionId]);
        return array_map(static fn(array $r): array => [
            'payment_method' => $r['payment_method'],
            'total'          => (float) $r['total'],
            'count'          => (int) $r['count'],
        ], $stmt->fetchAll());
    }

    private function movements(int $sessionId): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT cm.id, cm.type, cm.amount, cm.reason, cm.created_by,
                    uc.name AS created_by_name, cm.created_at
               FROM cash_movements cm
          LEFT JOIN users uc ON uc.id = cm.created_by
              WHERE cm.cash_session_id = ?
              ORDER BY cm.created_at'
        );
        $stmt->execute([$sessionId]);
        return array_map(static fn(array $r): array => [
            'id'              => (int) $r['id'],
            'type'            => $r['type'],
            'amount'          => (float) $r['amount'],
            'reason'          => $r['reason'],
            'created_by'      => $r['created_by'] !== null ? (int) $r['created_by'] : null,
            'created_by_name' => $r['created_by_name'],
            'created_at'      => $r['created_at'],
        ], $stmt->fetchAll());
    }

    private function castSession(array $s): array
    {
        $s['id']        = (int) $s['id'];
        $s['opened_by'] = $s['opened_by'] !== null ? (int) $s['opened_by'] : null;
        foreach (['opening_amount', 'closing_amount', 'expected_amount', 'difference'] as $k) {
            $s[$k] = $s[$k] !== null ? (float) $s[$k] : null;
        }
        return $s;
    }
}
