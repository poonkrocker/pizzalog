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
$exampleConfigFile = BASE_PATH . '/config/config.example.php';
$configFile = BASE_PATH . '/config/config.php';
$localConfigFile = BASE_PATH . '/config/config.local.php';
if (!is_file($configFile) && !is_file($localConfigFile)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'Falta archivo de configuración (config.local.php o config.php)']);
    exit;
}
$config = is_file($exampleConfigFile) ? (require $exampleConfigFile) : [];
if (is_file($configFile)) {
    $baseConfig = require $configFile;
    if (is_array($baseConfig)) {
        $config = array_replace_recursive($config, $baseConfig);
    }
}
if (is_file($localConfigFile)) {
    $localConfig = require $localConfigFile;
    if (is_array($localConfig)) {
        $config = array_replace_recursive($config, $localConfig);
    }
}
// Permitir sobreescritura por variables de entorno del servidor
if ($envHost = getenv('PIZZALOG_DB_HOST')) $config['db']['host'] = $envHost;
if ($envName = getenv('PIZZALOG_DB_NAME')) $config['db']['name'] = $envName;
if ($envUser = getenv('PIZZALOG_DB_USER')) $config['db']['user'] = $envUser;
if ($envPass = getenv('PIZZALOG_DB_PASS')) $config['db']['pass'] = $envPass;
if ($envJwt  = getenv('PIZZALOG_JWT_SECRET')) $config['jwt']['secret'] = $envJwt;
if ($envDs   = getenv('PIZZALOG_DEEPSEEK_API_KEY')) $config['deepseek']['api_key'] = $envDs;

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
