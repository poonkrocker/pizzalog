<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

/**
 * Gestión de empleados. Solo accesible por admin (ver rutas).
 * Las credenciales (password_hash, pin_hash) NUNCA se devuelven al cliente.
 */
class UserController
{
    private const ROLES = ['admin', 'manager', 'cashier', 'kitchen'];

    /** GET /users */
    public function index(Request $req): void
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, name, email, role, hourly_rate, password_hash, pin_hash, is_active, created_at
               FROM users WHERE business_id = ? ORDER BY name'
        );
        $stmt->execute([(int) $req->auth['business_id']]);
        Response::ok(['users' => array_map([$this, 'toPublic'], $stmt->fetchAll())]);
    }

    /** GET /users/{id} */
    public function show(Request $req): void
    {
        Response::ok(['user' => $this->toPublic($this->findOwned($req, (int) $req->param('id')))]);
    }

    /** POST /users   Body: { name, role, email?, password?, pin?, hourly_rate? } */
    public function store(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $d   = $this->validate($req, $bid, null);

        $pdo  = Database::pdo();
        $stmt = $pdo->prepare(
            'INSERT INTO users (business_id, name, email, password_hash, pin_hash, role, hourly_rate)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $bid, $d['name'], $d['email'], $d['passwordHash'], $d['pinHash'], $d['role'], $d['rate'],
        ]);
        $id = (int) $pdo->lastInsertId();

        Response::ok(['user' => $this->toPublic($this->findOwned($req, $id))], 201);
    }

    /** PUT /users/{id}   (password/pin solo se cambian si se envían) */
    public function update(Request $req): void
    {
        $bid      = (int) $req->auth['business_id'];
        $id       = (int) $req->param('id');
        $existing = $this->findOwned($req, $id);
        $d        = $this->validate($req, $bid, $id);

        // No dejar al negocio sin ningún administrador.
        if ($existing['role'] === 'admin' && $d['role'] !== 'admin' && $this->countActiveAdmins($bid) <= 1) {
            Response::error('No podés quitarle el rol de administrador al único admin', 422);
        }

        $passwordHash = $d['passwordProvided'] ? $d['passwordHash'] : $existing['password_hash'];
        $pinHash      = $d['pinProvided'] ? $d['pinHash'] : $existing['pin_hash'];
        $isActive     = (int) (bool) $req->input('is_active', $existing['is_active']);

        Database::pdo()->prepare(
            'UPDATE users
                SET name = ?, email = ?, password_hash = ?, pin_hash = ?, role = ?,
                    hourly_rate = ?, is_active = ?
              WHERE id = ? AND business_id = ?'
        )->execute([
            $d['name'], $d['email'], $passwordHash, $pinHash, $d['role'], $d['rate'], $isActive, $id, $bid,
        ]);

        Response::ok(['user' => $this->toPublic($this->findOwned($req, $id))]);
    }

    /** DELETE /users/{id}  (baja lógica) */
    public function destroy(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');

        if ($id === (int) $req->auth['user_id']) {
            Response::error('No podés desactivar tu propio usuario', 422);
        }

        $target = $this->findOwned($req, $id);
        if ($target['role'] === 'admin' && $this->countActiveAdmins($bid) <= 1) {
            Response::error('No podés desactivar al único administrador', 422);
        }

        Database::pdo()
            ->prepare('UPDATE users SET is_active = 0 WHERE id = ? AND business_id = ?')
            ->execute([$id, $bid]);

        Response::ok(['deleted' => true]);
    }

    // -----------------------------------------------------------------

    private function validate(Request $req, int $bid, ?int $id): array
    {
        $name = trim((string) $req->input('name', ''));
        if ($name === '') {
            Response::error('El nombre es obligatorio', 422);
        }

        $role = (string) $req->input('role', 'cashier');
        if (!in_array($role, self::ROLES, true)) {
            Response::error('Rol inválido', 422);
        }

        // Email (opcional, único en el negocio).
        $email   = null;
        $emailIn = $req->input('email');
        if (is_string($emailIn) && trim($emailIn) !== '') {
            $email = trim($emailIn);
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                Response::error('El email no es válido', 422);
            }
            if ($this->emailInUse($bid, $email, $id)) {
                Response::error('Ese email ya está en uso', 422);
            }
        }

        // Valor por hora (opcional).
        $rate   = null;
        $rateIn = $req->input('hourly_rate');
        if ($rateIn !== null && $rateIn !== '') {
            if (!is_numeric($rateIn) || (float) $rateIn < 0) {
                Response::error('El valor por hora debe ser un número positivo', 422);
            }
            $rate = (float) $rateIn;
        }

        // Contraseña de panel (opcional).
        $passwordHash = null;
        $passwordProvided = false;
        $pwd = $req->input('password');
        if (is_string($pwd) && $pwd !== '') {
            if (strlen($pwd) < 8) {
                Response::error('La contraseña debe tener al menos 8 caracteres', 422);
            }
            $passwordHash = password_hash($pwd, PASSWORD_DEFAULT);
            $passwordProvided = true;
        }

        // PIN de TPV/fichaje (opcional, único entre empleados activos).
        $pinHash = null;
        $pinProvided = false;
        $pin = $req->input('pin');
        if (is_string($pin) && $pin !== '') {
            if (!preg_match('/^\d{4,6}$/', $pin)) {
                Response::error('El PIN debe tener entre 4 y 6 dígitos', 422);
            }
            if ($this->pinInUse($bid, $pin, $id)) {
                Response::error('Ese PIN ya lo usa otro empleado', 422);
            }
            $pinHash = password_hash($pin, PASSWORD_DEFAULT);
            $pinProvided = true;
        }

        return compact(
            'name', 'role', 'email', 'rate',
            'passwordHash', 'passwordProvided', 'pinHash', 'pinProvided'
        );
    }

    private function toPublic(array $u): array
    {
        return [
            'id'           => (int) $u['id'],
            'name'         => $u['name'],
            'email'        => $u['email'],
            'role'         => $u['role'],
            'hourly_rate'  => $u['hourly_rate'] !== null ? (float) $u['hourly_rate'] : null,
            'is_active'    => (int) $u['is_active'],
            'has_password' => !empty($u['password_hash']),
            'has_pin'      => !empty($u['pin_hash']),
            'created_at'   => $u['created_at'] ?? null,
        ];
    }

    private function findOwned(Request $req, int $id): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, name, email, password_hash, pin_hash, role, hourly_rate, is_active, created_at
               FROM users WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$id, (int) $req->auth['business_id']]);
        $user = $stmt->fetch();

        if (!$user) {
            Response::error('Empleado no encontrado', 404);
        }
        return $user;
    }

    private function emailInUse(int $bid, string $email, ?int $exceptId): bool
    {
        $sql    = 'SELECT 1 FROM users WHERE business_id = ? AND email = ?';
        $params = [$bid, $email];
        if ($exceptId !== null) {
            $sql     .= ' AND id <> ?';
            $params[] = $exceptId;
        }
        $sql .= ' LIMIT 1';
        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        return (bool) $stmt->fetch();
    }

    /**
     * El PIN se guarda hasheado (con salt único), así que no se puede comparar
     * por igualdad en SQL: verificamos contra cada empleado activo con PIN.
     * Son pocos por negocio, así que el costo es mínimo.
     */
    private function pinInUse(int $bid, string $pin, ?int $exceptId): bool
    {
        $sql    = 'SELECT id, pin_hash FROM users
                    WHERE business_id = ? AND pin_hash IS NOT NULL AND is_active = 1';
        $params = [$bid];
        if ($exceptId !== null) {
            $sql     .= ' AND id <> ?';
            $params[] = $exceptId;
        }
        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);

        foreach ($stmt->fetchAll() as $row) {
            if (password_verify($pin, $row['pin_hash'])) {
                return true;
            }
        }
        return false;
    }

    private function countActiveAdmins(int $bid): int
    {
        $stmt = Database::pdo()->prepare(
            'SELECT COUNT(*) FROM users WHERE business_id = ? AND role = "admin" AND is_active = 1'
        );
        $stmt->execute([$bid]);
        return (int) $stmt->fetchColumn();
    }
}
