<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Config;
use Pizzalog\Core\Database;
use Pizzalog\Core\Jwt;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Services\LoyverseMigrationService;

class AuthController
{
    public function __construct()
    {
        UserController::ensureSchema();
        LoyverseMigrationService::ensureMigrated();
    }

    /**
     * POST /auth/login
     * Body: { "email"?: "...", "username"?: "...", "password": "...", "app"?: "pos"|"panel"|"portal" }
     * Permite iniciar sesión tanto por nombre de usuario (username) como por email.
     */
    public function login(Request $req): void
    {
        $identifier = trim((string) ($req->input('username') ?? $req->input('email') ?? ''));
        $password   = (string) $req->input('password', '');
        $app        = (string) $req->input('app', '');

        if ($identifier === '' || $password === '') {
            Response::error('Usuario y contraseña son obligatorios', 422);
        }

        $pdo  = Database::pdo();
        $stmt = $pdo->prepare(
            'SELECT u.id, u.business_id, u.name, u.username, u.email, u.password_hash, u.role,
                    u.allowed_modules, u.can_use_pos, u.staff_person_id, u.is_active,
                    sp.code AS staff_code
               FROM users u
          LEFT JOIN staff_people sp ON sp.id = u.staff_person_id
              WHERE (LOWER(u.username) = LOWER(?) OR LOWER(u.email) = LOWER(?))
              ORDER BY u.is_active DESC, u.id ASC
              LIMIT 1'
        );
        $stmt->execute([$identifier, $identifier]);
        $user = $stmt->fetch();

        $valid = $user
            && (int) $user['is_active'] === 1
            && !empty($user['password_hash'])
            && password_verify($password, $user['password_hash']);

        if (!$valid) {
            Response::error('Usuario o contraseña incorrectos', 401);
        }

        if ($app === 'pos' && isset($user['can_use_pos']) && (int) $user['can_use_pos'] === 0 && $user['role'] !== 'admin') {
            Response::error('Tu usuario no tiene habilitado el acceso a la aplicación TPV', 403);
        }

        $jwt = Config::get('jwt');
        $token = Jwt::encode(
            [
                'sub'         => (int) $user['id'],
                'business_id' => (int) $user['business_id'],
                'role'        => $user['role'],
            ],
            $jwt['secret'],
            (int) $jwt['ttl'],
            $jwt['issuer']
        );

        Response::ok([
            'token' => $token,
            'user'  => $this->formatUser($user),
        ]);
    }

    /**
     * GET /auth/me (requiere token)
     */
    public function me(Request $req): void
    {
        $stmt = Database::pdo()->prepare(
            'SELECT u.id, u.business_id, u.name, u.username, u.email, u.role,
                    u.allowed_modules, u.can_use_pos, u.staff_person_id,
                    sp.code AS staff_code
               FROM users u
          LEFT JOIN staff_people sp ON sp.id = u.staff_person_id
              WHERE u.id = ? AND u.business_id = ?
              LIMIT 1'
        );
        $stmt->execute([$req->auth['user_id'], $req->auth['business_id']]);
        $user = $stmt->fetch();

        if (!$user) {
            Response::error('Usuario no encontrado', 404);
        }

        Response::ok([
            'user' => $this->formatUser($user),
        ]);
    }

    /**
     * POST /auth/change-password (requiere token)
     * Body: { current_password: string, new_password: string }
     * Permite a cualquier empleado o usuario cambiar su propia contraseña.
     */
    public function changePassword(Request $req): void
    {
        $userId = (int) $req->auth['user_id'];
        $bid    = (int) $req->auth['business_id'];

        $currentPwd = (string) $req->input('current_password', '');
        $newPwd     = (string) $req->input('new_password', '');

        if ($currentPwd === '' || $newPwd === '') {
            Response::error('Completá tu contraseña actual y la nueva contraseña', 422);
        }
        if (strlen($newPwd) < 4) {
            Response::error('La nueva contraseña debe tener al menos 4 caracteres', 422);
        }

        $pdo  = Database::pdo();
        $stmt = $pdo->prepare('SELECT id, password_hash FROM users WHERE id = ? AND business_id = ? AND is_active = 1 LIMIT 1');
        $stmt->execute([$userId, $bid]);
        $user = $stmt->fetch();

        if (!$user || empty($user['password_hash']) || !password_verify($currentPwd, $user['password_hash'])) {
            Response::error('La contraseña actual no es correcta', 422);
        }

        $newHash = password_hash($newPwd, PASSWORD_DEFAULT);
        $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ? AND business_id = ?')
            ->execute([$newHash, $userId, $bid]);

        Response::ok(['changed' => true, 'message' => 'Contraseña actualizada correctamente']);
    }

    private function formatUser(array $user): array
    {
        $mods = null;
        if (isset($user['allowed_modules']) && $user['allowed_modules'] !== null && $user['allowed_modules'] !== '') {
            $decoded = json_decode((string) $user['allowed_modules'], true);
            if (is_array($decoded)) {
                $mods = array_values(array_map('strval', $decoded));
            }
        }

        return [
            'id'              => (int) $user['id'],
            'name'            => $user['name'],
            'username'        => $user['username'] ?? null,
            'email'           => $user['email'] ?? null,
            'role'            => $user['role'],
            'business_id'     => (int) $user['business_id'],
            'allowed_modules' => $mods,
            'can_use_pos'     => isset($user['can_use_pos']) ? (int) $user['can_use_pos'] === 1 : true,
            'staff_person_id' => isset($user['staff_person_id']) && $user['staff_person_id'] !== null ? (int) $user['staff_person_id'] : null,
            'staff_code'      => $user['staff_code'] ?? null,
        ];
    }
}
