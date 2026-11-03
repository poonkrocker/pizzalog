<?php
namespace Pizzalog\\Controllers;

use Pizzalog\\Core\\Config;
use Pizzalog\\Core\\Database;
use Pizzalog\\Core\\Jwt;
use Pizzalog\\Core\\Request;
use Pizzalog\\Core\\Response;

class ToolsAuthController
{
    public function login(Request $req): void
    {
        $email = strtolower(trim((string) $req->input('email', '')));
        $password = (string) $req->input('password', '');

        if ($email === '' || $password === '' || strlen($email) > 190 || strlen($password) > 1024) {
            Response::error('Ingresá un email válido y una contraseña de hasta 1024 caracteres', 422);
        }

        $pdo = Database::pdo();
        $jwtConfig = Config::get('jwt', []);
        $jwtSecret = (string)($jwtConfig['secret'] ?? '');
        if (strlen($jwtSecret) < 32 || str_contains($jwtSecret, 'CAMBIAR')) {
            Response::error('La autenticación de Pizzalog Tools no está configurada con una clave segura en el servidor', 503);
        }

        $emailHash = hash_hmac('sha256', $email, $jwtSecret);
        $clientIp = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
        $ipHash = hash_hmac('sha256', $clientIp, $jwtSecret);
        $pdo->prepare(
            'DELETE FROM tools_login_attempts
              WHERE window_started_at < NOW() - INTERVAL 1 DAY'
        )->execute();
        $pdo->prepare(
            'INSERT INTO tools_login_attempts (email_hash, ip_hash, attempts, window_started_at)
             VALUES (?, ?, 1, NOW())
             ON DUPLICATE KEY UPDATE
               attempts = IF(window_started_at < NOW() - INTERVAL 15 MINUTE, 1, attempts + 1),
               window_started_at = IF(window_started_at < NOW() - INTERVAL 15 MINUTE, NOW(), window_started_at)'
        )->execute([$emailHash, $ipHash]);

        $attemptQuery = $pdo->prepare(
            'SELECT attempts FROM tools_login_attempts
              WHERE email_hash = ? AND ip_hash = ? LIMIT 1'
        );
        $attemptQuery->execute([$emailHash, $ipHash]);
        if ((int)$attemptQuery->fetchColumn() > 10) {
            Response::error('Demasiados intentos. Esperá 15 minutos antes de volver a ingresar.', 429);
        }

        $accountQuery = $pdo->prepare(
            'SELECT id, email, name, password_hash, app_user_id, is_active, expires_at
               FROM tools_accounts WHERE email = ? LIMIT 1'
        );
        $accountQuery->execute([$email]);
        $account = $accountQuery->fetch();

        // Las cuentas vinculadas validan siempre contra la contraseña vigente de App.
        $appUser = null;
        if ($account && !empty($account['app_user_id'])) {
            $userQuery = $pdo->prepare(
                "SELECT id, business_id, name, email, password_hash, role, is_active
                   FROM users WHERE id = ? AND LOWER(email) = ? LIMIT 1"
            );
            $userQuery->execute([(int)$account['app_user_id'], $email]);
            $appUser = $userQuery->fetch() ?: null;
        } else {
            // La vinculación inicial está reservada a usuarios administradores activos.
            $userQuery = $pdo->prepare(
                "SELECT id, business_id, name, email, password_hash, role, is_active
                   FROM users
                  WHERE LOWER(email) = ? AND role = 'admin' AND is_active = 1
                  ORDER BY id ASC LIMIT 2"
            );
            $userQuery->execute([$email]);
            $matches = $userQuery->fetchAll();
            if (count($matches) > 1) {
                Response::error('Este email está asociado a más de un negocio. Contactá al administrador para vincular Tools.', 409);
            }
            $appUser = $matches[0] ?? null;
        }

        $linkedToApp = $appUser !== null;
        if ($linkedToApp) {
            if (
                (int)$appUser['is_active'] !== 1
                || $appUser['role'] !== 'admin'
                || empty($appUser['password_hash'])
                || !password_verify($password, (string)$appUser['password_hash'])
            ) {
                Response::error('Email o contraseña incorrectos', 401);
            }

            if ($account && (int)$account['is_active'] !== 1) {
                Response::error('El acceso a esta cuenta no está habilitado', 403);
            }
            if ($account && $account['expires_at'] !== null && strtotime($account['expires_at']) <= time()) {
                Response::error('El acceso a Pizzalog Tools ha vencido', 403);
            }

            // No se copia ni duplica el hash de App: Tools guarda únicamente la referencia al usuario.
            $pdo->prepare(
                'INSERT INTO tools_accounts (email, name, password_hash, app_user_id, business_id, is_active)
                 VALUES (?, ?, NULL, ?, ?, 1)
                 ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    app_user_id = VALUES(app_user_id),
                    business_id = VALUES(business_id),
                    password_hash = NULL'
            )->execute([$email, (string)$appUser['name'], (int)$appUser['id'], (int)$appUser['business_id']]);

            $accountQuery->execute([$email]);
            $account = $accountQuery->fetch();
        } elseif (!$account || empty($account['password_hash']) || !password_verify($password, (string)$account['password_hash'])) {
            Response::error('Email o contraseña incorrectos', 401);
        }

        if (!$account || (int)$account['is_active'] !== 1) {
            Response::error('El acceso a esta cuenta no está habilitado', 403);
        }
        if ($account['expires_at'] !== null && strtotime($account['expires_at']) <= time()) {
            Response::error('El acceso a Pizzalog Tools ha vencido', 403);
        }

        $pdo->prepare('DELETE FROM tools_login_attempts WHERE email_hash = ? AND ip_hash = ?')
            ->execute([$emailHash, $ipHash]);
        $pdo->prepare('UPDATE tools_accounts SET last_login_at = NOW() WHERE id = ?')
            ->execute([(int)$account['id']]);

        $token = Jwt::encode(
            [
                'sub' => (int) $account['id'],
                'aud' => 'pizzalog-tools',
            ],
            $jwtSecret,
            max(300, min((int) ($jwtConfig['ttl'] ?? 28800), 43200)),
            (string) ($jwtConfig['issuer'] ?? 'pizzalog')
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
