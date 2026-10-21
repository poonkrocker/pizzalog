<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

/**
 * Gestión de usuarios y permisos individuales (acceso a herramientas del Panel,
 * acceso a la app TPV, nombre de usuario y vinculación con perfil de empleado).
 */
class UserController
{
    private const ROLES = ['admin', 'manager', 'cashier', 'kitchen'];
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
            $cols = [
                'username'        => "ALTER TABLE users ADD COLUMN username VARCHAR(60) NULL AFTER name",
                'allowed_modules' => "ALTER TABLE users ADD COLUMN allowed_modules TEXT NULL AFTER role",
                'can_use_pos'     => "ALTER TABLE users ADD COLUMN can_use_pos TINYINT(1) NOT NULL DEFAULT 1 AFTER allowed_modules",
                'staff_person_id' => "ALTER TABLE users ADD COLUMN staff_person_id INT NULL AFTER can_use_pos",
            ];
            foreach ($cols as $col => $ddl) {
                $exists = $pdo->query("SHOW COLUMNS FROM users LIKE '$col'")->fetch();
                if (!$exists) {
                    $pdo->exec($ddl);
                }
            }
            // Permitir que email sea NULL cuando se crea usuario solo con username
            $emailCol = $pdo->query("SHOW COLUMNS FROM users LIKE 'email'")->fetch();
            if ($emailCol && isset($emailCol['Null']) && strtoupper((string) $emailCol['Null']) === 'NO') {
                $pdo->exec("ALTER TABLE users MODIFY email VARCHAR(120) NULL");
            }

            // Si un usuario existente no tiene username pero tiene email, inicializar username con la parte antes de @
            $pdo->exec("UPDATE users SET username = LOWER(SUBSTRING_INDEX(email, '@', 1)) WHERE (username IS NULL OR username = '') AND email IS NOT NULL AND email != ''");

            // Vincular o crear usuarios iniciales para perfiles de staff_people que aún no tengan usuario
            $hasStaff = $pdo->query("SHOW TABLES LIKE 'staff_people'")->fetch();
            if ($hasStaff) {
                $people = $pdo->query("SELECT id, business_id, code, name, role, is_active FROM staff_people")->fetchAll();
                foreach ($people as $sp) {
                    $spId  = (int) $sp['id'];
                    $bid   = (int) $sp['business_id'];
                    $code  = strtolower(trim((string) $sp['code']));
                    if ($code === '') continue;

                    // Ver si ya hay un usuario vinculado a este staff_person_id
                    $linked = $pdo->prepare("SELECT id FROM users WHERE business_id = ? AND staff_person_id = ? LIMIT 1");
                    $linked->execute([$bid, $spId]);
                    if ($linked->fetchColumn()) {
                        continue;
                    }

                    // Ver si hay un usuario con ese username o nombre
                    $byUser = $pdo->prepare("SELECT id FROM users WHERE business_id = ? AND (LOWER(username) = ? OR LOWER(name) = LOWER(?)) LIMIT 1");
                    $byUser->execute([$bid, $code, $sp['name']]);
                    $existingUid = $byUser->fetchColumn();
                    if ($existingUid) {
                        $pdo->prepare("UPDATE users SET staff_person_id = ?, username = COALESCE(NULLIF(username, ''), ?) WHERE id = ?")
                            ->execute([$spId, $code, (int) $existingUid]);
                        continue;
                    }

                    // Crear usuario para el empleado con username = code (ej. ivan, lulu, bruno) y clave inicial = code + "123" (ej. ivan123)
                    $initialPwd  = $code . '123';
                    $pwdHash     = password_hash($initialPwd, PASSWORD_DEFAULT);
                    $userRole    = (stripos((string) $sp['role'], 'dueñ') !== false || stripos((string) $sp['role'], 'admin') !== false) ? 'admin' : 'cashier';
                    $defaultMods = $userRole === 'admin' ? null : json_encode([]);
                    $pdo->prepare(
                        "INSERT INTO users (business_id, name, username, email, password_hash, role, allowed_modules, can_use_pos, staff_person_id, is_active)
                         VALUES (?, ?, ?, NULL, ?, ?, ?, 1, ?, ?)"
                    )->execute([
                        $bid,
                        $sp['name'],
                        $code,
                        $pwdHash,
                        $userRole,
                        $defaultMods,
                        $spId,
                        (int) $sp['is_active'],
                    ]);
                }
            }

            self::$ensured = true;
        } catch (\Throwable $e) {
            // Ignorar si no tiene permisos DDL
        }
    }

    /** GET /users */
    public function index(Request $req): void
    {
        $stmt = Database::pdo()->prepare(
            'SELECT u.id, u.name, u.username, u.email, u.role, u.allowed_modules, u.can_use_pos,
                    u.staff_person_id, sp.name AS staff_person_name, sp.code AS staff_code,
                    u.hourly_rate, u.password_hash, u.pin_hash, u.is_active, u.created_at
               FROM users u
          LEFT JOIN staff_people sp ON sp.id = u.staff_person_id
              WHERE u.business_id = ?
              ORDER BY u.is_active DESC, u.name ASC'
        );
        $stmt->execute([(int) $req->auth['business_id']]);
        Response::ok(['users' => array_map([$this, 'toPublic'], $stmt->fetchAll())]);
    }

    /** GET /users/{id} */
    public function show(Request $req): void
    {
        Response::ok(['user' => $this->toPublic($this->findOwned($req, (int) $req->param('id')))]);
    }

    /** POST /users */
    public function store(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $d   = $this->validate($req, $bid, null);

        $pdo  = Database::pdo();
        $stmt = $pdo->prepare(
            'INSERT INTO users
                (business_id, name, username, email, password_hash, pin_hash, role,
                 allowed_modules, can_use_pos, staff_person_id, hourly_rate, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
        );
        $stmt->execute([
            $bid,
            $d['name'],
            $d['username'],
            $d['email'],
            $d['passwordHash'],
            $d['pinHash'],
            $d['role'],
            $d['allowedModulesJson'],
            $d['canUsePos'],
            $d['staffPersonId'],
            $d['rate'],
        ]);
        $id = (int) $pdo->lastInsertId();

        Response::ok(['user' => $this->toPublic($this->findOwned($req, $id))], 201);
    }

    /** PUT /users/{id} */
    public function update(Request $req): void
    {
        $bid      = (int) $req->auth['business_id'];
        $id       = (int) $req->param('id');
        $existing = $this->findOwned($req, $id);
        $d        = $this->validate($req, $bid, $id);

        if ($existing['role'] === 'admin' && $d['role'] !== 'admin' && $this->countActiveAdmins($bid) <= 1) {
            Response::error('No podés quitarle el rol de administrador al único admin', 422);
        }

        $passwordHash = $d['passwordProvided'] ? $d['passwordHash'] : $existing['password_hash'];
        $pinHash      = $d['pinProvided'] ? $d['pinHash'] : $existing['pin_hash'];
        $isActive     = (int) (bool) $req->input('is_active', $existing['is_active']);

        Database::pdo()->prepare(
            'UPDATE users
                SET name = ?, username = ?, email = ?, password_hash = ?, pin_hash = ?, role = ?,
                    allowed_modules = ?, can_use_pos = ?, staff_person_id = ?, hourly_rate = ?, is_active = ?
              WHERE id = ? AND business_id = ?'
        )->execute([
            $d['name'],
            $d['username'],
            $d['email'],
            $passwordHash,
            $pinHash,
            $d['role'],
            $d['allowedModulesJson'],
            $d['canUsePos'],
            $d['staffPersonId'],
            $d['rate'],
            $isActive,
            $id,
            $bid,
        ]);

        Response::ok(['user' => $this->toPublic($this->findOwned($req, $id))]);
    }

    /** DELETE /users/{id} (baja lógica) */
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

        $username = null;
        $userIn   = $req->input('username');
        if (is_string($userIn) && trim($userIn) !== '') {
            $username = strtolower(trim($userIn));
            if (!preg_match('/^[a-z0-9._-]{2,50}$/', $username)) {
                Response::error('El nombre de usuario solo puede tener letras, números, punto o guion (mín. 2 caracteres)', 422);
            }
            if ($this->usernameInUse($bid, $username, $id)) {
                Response::error('Ese nombre de usuario ya está en uso', 422);
            }
        }

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

        if ($username === null && $email === null) {
            Response::error('Indicá un nombre de usuario (o email) para que pueda iniciar sesión', 422);
        }

        $rate   = null;
        $rateIn = $req->input('hourly_rate');
        if ($rateIn !== null && $rateIn !== '') {
            if (!is_numeric($rateIn) || (float) $rateIn < 0) {
                Response::error('El valor por hora debe ser un número positivo', 422);
            }
            $rate = (float) $rateIn;
        }

        $passwordHash     = null;
        $passwordProvided = false;
        $pwd              = $req->input('password');
        if (is_string($pwd) && $pwd !== '') {
            if (strlen($pwd) < 4) {
                Response::error('La contraseña debe tener al menos 4 caracteres', 422);
            }
            $passwordHash     = password_hash($pwd, PASSWORD_DEFAULT);
            $passwordProvided = true;
        }

        $pinHash     = null;
        $pinProvided = false;
        $pin         = $req->input('pin');
        if (is_string($pin) && $pin !== '') {
            if (!preg_match('/^\d{4,6}$/', $pin)) {
                Response::error('El PIN debe tener entre 4 y 6 dígitos', 422);
            }
            if ($this->pinInUse($bid, $pin, $id)) {
                Response::error('Ese PIN ya lo usa otro empleado', 422);
            }
            $pinHash     = password_hash($pin, PASSWORD_DEFAULT);
            $pinProvided = true;
        }

        $allowedModulesJson = null;
        $modsIn             = $req->input('allowed_modules');
        if (is_array($modsIn)) {
            $cleanMods          = array_values(array_unique(array_filter(array_map('strval', $modsIn))));
            $allowedModulesJson = json_encode($cleanMods, JSON_UNESCAPED_UNICODE);
        }

        $canUsePos = (int) (bool) $req->input('can_use_pos', true);

        $staffPersonId = $req->input('staff_person_id');
        $staffPersonId = ($staffPersonId !== null && $staffPersonId !== '' && (int) $staffPersonId > 0)
            ? (int) $staffPersonId
            : null;

        return compact(
            'name',
            'username',
            'role',
            'email',
            'rate',
            'passwordHash',
            'passwordProvided',
            'pinHash',
            'pinProvided',
            'allowedModulesJson',
            'canUsePos',
            'staffPersonId'
        );
    }

    public function toPublic(array $u): array
    {
        $mods = null;
        if (isset($u['allowed_modules']) && $u['allowed_modules'] !== null && $u['allowed_modules'] !== '') {
            $decoded = json_decode((string) $u['allowed_modules'], true);
            if (is_array($decoded)) {
                $mods = array_values(array_map('strval', $decoded));
            }
        }

        return [
            'id'                => (int) $u['id'],
            'name'              => $u['name'],
            'username'          => $u['username'] ?? null,
            'email'             => $u['email'] ?? null,
            'role'              => $u['role'],
            'allowed_modules'   => $mods,
            'can_use_pos'       => isset($u['can_use_pos']) ? (int) $u['can_use_pos'] === 1 : true,
            'staff_person_id'   => isset($u['staff_person_id']) && $u['staff_person_id'] !== null ? (int) $u['staff_person_id'] : null,
            'staff_person_name' => $u['staff_person_name'] ?? null,
            'staff_code'        => $u['staff_code'] ?? null,
            'hourly_rate'       => $u['hourly_rate'] !== null ? (float) $u['hourly_rate'] : null,
            'is_active'         => (int) $u['is_active'],
            'has_password'      => !empty($u['password_hash']),
            'has_pin'           => !empty($u['pin_hash']),
            'created_at'        => $u['created_at'] ?? null,
        ];
    }

    private function findOwned(Request $req, int $id): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT u.id, u.name, u.username, u.email, u.password_hash, u.pin_hash, u.role,
                    u.allowed_modules, u.can_use_pos, u.staff_person_id,
                    sp.name AS staff_person_name, sp.code AS staff_code,
                    u.hourly_rate, u.is_active, u.created_at
               FROM users u
          LEFT JOIN staff_people sp ON sp.id = u.staff_person_id
              WHERE u.id = ? AND u.business_id = ? LIMIT 1'
        );
        $stmt->execute([$id, (int) $req->auth['business_id']]);
        $user = $stmt->fetch();

        if (!$user) {
            Response::error('Usuario no encontrado', 404);
        }
        return $user;
    }

    private function usernameInUse(int $bid, string $username, ?int $exceptId): bool
    {
        $sql    = 'SELECT 1 FROM users WHERE business_id = ? AND LOWER(username) = LOWER(?)';
        $params = [$bid, $username];
        if ($exceptId !== null) {
            $sql     .= ' AND id <> ?';
            $params[] = $exceptId;
        }
        $sql .= ' LIMIT 1';
        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        return (bool) $stmt->fetch();
    }

    private function emailInUse(int $bid, string $email, ?int $exceptId): bool
    {
        $sql    = 'SELECT 1 FROM users WHERE business_id = ? AND LOWER(email) = LOWER(?)';
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
