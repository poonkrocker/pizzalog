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

    /**
     * Crea una mesa. El borrado de mesas es baja lógica y la tabla tiene
     * UNIQUE (business_id, area_id, label) que NO distingue activas de
     * borradas: sin este cuidado, un nombre usado y borrado quedaba
     * «quemado» para siempre y el alta explotaba con un 500.
     *
     *  - Si existe una mesa BORRADA con ese nombre en esa área → se recicla:
     *    se reactiva esa misma fila con los datos nuevos (conserva el id, y
     *    con él el historial de sesiones viejas de esa mesa).
     *  - Si existe una mesa ACTIVA con ese nombre → DomainException con
     *    mensaje claro (422), no un error interno.
     *
     * @throws \DomainException si el nombre ya está en uso por una mesa activa
     */
    public function createTable(int $bid, array $d): int
    {
        $pdo = Database::pdo();

        $stmt = $pdo->prepare(
            'SELECT id, is_active FROM tables
              WHERE business_id = ? AND area_id = ? AND label = ? LIMIT 1'
        );
        $stmt->execute([$bid, $d['area_id'], $d['label']]);
        $existing = $stmt->fetch();

        if ($existing) {
            if ((int) $existing['is_active'] === 1) {
                throw new \DomainException(
                    sprintf('Ya hay una mesa llamada «%s» en esta área. Usá otro nombre.', $d['label'])
                );
            }
            // Reciclar la fila borrada: mismos id y label, datos nuevos.
            $pdo->prepare(
                'UPDATE tables
                    SET kind = ?, capacity = ?, shape = ?, pos_x = ?, pos_y = ?,
                        width = ?, height = ?, rotation = ?, is_active = 1
                  WHERE id = ? AND business_id = ?'
            )->execute([
                $d['kind'], $d['capacity'], $d['shape'], $d['pos_x'], $d['pos_y'],
                $d['width'], $d['height'], $d['rotation'],
                (int) $existing['id'], $bid,
            ]);
            return (int) $existing['id'];
        }

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

    /**
     * Edita una mesa. Mismo cuidado que en createTable con el UNIQUE de
     * (business_id, area_id, label): si el nombre nuevo pertenece a una mesa
     * ACTIVA distinta → error legible; si pertenece a una BORRADA → se libera
     * el nombre renombrando la fila fantasma (conserva su historial).
     *
     * @throws \DomainException si el nombre ya está en uso por otra mesa activa
     */
    public function updateTable(int $bid, int $id, array $d): void
    {
        $pdo  = Database::pdo();
        $stmt = $pdo->prepare(
            'SELECT id, is_active FROM tables
              WHERE business_id = ? AND area_id = ? AND label = ? AND id != ? LIMIT 1'
        );
        $stmt->execute([$bid, $d['area_id'], $d['label'], $id]);
        $clash = $stmt->fetch();

        if ($clash) {
            if ((int) $clash['is_active'] === 1) {
                throw new \DomainException(
                    sprintf('Ya hay una mesa llamada «%s» en esta área. Usá otro nombre.', $d['label'])
                );
            }
            // Fantasma borrada con ese nombre: se lo liberamos renombrándola.
            $pdo->prepare('UPDATE tables SET label = CONCAT(label, " (borrada #", id, ")") WHERE id = ?')
                ->execute([(int) $clash['id']]);
        }

        $pdo->prepare(
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
