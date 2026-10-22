<?php
declare(strict_types=1);

/**
 * Endpoint de ejecución web directa para la migración histórica de Loyverse
 * y creación del entorno Pizza Test.
 *
 * Acceso: https://api.pizzalog.net/run_migration.php?key=pizzalog2026&force=1
 */

if (function_exists('opcache_reset')) {
    @opcache_reset();
}

@set_time_limit(300);
@ini_set('memory_limit', '512M');

header('Content-Type: application/json; charset=utf-8');

$key = $_GET['key'] ?? '';
if ($key !== 'pizzalog2026') {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Clave de seguridad inválida']);
    exit;
}

require dirname(__DIR__) . '/bootstrap.php';

use Pizzalog\Services\LoyverseMigrationService;

$force = isset($_GET['force']) && $_GET['force'] !== '0';

try {
    $res = LoyverseMigrationService::ensureMigrated($force);
    if (isset($res['error'])) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => $res['error']], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode([
        'ok'          => true,
        'status'      => 'success',
        'migrated_to' => 'Pizzería Arrabbiata (business_id = 1)',
        'migration'   => $res,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}
