<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Config;
use Pizzalog\Core\Database;
use Pizzalog\Core\Jwt;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

class ToolsAuthController
{
    public function login(Request $req): void
    {
        $email = strtolower(trim((string) $req->input('email', '')));
        $password = (string) $req->input('password', '');

        if ($email === '' || $password === '' || strlen($email) > 190) {
            Response::error('Ingresá email y contraseña', 422);
        }

        $stmt = Database::pdo()->prepare(
            'SELECT id, email, name, password_hash, is_active, expires_at
               FROM tools_accounts
              WHERE email = ?
              LIMIT 1'
        );
        $stmt->execute([$email]);
        $account = $stmt->fetch();

        if (!$account || !password_verify($password, (string) $account['password_hash'])) {
            // Mensaje genérico para no revelar si una cuenta existe.
            Response::error('Email o contraseña incorrectos', 401);
        }
        if ((int) $account['is_active'] !== 1) {
            Response::error('El acceso a esta cuenta no está habilitado', 403);
        }
        if ($account['expires_at'] !== null && strtotime($account['expires_at']) <= time()) {
            Response::error('El acceso a Pizzalog Tools ha vencido', 403);
        }

        $pdo = Database::pdo();
        $pdo->prepare('UPDATE tools_accounts SET last_login_at = NOW() WHERE id = ?')
            ->execute([(int) $account['id']]);

        $jwt = Config::get('jwt', []);
        $token = Jwt::encode(
            [
                'sub' => (int) $account['id'],
                'aud' => 'pizzalog-tools',
            ],
            (string) ($jwt['secret'] ?? ''),
            min((int) ($jwt['ttl'] ?? 28800), 43200),
            (string) ($jwt['issuer'] ?? 'pizzalog')
        );

        Response::ok([
            'token' => $token,
            'account' => [
                'id' => (int) $account['id'],
                'email' => (string) $account['email'],
                'name' => (string) $account['name'],
                'expires_at' => $account['expires_at'],
            ],
        ]);
    }

    public function me(Request $req): void
    {
        Response::ok([
            'account' => [
                'id' => (int) $req->auth['tools_account_id'],
                'email' => (string) $req->auth['tools_email'],
                'name' => (string) $req->auth['tools_name'],
            ],
        ]);
    }
}
