<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

/**
 * Control de asistencia.
 *
 * El fichaje (punch) lo hace el empleado con su PIN en el dispositivo del
 * local: la sesión (token) aporta el negocio; el PIN identifica a la persona.
 * El resto (reportes y correcciones manuales) es para admin/manager.
 */
class AttendanceController
{
    /**
     * POST /attendance/punch   Body: { pin, device_label? }
     * Alterna entrada/salida: si la persona tiene un turno abierto lo cierra,
     * si no, abre uno nuevo.
     */
    public function punch(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $pin = (string) $req->input('pin', '');

        if (!preg_match('/^\d{4,6}$/', $pin)) {
            Response::error('PIN inválido', 422);
        }

        $user = $this->findByPin($bid, $pin);
        if (!$user) {
            Response::error('PIN incorrecto', 401);
        }

        $pdo = Database::pdo();
        $stmt = $pdo->prepare(
            'SELECT id FROM time_entries
              WHERE user_id = ? AND clock_out IS NULL
              ORDER BY clock_in DESC LIMIT 1'
        );
        $stmt->execute([(int) $user['id']]);
        $open = $stmt->fetch();

        if ($open) {
            $pdo->prepare('UPDATE time_entries SET clock_out = NOW() WHERE id = ?')
                ->execute([(int) $open['id']]);
            $action  = 'out';
            $entryId = (int) $open['id'];
        } else {
            $deviceLabel = trim((string) $req->input('device_label', '')) ?: null;
            $pdo->prepare(
                'INSERT INTO time_entries (business_id, user_id, clock_in, device_label)
                 VALUES (?, ?, NOW(), ?)'
            )->execute([$bid, (int) $user['id'], $deviceLabel]);
            $action  = 'in';
            $entryId = (int) $pdo->lastInsertId();
        }

        Response::ok([
            'action' => $action, // 'in' = entrada · 'out' = salida
            'user'   => ['id' => (int) $user['id'], 'name' => $user['name']],
            'entry'  => $this->findEntry($bid, $entryId),
        ]);
    }

    /** GET /attendance?from=&to=&user_id=&limit=&offset= */
    public function index(Request $req): void
    {
        $where  = ['u.business_id = ?'];
        $params = [(int) $req->auth['business_id']];

        if (!empty($req->query['user_id'])) {
            $where[]  = 't.user_id = ?';
            $params[] = (int) $req->query['user_id'];
        }
        if (!empty($req->query['from'])) {
            $where[]  = 't.clock_in >= ?';
            $params[] = $req->query['from'] . ' 00:00:00';
        }
        if (!empty($req->query['to'])) {
            $where[]  = 't.clock_in <= ?';
            $params[] = $req->query['to'] . ' 23:59:59';
        }

        $limit  = min(max((int) ($req->query['limit'] ?? 100), 1), 500);
        $offset = max((int) ($req->query['offset'] ?? 0), 0);

        $sql = 'SELECT t.id, t.user_id, u.name AS user_name, t.clock_in, t.clock_out,
                       t.device_label, t.note
                  FROM time_entries t
                  JOIN users u ON u.id = t.user_id
                 WHERE ' . implode(' AND ', $where) . '
                 ORDER BY t.clock_in DESC
                 LIMIT ' . $limit . ' OFFSET ' . $offset;

        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        Response::ok(['entries' => array_map([$this, 'castEntry'], $stmt->fetchAll())]);
    }

    /** GET /attendance/open — quién está fichado adentro ahora mismo */
    public function open(Request $req): void
    {
        $stmt = Database::pdo()->prepare(
            'SELECT t.id, t.user_id, u.name AS user_name, t.clock_in, t.clock_out, t.device_label
               FROM time_entries t
               JOIN users u ON u.id = t.user_id
              WHERE u.business_id = ? AND t.clock_out IS NULL
              ORDER BY t.clock_in'
        );
        $stmt->execute([(int) $req->auth['business_id']]);
        Response::ok(['open' => array_map([$this, 'castEntry'], $stmt->fetchAll())]);
    }

    /** GET /attendance/summary?from=&to= — horas y monto por empleado */
    public function summary(Request $req): void
    {
        $bid  = (int) $req->auth['business_id'];
        $to   = $req->query['to']   ?? date('Y-m-d');
        $from = $req->query['from'] ?? date('Y-m-d', strtotime('-29 days'));

        $stmt = Database::pdo()->prepare(
            'SELECT u.id AS user_id, u.name, u.hourly_rate,
                    COALESCE(SUM(TIMESTAMPDIFF(SECOND, t.clock_in, t.clock_out)), 0) AS seconds,
                    COUNT(t.id) AS shifts
               FROM users u
          LEFT JOIN time_entries t
                 ON t.user_id = u.id
                AND t.clock_out IS NOT NULL
                AND t.clock_in BETWEEN ? AND ?
              WHERE u.business_id = ? AND u.is_active = 1
              GROUP BY u.id, u.name, u.hourly_rate
              ORDER BY u.name'
        );
        $stmt->execute([$from . ' 00:00:00', $to . ' 23:59:59', $bid]);

        $summary = array_map(static function (array $r): array {
            $hours = round(((int) $r['seconds']) / 3600, 2);
            $rate  = $r['hourly_rate'] !== null ? (float) $r['hourly_rate'] : null;
            return [
                'user_id'     => (int) $r['user_id'],
                'name'        => $r['name'],
                'shifts'      => (int) $r['shifts'],
                'hours'       => $hours,
                'hourly_rate' => $rate,
                'amount'      => $rate !== null ? round($hours * $rate, 2) : null,
            ];
        }, $stmt->fetchAll());

        Response::ok(['from' => $from, 'to' => $to, 'summary' => $summary]);
    }

    /** POST /attendance   Body: { user_id, clock_in, clock_out?, note? }  (carga manual) */
    public function store(Request $req): void
    {
        $bid    = (int) $req->auth['business_id'];
        $userId = (int) $req->input('user_id', 0);

        if (!$this->userBelongs($bid, $userId)) {
            Response::error('El empleado no existe en este negocio', 422);
        }

        $clockIn = $this->parseDateTime($req->input('clock_in'));
        if ($clockIn === null) {
            Response::error('clock_in es obligatorio y debe ser una fecha válida', 422);
        }

        $clockOut = null;
        $coIn = $req->input('clock_out');
        if ($coIn !== null && $coIn !== '') {
            $clockOut = $this->parseDateTime($coIn);
            if ($clockOut === null) {
                Response::error('clock_out no es una fecha válida', 422);
            }
            if (strtotime($clockOut) <= strtotime($clockIn)) {
                Response::error('La salida debe ser posterior a la entrada', 422);
            }
        }

        $note = trim((string) $req->input('note', '')) ?: null;

        $pdo = Database::pdo();
        $pdo->prepare(
            'INSERT INTO time_entries (business_id, user_id, clock_in, clock_out, note)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([$bid, $userId, $clockIn, $clockOut, $note]);

        Response::ok(['entry' => $this->findEntry($bid, (int) $pdo->lastInsertId())], 201);
    }

    /** PUT /attendance/{id}   (corrección manual; clock_out vacío reabre el turno) */
    public function update(Request $req): void
    {
        $bid   = (int) $req->auth['business_id'];
        $id    = (int) $req->param('id');
        $entry = $this->findEntryRow($bid, $id);

        // clock_in
        $ciIn = $req->input('clock_in');
        if ($ciIn === null || $ciIn === '') {
            $clockIn = $entry['clock_in'];
        } else {
            $clockIn = $this->parseDateTime($ciIn);
            if ($clockIn === null) {
                Response::error('clock_in no es una fecha válida', 422);
            }
        }

        // clock_out (no enviado = sin cambios; cadena vacía = reabrir turno)
        $coIn = $req->input('clock_out');
        if ($coIn === null) {
            $clockOut = $entry['clock_out'];
        } elseif ($coIn === '') {
            $clockOut = null;
        } else {
            $clockOut = $this->parseDateTime($coIn);
            if ($clockOut === null) {
                Response::error('clock_out no es una fecha válida', 422);
            }
        }

        if ($clockOut !== null && strtotime($clockOut) <= strtotime($clockIn)) {
            Response::error('La salida debe ser posterior a la entrada', 422);
        }

        $note = $req->input('note') !== null
            ? (trim((string) $req->input('note')) ?: null)
            : $entry['note'];

        Database::pdo()->prepare(
            'UPDATE time_entries SET clock_in = ?, clock_out = ?, note = ? WHERE id = ?'
        )->execute([$clockIn, $clockOut, $note, $id]);

        Response::ok(['entry' => $this->findEntry($bid, $id)]);
    }

    /** DELETE /attendance/{id} */
    public function destroy(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        $this->findEntryRow($bid, $id);

        Database::pdo()->prepare('DELETE FROM time_entries WHERE id = ?')->execute([$id]);
        Response::ok(['deleted' => true]);
    }

    // -----------------------------------------------------------------

    /** Identifica al empleado por PIN dentro del negocio (PIN hasheado). */
    private function findByPin(int $bid, string $pin): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, name, pin_hash FROM users
              WHERE business_id = ? AND pin_hash IS NOT NULL AND is_active = 1'
        );
        $stmt->execute([$bid]);
        foreach ($stmt->fetchAll() as $row) {
            if (password_verify($pin, $row['pin_hash'])) {
                return $row;
            }
        }
        return null;
    }

    private function findEntry(int $bid, int $id): array
    {
        return $this->castEntry($this->findEntryRow($bid, $id));
    }

    private function findEntryRow(int $bid, int $id): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT t.id, t.user_id, u.name AS user_name, t.clock_in, t.clock_out,
                    t.device_label, t.note
               FROM time_entries t
               JOIN users u ON u.id = t.user_id
              WHERE t.id = ? AND u.business_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $bid]);
        $entry = $stmt->fetch();

        if (!$entry) {
            Response::error('Fichaje no encontrado', 404);
        }
        return $entry;
    }

    private function castEntry(array $e): array
    {
        $e['id']      = (int) $e['id'];
        $e['user_id'] = (int) $e['user_id'];
        $e['duration_minutes'] = !empty($e['clock_out'])
            ? (int) round((strtotime($e['clock_out']) - strtotime($e['clock_in'])) / 60)
            : null;
        return $e;
    }

    private function userBelongs(int $bid, int $userId): bool
    {
        if ($userId <= 0) {
            return false;
        }
        $stmt = Database::pdo()->prepare('SELECT 1 FROM users WHERE id = ? AND business_id = ? LIMIT 1');
        $stmt->execute([$userId, $bid]);
        return (bool) $stmt->fetch();
    }

    private function parseDateTime(mixed $value): ?string
    {
        if (!is_string($value) || trim($value) === '') {
            return null;
        }
        $ts = strtotime($value);
        return $ts === false ? null : date('Y-m-d H:i:s', $ts);
    }
}
