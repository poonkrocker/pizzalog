<?php
declare(strict_types=1);

/**
 * Script CLI para ejecutar o forzar la migración histórica de Loyverse
 * y la inicialización de "Pizza Test".
 *
 * Uso desde la terminal del servidor:
 *   php backend/tools/migrate_loyverse_cli.php [--force]
 */

require dirname(__DIR__) . '/bootstrap.php';

use Pizzalog\Services\LoyverseMigrationService;

echo "=== MIGRACIÓN HISTÓRICA LOYVERSE -> PIZZALOG ===\n";

$force = in_array('--force', $argv, true);
if ($force) {
    echo "Modo: FORZAR re-migración (--force)\n";
} else {
    echo "Modo: Migración estándar / comprobación de estado\n";
}

try {
    $t0 = microtime(true);
    $res = LoyverseMigrationService::ensureMigrated($force);
    $elapsed = round(microtime(true) - $t0, 2);

    if (isset($res['error'])) {
        echo "\n[ERROR]: " . $res['error'] . "\n";
        exit(1);
    }

    if (isset($res['already_applied']) && $res['already_applied'] === true) {
        echo "\n[INFO]: La migración ya fue aplicada previamente.\n";
        echo "Si deseás volver a ejecutarla limpiando y recargando, ejecutá:\n";
        echo "  php backend/tools/migrate_loyverse_cli.php --force\n";
        exit(0);
    }

    echo "\n[OK] Migración completada con éxito en {$elapsed}s!\n";
    echo "----------------------------------------\n";
    echo "Turnos importados:       " . ($res['shifts_imported'] ?? 0) . "\n";
    echo "Movimientos de caja:     " . ($res['movements_imported'] ?? 0) . "\n";
    echo "Ventas / Recibos:        " . ($res['receipts_imported'] ?? 0) . "\n";
    if (!empty($res['pizza_test'])) {
        echo "Vendor de prueba:        " . $res['pizza_test']['name'] . " (ID: " . $res['pizza_test']['business_id'] . ")\n";
        echo "Usuario Pizza Test:      " . $res['pizza_test']['username'] . " / " . $res['pizza_test']['password'] . "\n";
    }
    echo "----------------------------------------\n";
} catch (\Throwable $e) {
    echo "\n[EXCEPCIÓN]: " . $e->getMessage() . "\n";
    echo $e->getTraceAsString() . "\n";
    exit(1);
}
