<?php
namespace Pizzalog\Core;

/**
 * Middlewares de seguridad.
 *
 * authenticate(): exige un token válido y completa $req->auth con
 *   user_id, business_id y role. A partir de acá, TODA consulta debe
 *   filtrar por $req->auth['business_id'] para aislar al tenant.
 *
 * requireRole(): exige que el rol del token esté en la lista permitida.
 */
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
            if (!in_array($role, $roles, true)) {
                Response::error('No tenés permiso para esta acción', 403);
            }
        };
    }
}
