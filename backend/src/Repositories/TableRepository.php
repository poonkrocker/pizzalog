<?php
namespace Pizzalog\Repositories;

use Pizzalog\Core\Database;

/**
 * Persistencia del salón: áreas (sectores), mesas y su disposición en el
 * croquis. El estado de cada mesa (libre/ocupada) se deriva de las sesiones
 * abiertas, no se guarda.
 */
class TableRepository
{
    // --- Áreas --------------------------------------------------------

    public function listAreas(int $bid): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, name, sort_order FROM table_areas
              WHERE business_id = ? ORDER BY sort_order, name'
        );
        $stmt->execute([$bid]);
        return array_map(static function (array $a): array {
            $a['id']         = (int) $a['id'];
            $a['sort_order'] = (int) $a['sort_order'];
            return $a;
        }, $stmt->fetchAll());
    }

    public function getArea(int $bid, int $id): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, name, sort_order FROM table_areas WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $bid]);
        $a = $stmt->fetch();
        if (!$a) {
            return null;
        }
        $a['id']         = (int) $a['id'];
        $a['sort_order'] = (int) $a['sort_order'];
        return $a;
    }

    public function createArea(int $bid, string $name, int $sortOrder): int
    {
        $pdo = Database::pdo();
        $pdo->prepare('INSERT INTO table_areas (business_id, name, sort_order) VALUES (?, ?, ?)')
            ->execute([$bid, $name, $sortOrder]);
        return (int) $pdo->lastInsertId();
    }

    public function updateArea(int $bid, int $id, string $name, int $sortOrder): void
    {
        Database::pdo()
            ->prepare('UPDATE table_areas SET name = ?, sort_order = ? WHERE id = ? AND business_id = ?')
            ->execute([$name, $sortOrder, $id, $bid]);
    }

    public function areaHasTables(int $bid, int $areaId): bool
    {
        $stmt = Database::pdo()->prepare(
            'SELECT 1 FROM tables WHERE area_id = ? AND business_id = ? AND is_active = 1 LIMIT 1'
        );
        $stmt->execute([$areaId, $bid]);
        return (bool) $stmt->fetch();
    }

    public function deleteArea(int $bid, int $id): void
    {
        Database::pdo()
            ->prepare('DELETE FROM table_areas WHERE id = ? AND business_id = ?')
            ->execute([$id, $bid]);
    }

    // --- Mesas --------------------------------------------------------

    public function listTables(int $bid, ?int $areaId = null): array
    {
        // Filtra is_active: el borrado de mesas es baja lógica (deactivateTable).
        // Sin este filtro la mesa borrada volvía a aparecer en el editor de salón.
        $sql    = 'SELECT id, area_id, label, kind, capacity, shape, pos_x, pos_y, width, height,
                          rotation, is_active
                     FROM tables WHERE business_id = ? AND is_active = 1';
        $params = [$bid];
        if ($areaId !== null) {
            $sql     .= ' AND area_id = ?';
            $params[] = $areaId;
        }
        $sql .= ' ORDER BY label';

        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        return array_map([$this, 'castTable'], $stmt->fetchAll());
    }

    public function getTable(int $bid, int $id): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, area_id, label, kind, capacity, shape, pos_x, pos_y, width, height,
                    rotation, is_active
               FROM tables WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $bid]);
        $t = $stmt->fetch();
        return $t ? $this->castTable($t) : null;
    }

    public function createTable(int $bid, array $d): int
    {
        $pdo = Database::pdo();
        $pdo->prepare(
            'INSERT INTO tables
                (business_id, area_id, label, kind, capacity, shape, pos_x, pos_y, width, height, rotation)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $bid, $d['area_id'], $d['label'], $d['kind'], $d['capacity'], $d['shape'],
            $d['pos_x'], $d['pos_y'], $d['width'], $d['height'], $d['rotation'],
        ]);
        return (int) $pdo->lastInsertId();
    }

    public function updateTable(int $bid, int $id, array $d): void
    {
        Database::pdo()->prepare(
            'UPDATE tables
                SET area_id = ?, label = ?, kind = ?, capacity = ?, shape = ?, pos_x = ?, pos_y = ?,
                    width = ?, height = ?, rotation = ?, is_active = ?
              WHERE id = ? AND business_id = ?'
        )->execute([
            $d['area_id'], $d['label'], $d['kind'], $d['capacity'], $d['shape'], $d['pos_x'], $d['pos_y'],
            $d['width'], $d['height'], $d['rotation'], $d['is_active'], $id, $bid,
        ]);
    }

    public function deactivateTable(int $bid, int $id): void
    {
        Database::pdo()
            ->prepare('UPDATE tables SET is_active = 0 WHERE id = ? AND business_id = ?')
            ->execute([$id, $bid]);
    }

    /** Actualiza solo posición/tamaño (y opcionalmente área) de varias mesas a la vez. */
    public function updateLayout(int $bid, array $items): int
    {
        $pdo  = Database::pdo();
        $stmt = $pdo->prepare(
            'UPDATE tables
                SET pos_x = ?, pos_y = ?, width = ?, height = ?, rotation = ?,
                    area_id = COALESCE(?, area_id)
              WHERE id = ? AND business_id = ?'
        );

        $pdo->beginTransaction();
        try {
            $n = 0;
            foreach ($items as $it) {
                $stmt->execute([
                    (int) $it['pos_x'], (int) $it['pos_y'],
                    (int) $it['width'], (int) $it['height'], (int) $it['rotation'],
                    isset($it['area_id']) ? (int) $it['area_id'] : null,
                    (int) $it['id'], $bid,
                ]);
                $n += $stmt->rowCount();
            }
            $pdo->commit();
            return $n;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    public function tableHasOpenSession(int $bid, int $tableId): bool
    {
        $stmt = Database::pdo()->prepare(
            'SELECT 1
               FROM session_tables st
               JOIN table_sessions s ON s.id = st.session_id
              WHERE st.table_id = ? AND s.business_id = ?
                AND s.status IN ("open", "bill_requested") LIMIT 1'
        );
        $stmt->execute([$tableId, $bid]);
        return (bool) $stmt->fetch();
    }

    // --- Plano (croquis con estado) -----------------------------------

    /** Áreas con sus mesas y el estado derivado de cada una. */
    public function getFloor(int $bid): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT a.id AS area_id, a.name AS area_name, a.sort_order,
                    t.id, t.label, t.kind, t.capacity, t.shape, t.pos_x, t.pos_y,
                    t.width, t.height, t.rotation,
                    (SELECT s.id FROM session_tables st
                       JOIN table_sessions s ON s.id = st.session_id
                      WHERE st.table_id = t.id AND s.status IN ("open", "bill_requested")
                      LIMIT 1) AS session_id,
                    (SELECT COUNT(*) FROM session_tables st
                       JOIN table_sessions s ON s.id = st.session_id
                      WHERE st.table_id = t.id AND s.status IN ("open", "bill_requested")) AS open_count
               FROM table_areas a
          LEFT JOIN tables t ON t.area_id = a.id AND t.is_active = 1
              WHERE a.business_id = ?
           ORDER BY a.sort_order, a.name, t.label'
        );
        $stmt->execute([$bid]);

        $areas = [];
        foreach ($stmt->fetchAll() as $r) {
            $areaId = (int) $r['area_id'];
            if (!isset($areas[$areaId])) {
                $areas[$areaId] = [
                    'id'     => $areaId,
                    'name'   => $r['area_name'],
                    'tables' => [],
                ];
            }
            if ($r['id'] === null) {
                continue; // área sin mesas
            }
            $areas[$areaId]['tables'][] = [
                'id'         => (int) $r['id'],
                'label'      => $r['label'],
                'kind'       => $r['kind'],
                'capacity'   => (int) $r['capacity'],
                'shape'      => $r['shape'],
                'pos_x'      => (int) $r['pos_x'],
                'pos_y'      => (int) $r['pos_y'],
                'width'      => (int) $r['width'],
                'height'     => (int) $r['height'],
                'rotation'   => (int) $r['rotation'],
                'open_count' => (int) $r['open_count'],
                'status'     => $r['kind'] === 'bar'
                    ? 'bar'
                    : ($r['session_id'] !== null ? 'occupied' : 'free'),
                'session_id' => $r['session_id'] !== null ? (int) $r['session_id'] : null,
            ];
        }

        return array_values($areas);
    }

    private function castTable(array $t): array
    {
        foreach (['id', 'area_id', 'capacity', 'pos_x', 'pos_y', 'width', 'height', 'rotation', 'is_active'] as $k) {
            $t[$k] = (int) $t[$k];
        }
        return $t;
    }
}
