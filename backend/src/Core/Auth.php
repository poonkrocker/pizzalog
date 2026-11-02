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

            $userId = isset($payload['sub']) ? (int) $payload['sub'] : null;
            $businessId = isset($payload['business_id']) ? (int) $payload['business_id'] : null;

            if ($userId === null || $businessId === null) {
                Response::error('Token incompleto', 401);
            }

            // Verificar estado activo y permisos autoritativos en el servidor
            $stmt = Database::pdo()->prepare(
                'SELECT id, business_id, role, allowed_modules, is_active
                   FROM users
                  WHERE id = ? AND business_id = ?
                  LIMIT 1'
            );
            $stmt->execute([$userId, $businessId]);
            $user = $stmt->fetch();

            if (!$user || (int) $user['is_active'] !== 1) {
                Response::error('Sesión inválida o usuario desactivado', 401);
            }

            $allowedModules = null;
            if (!empty($user['allowed_modules']) && is_string($user['allowed_modules'])) {
                $decoded = json_decode($user['allowed_modules'], true);
                if (is_array($decoded)) {
                    $allowedModules = $decoded;
                }
            }

            $req->auth = [
                'user_id'         => (int) $user['id'],
                'business_id'     => (int) $user['business_id'],
                'role'            => (string) $user['role'],
                'allowed_modules' => $allowedModules,
            ];
        };
    }

    public static function requireRole(array $roles): callable
    {
        return function (Request $req) use ($roles): void {
            $role = $req->auth['role'] ?? '';
            $allowedModules = $req->auth['allowed_modules'] ?? null;

            if ($role === 'admin' && in_array('admin', $roles, true)) {
                return;
            }

            if (in_array($role, $roles, true)) {
                // Si es manager con restricción explícita de módulos, verificar el módulo del endpoint
                if ($role === 'manager' && is_array($allowedModules)) {
                    if (self::moduleMatchesPath($allowedModules, $req->path)) {
                        return;
                    }
                    Response::error('No tenés permiso para este módulo', 403);
                }
                return;
            }

            // Si el endpoint permite 'manager' y el empleado tiene asignado el módulo específico
            if (in_array('manager', $roles, true) && is_array($allowedModules) && count($allowedModules) > 0) {
                if (self::moduleMatchesPath($allowedModules, $req->path)) {
                    return;
                }
            }

            Response::error('No tenés permiso para esta acción', 403);
        };
    }

    private static function moduleMatchesPath(array $allowedModules, string $path): bool
    {
        if (in_array('*', $allowedModules, true)) {
            return true;
        }
        $map = [
            '/analytics'        => ['dashboard', 'analytics-details'],
            '/orders'           => ['orders'],
            '/delivery-drivers' => ['drivers', 'orders'],
            '/staff'            => ['staff'],
            '/attendance'       => ['staff'],
            '/products'         => ['products', 'production'],
            '/uploads'          => ['products'],
            '/categories'       => ['categories', 'products'],
            '/production'       => ['production'],
            '/recipe-studio'    => ['production'],
            '/supplies'         => ['supplies', 'production'],
            '/inventory'        => ['supplies', 'production'],
            '/suppliers'        => ['suppliers', 'supplies', 'production'],
            '/sales'            => ['sales', 'sales-items', 'sales-categories', 'sales-employees', 'sales-payments', 'sales-discounts', 'sales-taxes', 'cash', 'sales-cash'],
            '/reports/sales'    => ['sales', 'sales-items', 'sales-categories', 'sales-employees', 'sales-payments', 'sales-discounts', 'sales-taxes'],
            '/fiscal'           => ['sales', 'cash', 'sales-cash'],
            '/cash'             => ['cash', 'sales-cash', 'sales'],
            '/tables'           => ['salon'],
            '/table-areas'      => ['salon'],
            '/table-sessions'   => ['salon'],
            '/customers'        => ['customers', 'orders', 'sales'],
            '/business'         => ['business', 'products'],
        ];

        foreach ($map as $prefix => $validMods) {
            if ($path === $prefix || str_starts_with($path, $prefix . '/')) {
                foreach ($validMods as $m) {
                    if (in_array($m, $allowedModules, true)) {
                        return true;
                    }
                }
                return false;
            }
        }
        return false;
    }
}
