<?php
namespace Pizzalog\\Core;

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
            $payload = Jwt::decode($token, (string) ($jwt['secret'] ?? ''));
            if (
                $payload === null
                || ($payload['iss'] ?? null) !== ($jwt['issuer'] ?? 'pizzalog')
                || ($payload['aud'] ?? null) !== 'pizzalog-tools'
                || empty($payload['sub'])
            ) {
                Response::error('Sesión de Tools inválida o vencida', 401);
            }

            $stmt = Database::pdo()->prepare(
                'SELECT id, email, name, is_active, expires_at
                   FROM tools_accounts
                  WHERE id = ?
                  LIMIT 1'
            );
            $stmt->execute([(int) $payload['sub']]);
            $account = $stmt->fetch();

            if (!$account || (int) $account['is_active'] !== 1) {
                Response::error('La cuenta de Tools está deshabilitada', 403);
            }
            if ($account['expires_at'] !== null && strtotime($account['expires_at']) <= time()) {
                Response::error('El acceso a Pizzalog Tools ha vencido', 403);
            }

            $req->auth = [
                'tools_account_id' => (int) $account['id'],
                'tools_email' => (string) $account['email'],
                'tools_name' => (string) $account['name'],
            ];
        };
    }
}
