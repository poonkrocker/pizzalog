<?php
namespace Pizzalog\Core;

/**
 * Middleware de autenticación y aislamiento estricto para cuentas de Pizzalog Tools.
 */
class ToolsAuth
{
    public static function authenticate(): callable
    {
        return function (Request $req): void {
            $token = $req->bearerToken();
            if ($token === null) {
                Response::error('Iniciá sesión para acceder a Pizzalog Tools', 401);
            }

            $jwt = Config::get('jwt', []);
            $secret = (string)($jwt['secret'] ?? '');
            if (strlen($secret) < 32 || str_contains($secret, 'CAMBIAR')) {
                Response::error('La autenticación de Pizzalog Tools no está configurada con una clave segura en el servidor', 503);
            }

            $payload = Jwt::decode($token, $secret);
            if (
                $payload === null
                || ($payload['iss'] ?? null) !== ($jwt['issuer'] ?? 'pizzalog')
                || ($payload['aud'] ?? null) !== 'pizzalog-tools'
                || empty($payload['sub'])
                || !in_array(($payload['env'] ?? null), ['production', 'staging'], true)
            ) {
                Response::error('Sesión de Tools inválida o vencida', 401);
            }

            $pdo = Database::pdo();
            $stmt = $pdo->prepare(
                'SELECT ta.id, ta.email, ta.name, ta.is_active, ta.expires_at, ta.environment,
                        ta.app_user_id, ta.business_id,
                        u.is_active AS app_user_active, u.role AS app_user_role,
                        u.email AS app_user_email, u.business_id AS app_user_business_id
                   FROM tools_accounts ta
              LEFT JOIN users u ON u.id = ta.app_user_id
                  WHERE ta.id = ? AND ta.environment = ?
                  LIMIT 1'
            );
            $stmt->execute([(int) $payload['sub'], (string)$payload['env']]);
            $account = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$account || (int) $account['is_active'] !== 1) {
                Response::error('La cuenta de Tools está deshabilitada', 403);
            }
            if ($account['expires_at'] !== null && strtotime($account['expires_at']) <= time()) {
                Response::error('El acceso a Pizzalog Tools ha vencido', 403);
            }

            // Si está vinculada a un usuario de Pizzalog App, verificar consistencia y permisos
            if ($account['app_user_id'] !== null) {
                if (
                    $account['app_user_active'] === null
                    || (int)$account['app_user_active'] !== 1
                    || $account['app_user_role'] !== 'admin'
                ) {
                    Response::error('El usuario vinculado de Pizzalog App ya no tiene permisos para acceder a Tools', 403);
                }
            }

            $req->auth = [
                'tools_account_id' => (int) $account['id'],
                'tools_email' => (string) $account['email'],
                'tools_name' => (string) $account['name'],
                'tools_environment' => (string) $account['environment'],
                'business_id' => !empty($account['business_id']) ? (int) $account['business_id'] : (!empty($account['app_user_business_id']) ? (int) $account['app_user_business_id'] : null),
                'app_user_id' => !empty($account['app_user_id']) ? (int) $account['app_user_id'] : null,
            ];
        };
    }
}
