<?php
/**
 * Bootstrap de la API.
 * Prepara el entorno y deja todo listo antes del routing.
 */
declare(strict_types=1);

define('BASE_PATH', __DIR__);

// Hora local (Córdoba) para las fechas que se calculan en PHP.
date_default_timezone_set('America/Argentina/Cordoba');

// --- Autoloader PSR-4 simple (sin Composer) ---------------------------
spl_autoload_register(function (string $class): void {
    $prefix = 'Pizzalog\\';
    $len = strlen($prefix);
    if (strncmp($class, $prefix, $len) !== 0) {
        return;
    }
    $relative = substr($class, $len);
    $file = BASE_PATH . '/src/' . str_replace('\\', '/', $relative) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

// --- Configuración ----------------------------------------------------
$configFile = BASE_PATH . '/config/config.php';
if (!is_file($configFile)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'Falta config/config.php (copialo desde config.example.php)']);
    exit;
}
$config = require $configFile;
\Pizzalog\Core\Config::load($config);

// --- CORS (responde el preflight OPTIONS y corta) ---------------------
\Pizzalog\Core\Cors::handle($config['cors']['allowed_origins'] ?? []);

// --- Errores y excepciones -> respuesta JSON --------------------------
set_exception_handler(function (\Throwable $e): void {
    // Las reglas de negocio (ej. selección de combo inválida) viajan como
    // DomainException y son error del cliente, no del servidor.
    if ($e instanceof \DomainException) {
        http_response_code(422);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
        exit;
    }

    error_log('[pizzalog] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    $debug = (bool) \Pizzalog\Core\Config::get('debug', false);
    echo json_encode([
        'ok'    => false,
        'error' => $debug ? $e->getMessage() : 'Error interno del servidor',
    ], JSON_UNESCAPED_UNICODE);
    exit;
});

// --- Base de datos ----------------------------------------------------
\Pizzalog\Core\Database::connect($config['db']);
