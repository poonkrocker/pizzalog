<?php
namespace Pizzalog\Repositories;

use Pizzalog\Core\Database;

class SupplierRepository
{
    public function list(int $bid, bool $activeOnly = false): array
    {
        $sql = 'SELECT id, name, contact_name, phone, email, cuit, notes, is_active
                  FROM suppliers WHERE business_id = ?';
        if ($activeOnly) {
            $sql .= ' AND is_active = 1';
        }
        $sql .= ' ORDER BY name';
        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute([$bid]);
        return array_map([$this, 'cast'], $stmt->fetchAll());
    }

    public function get(int $bid, int $id): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, name, contact_name, phone, email, cuit, notes, is_active
               FROM suppliers WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $bid]);
        $row = $stmt->fetch();
        return $row ? $this->cast($row) : null;
    }

    public function create(int $bid, array $d): int
    {
        $pdo = Database::pdo();
        $pdo->prepare(
            'INSERT INTO suppliers (business_id, name, contact_name, phone, email, cuit, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([$bid, $d['name'], $d['contact_name'], $d['phone'], $d['email'], $d['cuit'], $d['notes']]);
        return (int) $pdo->lastInsertId();
    }

    public function update(int $bid, int $id, array $d): void
    {
        Database::pdo()->prepare(
            'UPDATE suppliers
                SET name = ?, contact_name = ?, phone = ?, email = ?, cuit = ?, notes = ?, is_active = ?
              WHERE id = ? AND business_id = ?'
        )->execute([
            $d['name'], $d['contact_name'], $d['phone'], $d['email'], $d['cuit'], $d['notes'],
            $d['is_active'], $id, $bid,
        ]);
    }

    public function deactivate(int $bid, int $id): void
    {
        Database::pdo()
            ->prepare('UPDATE suppliers SET is_active = 0 WHERE id = ? AND business_id = ?')
            ->execute([$id, $bid]);
    }

    private function cast(array $r): array
    {
        $r['id']        = (int) $r['id'];
        $r['is_active'] = (int) $r['is_active'];
        return $r;
    }
}
