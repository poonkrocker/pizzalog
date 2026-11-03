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

        $pdo = Database::pdo();
        $jwtConfig = Config::get('jwt', []);
        $emailHash = hash_hmac('sha256', $email, (string)($jwtConfig['secret'] ?? ''));
        $clientIp = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
        $ipHash = hash_hmac('sha256', $clientIp, (string)($jwtConfig['secret'] ?? ''));
        $attemptQuery = $pdo->prepare(
            'SELECT attempts, window_started_at FROM tools_login_attempts
              WHERE email_hash = ? AND ip_hash = ? LIMIT 1'
        );
        $attemptQuery->execute([$emailHash, $ipHash]);
        $attemptRow = $attemptQuery->fetch();
        if ($attemptRow && strtotime((string)$attemptRow['window_started_at']) > time() - 900) {
            if ((int)$attemptRow['attempts'] >= 10) {
                Response::error('Demasiados intentos. Esperá 15 minutos antes de volver a ingresar.', 429);
            }
            $pdo->prepare(
                'UPDATE tools_login_attempts SET attempts = attempts + 1
                  WHERE email_hash = ? AND ip_hash = ?'
            )->execute([$emailHash, $ipHash]);
        } else {
            $pdo->prepare(
                'INSERT INTO tools_login_attempts (email_hash, ip_hash, attempts, window_started_at)
                 VALUES (?, ?, 1, NOW())
                 ON DUPLICATE KEY UPDATE attempts = 1, window_started_at = NOW()'
            )->execute([$emailHash, $ipHash]);
        }

        $stmt = $pdo->prepare(
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

        $pdo->prepare('DELETE FROM tools_login_attempts WHERE email_hash = ? AND ip_hash = ?')
            ->execute([$emailHash, $ipHash]);
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
