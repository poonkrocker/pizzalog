<?php
namespace Pizzalog\Repositories;

use Pizzalog\Core\Database;

class SupplyRepository
{
    public function list(int $bid, ?string $category = null): array
    {
        $sql = 'SELECT s.id, s.name, s.category, s.unit, s.stock, s.min_stock, s.cost,
                       s.supplier_id, sup.name AS supplier_name, s.is_active
                  FROM supplies s
             LEFT JOIN suppliers sup ON sup.id = s.supplier_id
                 WHERE s.business_id = ?';
        $params = [$bid];
        if ($category !== null && $category !== '') {
            $sql     .= ' AND s.category = ?';
            $params[] = $category;
        }
        $sql .= ' ORDER BY s.name';
        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        return array_map([$this, 'cast'], $stmt->fetchAll());
    }

    public function lowStock(int $bid): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT s.id, s.name, s.category, s.unit, s.stock, s.min_stock, s.cost,
                    s.supplier_id, sup.name AS supplier_name, s.is_active
               FROM supplies s
          LEFT JOIN suppliers sup ON sup.id = s.supplier_id
              WHERE s.business_id = ? AND s.is_active = 1
                AND s.min_stock IS NOT NULL AND s.stock <= s.min_stock
              ORDER BY s.name'
        );
        $stmt->execute([$bid]);
        return array_map([$this, 'cast'], $stmt->fetchAll());
    }

    public function get(int $bid, int $id): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT s.id, s.name, s.category, s.unit, s.stock, s.min_stock, s.cost,
                    s.supplier_id, sup.name AS supplier_name, s.is_active
               FROM supplies s
          LEFT JOIN suppliers sup ON sup.id = s.supplier_id
              WHERE s.id = ? AND s.business_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $bid]);
        $row = $stmt->fetch();
        return $row ? $this->cast($row) : null;
    }

    public function create(int $bid, array $d): int
    {
        $pdo = Database::pdo();
        $pdo->prepare(
            'INSERT INTO supplies
                (business_id, name, category, unit, stock, min_stock, cost, supplier_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $bid, $d['name'], $d['category'], $d['unit'], $d['stock'],
            $d['min_stock'], $d['cost'], $d['supplier_id'],
        ]);
        return (int) $pdo->lastInsertId();
    }

    public function update(int $bid, int $id, array $d): void
    {
        // No toca 'stock': eso solo cambia por movimientos.
        Database::pdo()->prepare(
            'UPDATE supplies
                SET name = ?, category = ?, unit = ?, min_stock = ?, cost = ?,
                    supplier_id = ?, is_active = ?
              WHERE id = ? AND business_id = ?'
        )->execute([
            $d['name'], $d['category'], $d['unit'], $d['min_stock'], $d['cost'],
            $d['supplier_id'], $d['is_active'], $id, $bid,
        ]);
    }

    public function deactivate(int $bid, int $id): void
    {
        Database::pdo()
            ->prepare('UPDATE supplies SET is_active = 0 WHERE id = ? AND business_id = ?')
            ->execute([$id, $bid]);
    }

    /**
     * Aplica un movimiento: ajusta el stock por el delta y registra el evento.
     * Devuelve el insumo actualizado.
     */
    public function applyMovement(
        int $bid,
        int $supplyId,
        string $type,
        float $delta,
        ?string $reason,
        ?int $userId,
    ): array {
        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            $pdo->prepare(
                'UPDATE supplies SET stock = stock + ? WHERE id = ? AND business_id = ?'
            )->execute([$delta, $supplyId, $bid]);

            $pdo->prepare(
                'INSERT INTO supply_movements
                    (business_id, supply_id, type, quantity, reason, user_id)
                 VALUES (?, ?, ?, ?, ?, ?)'
            )->execute([$bid, $supplyId, $type, $delta, $reason, $userId]);

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        return $this->get($bid, $supplyId) ?? [];
    }

    public function movements(int $bid, int $supplyId, int $limit = 100): array
    {
        $limit = min(max($limit, 1), 500);
        $stmt  = Database::pdo()->prepare(
            'SELECT m.id, m.type, m.quantity, m.reason, m.user_id, u.name AS user_name, m.created_at
               FROM supply_movements m
          LEFT JOIN users u ON u.id = m.user_id
              WHERE m.business_id = ? AND m.supply_id = ?
              ORDER BY m.created_at DESC
              LIMIT ' . $limit
        );
        $stmt->execute([$bid, $supplyId]);
        return array_map(static function (array $m): array {
            $m['id']       = (int) $m['id'];
            $m['quantity'] = (float) $m['quantity'];
            return $m;
        }, $stmt->fetchAll());
    }

    private function cast(array $r): array
    {
        $r['id']          = (int) $r['id'];
        $r['stock']       = (float) $r['stock'];
        $r['min_stock']   = $r['min_stock'] !== null ? (float) $r['min_stock'] : null;
        $r['cost']        = $r['cost'] !== null ? (float) $r['cost'] : null;
        $r['supplier_id'] = $r['supplier_id'] !== null ? (int) $r['supplier_id'] : null;
        $r['is_active']   = (int) $r['is_active'];
        return $r;
    }
}
