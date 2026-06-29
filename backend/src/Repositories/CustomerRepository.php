<?php
namespace Pizzalog\Repositories;

use Pizzalog\Core\Database;

class CustomerRepository
{
    /** Lista clientes; si hay $q, busca por nombre o teléfono. */
    public function list(int $bid, ?string $q = null, int $limit = 100): array
    {
        $limit  = min(max($limit, 1), 500);
        $params = [$bid];
        $sql    = 'SELECT id, name, phone, email, address, notes, created_at
                     FROM customers WHERE business_id = ?';
        if ($q !== null && $q !== '') {
            $sql     .= ' AND (name LIKE ? OR phone LIKE ?)';
            $like     = '%' . $q . '%';
            $params[] = $like;
            $params[] = $like;
        }
        $sql .= ' ORDER BY name LIMIT ' . $limit;

        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        return array_map([$this, 'cast'], $stmt->fetchAll());
    }

    public function get(int $bid, int $id): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, name, phone, email, address, notes, created_at
               FROM customers WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $bid]);
        $row = $stmt->fetch();
        return $row ? $this->cast($row) : null;
    }

    public function create(int $bid, array $d): int
    {
        $pdo = Database::pdo();
        $pdo->prepare(
            'INSERT INTO customers (business_id, name, phone, email, address, notes)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$bid, $d['name'], $d['phone'], $d['email'], $d['address'], $d['notes']]);
        return (int) $pdo->lastInsertId();
    }

    public function update(int $bid, int $id, array $d): void
    {
        Database::pdo()->prepare(
            'UPDATE customers
                SET name = ?, phone = ?, email = ?, address = ?, notes = ?
              WHERE id = ? AND business_id = ?'
        )->execute([$d['name'], $d['phone'], $d['email'], $d['address'], $d['notes'], $id, $bid]);
    }

    public function delete(int $bid, int $id): void
    {
        Database::pdo()
            ->prepare('DELETE FROM customers WHERE id = ? AND business_id = ?')
            ->execute([$id, $bid]);
    }

    private function cast(array $r): array
    {
        $r['id'] = (int) $r['id'];
        return $r;
    }
}
