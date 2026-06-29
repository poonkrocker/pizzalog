<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Config;
use Pizzalog\Core\Database;
use Pizzalog\Core\Jwt;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

class AuthController
{
    /**
     * POST /auth/login
     * Body: { "email": "...", "password": "..." }
     * Devuelve el token JWT y los datos básicos del usuario.
     */
    public function login(Request $req): void
    {
        $email    = trim((string) $req->input('email', ''));
        $password = (string) $req->input('password', '');

        if ($email === '' || $password === '') {
            Response::error('Email y contraseña son obligatorios', 422);
        }

        $stmt = Database::pdo()->prepare(
            'SELECT id, business_id, name, email, password_hash, role, is_active
               FROM users
              WHERE email = ?
              LIMIT 1'
        );
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        // Mensaje genérico a propósito: no revelar si el email existe.
        $valid = $user
            && (int) $user['is_active'] === 1
            && !empty($user['password_hash'])
            && password_verify($password, $user['password_hash']);

        if (!$valid) {
            Response::error('Credenciales inválidas', 401);
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
            'user'  => [
                'id'          => (int) $user['id'],
                'name'        => $user['name'],
                'email'       => $user['email'],
                'role'        => $user['role'],
                'business_id' => (int) $user['business_id'],
            ],
        ]);
    }

    /**
     * GET /auth/me  (requiere token)
     * Devuelve el usuario del token. Sirve para validar sesión al abrir la app.
     */
    public function me(Request $req): void
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, business_id, name, email, role
               FROM users
              WHERE id = ? AND business_id = ?
              LIMIT 1'
        );
        $stmt->execute([$req->auth['user_id'], $req->auth['business_id']]);
        $user = $stmt->fetch();

        if (!$user) {
            Response::error('Usuario no encontrado', 404);
        }

        Response::ok([
            'user' => [
                'id'          => (int) $user['id'],
                'name'        => $user['name'],
                'email'       => $user['email'],
                'role'        => $user['role'],
                'business_id' => (int) $user['business_id'],
            ],
        ]);
    }
}
