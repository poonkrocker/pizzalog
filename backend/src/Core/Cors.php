<?php
namespace Pizzalog\Core;

/**
 * Manejo estricto de CORS mediante allowlist explícita.
 * No acepta wildcards ni subdominios arbitrarios no registrados.
 */
class Cors
{
    /** Orígenes por defecto autorizados en producción, staging y desarrollo local */
    public const DEFAULT_ALLOWED_ORIGINS = [
        'https://tools.pizzalog.net',
        'https://staging.pizzalog.net',
        'https://app-staging.pizzalog.net',
        'https://app.pizzalog.net',
        'https://pos.pizzalog.net',
        'https://carta.pizzalog.net',
        'https://pizzalog.net',
        'https://www.pizzalog.net',
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        'http://localhost:5176',
        'http://localhost',
        'https://localhost',
        'capacitor://localhost',
    ];

    /**
     * Valida el origen contra la lista permitida y emite las cabeceras correspondientes.
     * Si el método es OPTIONS (preflight), responde 204 si está permitido o 403 si está rechazado.
     */
    public static function handle(array $configuredAllowed = []): void
    {
        $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
        $allowed = self::normalizeAllowedOrigins(array_merge(self::DEFAULT_ALLOWED_ORIGINS, $configuredAllowed));

        $isAllowed = $origin !== '' && in_array(strtolower(trim($origin)), $allowed, true);

        if ($isAllowed) {
            header("Access-Control-Allow-Origin: {$origin}");
            header('Vary: Origin');
            header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
            header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
            header('Access-Control-Max-Age: 86400');
        }

        // El navegador manda OPTIONS antes de la request real (preflight).
        if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? '')) === 'OPTIONS') {
            if ($isAllowed || $origin === '') {
                http_response_code(204);
            } else {
                http_response_code(403);
            }
            exit;
        }
    }

    /**
     * Normaliza los orígenes autorizados eliminando barras finales y convirtiendo a minúsculas.
     */
    public static function normalizeAllowedOrigins(array $origins): array
    {
        $normalized = [];
        foreach ($origins as $orig) {
            if (!is_string($orig)) continue;
            $trimmed = strtolower(rtrim(trim($orig), '/'));
            if ($trimmed !== '' && !in_array($trimmed, $normalized, true)) {
                $normalized[] = $trimmed;
            }
        }
        return $normalized;
    }

    /**
     * Comprueba si un origen está en la lista permitida (útil para pruebas unitarias).
     */
    public static function isOriginAllowed(string $origin, array $configuredAllowed = []): bool
    {
        $origin = strtolower(rtrim(trim($origin), '/'));
        if ($origin === '') return false;
        $allowed = self::normalizeAllowedOrigins(array_merge(self::DEFAULT_ALLOWED_ORIGINS, $configuredAllowed));
        return in_array($origin, $allowed, true);
    }
}
