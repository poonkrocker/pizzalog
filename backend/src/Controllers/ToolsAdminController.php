<?php
namespace Pizzalog\\Controllers;

use Pizzalog\\Core\\Database;
use Pizzalog\\Core\\Request;
use Pizzalog\\Core\\Response;

class ToolsAdminController
{
    /** POST /tools/admin/accounts — App administrator provisions a paid Tools account. */
    public function createAccount(Request $req): void
    {
        $email = strtolower(trim((string) $req->input('email', '')));
        $name = trim((string) $req->input('name', ''));
        $password = (string) $req->input('password', '');
        $expiresAt = $req->input('expires_at');

        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
            Response::error('Ingresá un email válido', 422);
        }
        if ($name === '' || strlen($name) > 120) {
            Response::error('El nombre es obligatorio (máximo 120 caracteres)', 422);
        }
        if (strlen($password) < 12) {
            Response::error('La contraseña inicial debe tener al menos 12 caracteres', 422);
        }
        if ($expiresAt !== null && $expiresAt !== '') {
            $date = \DateTimeImmutable::createFromFormat('Y-m-d H:i:s', (string) $expiresAt);
            if (!$date || $date->format('Y-m-d H:i:s') !== $expiresAt) {
                Response::error('expires_at debe tener formato YYYY-MM-DD HH:MM:SS', 422);
            }
            $expiresAt = $date->format('Y-m-d H:i:s');
        } else {
            $expiresAt = null;
        }

        $hash = password_hash($password, PASSWORD_DEFAULT);
        try {
            $stmt = Database::pdo()->prepare(
                'INSERT INTO tools_accounts (email, name, password_hash, is_active, expires_at)
                 VALUES (?, ?, ?, 1, ?)
                 ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    password_hash = VALUES(password_hash),
                    is_active = 1,
                    expires_at = VALUES(expires_at)'
            );
            $stmt->execute([$email, $name, $hash, $expiresAt]);
        } catch (\PDOException $e) {
            Response::error('No se pudo crear la cuenta de Tools', 500);
        }

        Response::ok([
            'activated' => true,
            'email' => $email,
            'expires_at' => $expiresAt,
        ]);
    }
}
