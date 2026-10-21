<?php
namespace Pizzalog\Repositories;

use Pizzalog\Core\Database;

class CustomerRepository
{
    private static bool $ensured = false;

    public function __construct()
    {
        self::ensureSchema();
    }

    public static function ensureSchema(): void
    {
        if (self::$ensured) {
            return;
        }
        try {
            $pdo = Database::pdo();
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS customers (
                    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    business_id INT UNSIGNED NOT NULL,
                    name VARCHAR(120) NOT NULL,
                    phone VARCHAR(40) NULL,
                    email VARCHAR(120) NULL,
                    address VARCHAR(255) NULL,
                    notes TEXT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_customers_business (business_id),
                    INDEX idx_customers_phone (business_id, phone)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");
            self::$ensured = true;
        } catch (\Throwable $e) {
            // Ignorar si no tiene permisos DDL
        }
    }

    /**
     * Normaliza un número telefónico dejando solo dígitos significativos para comparación
     * (últimos 10 dígitos en números de Argentina con prefijo 54/549/0/15, o todos los dígitos si tiene menos de 10).
     */
    public static function normalizePhoneKey(?string $raw): string
    {
        if ($raw === null) {
            return '';
        }
        $digits = preg_replace('/\D+/', '', $raw) ?? '';
        if ($digits === '' || strlen($digits) < 6) {
            return '';
        }
        if (str_starts_with($digits, '549') && strlen($digits) >= 12) {
            $digits = substr($digits, 3);
        } elseif (str_starts_with($digits, '54') && strlen($digits) >= 11) {
            $digits = substr($digits, 2);
        }
        if (str_starts_with($digits, '0')) {
            $digits = substr($digits, 1);
        }
        if (strlen($digits) === 12 && preg_match('/^(\d{2,4})15(\d{6,8})$/', $digits, $m)) {
            $digits = $m[1] . $m[2];
        }
        if (strlen($digits) > 10) {
            $digits = substr($digits, -10);
        }
        return $digits;
    }

    /**
     * Guarda automáticamente al cliente en la planilla de clientes si su número de teléfono
     * no existe previamente en el negocio (compara EXCLUSIVAMENTE por teléfono, nunca por nombre).
     */
    public function upsertByPhone(int $bid, ?string $name, ?string $phone, ?string $address = null, ?string $notes = null): ?int
    {
        $cleanPhone = trim((string) $phone);
        $phoneKey   = self::normalizePhoneKey($cleanPhone);
        if ($phoneKey === '') {
            return null;
        }

        $pdo  = Database::pdo();
        $stmt = $pdo->prepare(
            'SELECT id, phone, address FROM customers WHERE business_id = ? AND phone IS NOT NULL AND phone != ""'
        );
        $stmt->execute([$bid]);

        foreach ($stmt->fetchAll() as $row) {
            $existingKey = self::normalizePhoneKey((string) $row['phone']);
            if ($existingKey !== '' && $existingKey === $phoneKey) {
                $existingId = (int) $row['id'];
                // Si el cliente ya existía pero no tenía dirección guardada y el pedido trae dirección, la completamos
                $cleanAddr = trim((string) $address);
                if ($cleanAddr !== '' && empty(trim((string) ($row['address'] ?? '')))) {
                    $pdo->prepare('UPDATE customers SET address = ? WHERE id = ? AND business_id = ?')
                        ->execute([$cleanAddr, $existingId, $bid]);
                }
                return $existingId;
            }
        }

        $cleanName = trim((string) $name);
        if ($cleanName === '') {
            $cleanName = 'Cliente ' . $cleanPhone;
        }
        $cleanAddr  = trim((string) $address) ?: null;
        $cleanNotes = trim((string) $notes) ?: null;

        return $this->create($bid, [
            'name'    => mb_substr($cleanName, 0, 120),
            'phone'   => mb_substr($cleanPhone, 0, 40),
            'email'   => null,
            'address' => $cleanAddr ? mb_substr($cleanAddr, 0, 255) : null,
            'notes'   => $cleanNotes,
        ]);
    }

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
