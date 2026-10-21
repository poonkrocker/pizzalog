<?php
namespace Pizzalog\Core;

class Auth
{
    public static function authenticate(): callable
    {
        return function (Request $req): void {
            $token = $req->bearerToken();
            if ($token === null) {
                Response::error('Falta el token de autenticación', 401);
            }

            $secret = Config::get('jwt')['secret'] ?? '';
            $payload = Jwt::decode($token, $secret);
            if ($payload === null) {
                Response::error('Token inválido o expirado', 401);
            }

            $req->auth = [
                'user_id'     => isset($payload['sub']) ? (int) $payload['sub'] : null,
                'business_id' => isset($payload['business_id']) ? (int) $payload['business_id'] : null,
                'role'        => $payload['role'] ?? null,
            ];

            if ($req->auth['user_id'] === null || $req->auth['business_id'] === null) {
                Response::error('Token incompleto', 401);
            }
        };
    }

    public static function requireRole(array $roles): callable
    {
        return function (Request $req) use ($roles): void {
            $role = $req->auth['role'] ?? '';
            if (in_array($role, $roles, true)) {
                return;
            }
            // Si el endpoint permite 'manager' y el empleado tiene módulos del panel asignados por el admin, permitir
            if (in_array('manager', $roles, true) && !empty($req->auth['user_id'])) {
                try {
                    $stmt = Database::pdo()->prepare(
                        'SELECT allowed_modules FROM users WHERE id = ? AND business_id = ? AND is_active = 1 LIMIT 1'
                    );
                    $stmt->execute([(int) $req->auth['user_id'], (int) $req->auth['business_id']]);
                    $raw = $stmt->fetchColumn();
                    if ($raw && is_string($raw)) {
                        $mods = json_decode($raw, true);
                        if (is_array($mods) && count($mods) > 0) {
                            return;
                        }
                    }
                } catch (\Throwable) {
                }
            }
            Response::error('No tenés permiso para esta acción', 403);
        };
    }
}
