<?php
declare(strict_types=1);

/**
 * Fase 2.2 — Prueba real en PHP (PDO SQLite en memoria) para ToolsWorkspaceController::recordAutomaticBackup()
 *
 * Cubre los 5 escenarios obligatorios:
 *  1. Backup exitoso
 *  2. Tabla de backup no disponible
 *  3. Error de inserción
 *  4. Error de limpieza de backups antiguos
 *  5. Guardado principal exitoso con backup fallido (versión incrementa y responde backup_created=false)
 *
 * Ejecución:
 *   php docs/audit/release-candidate/tests-php/test_workspace_backup_errors.php
 */

require_once __DIR__ . '/../../../../backend/src/Controllers/ToolsWorkspaceController.php';

use Pizzalog\Controllers\ToolsWorkspaceController;

function assertTrue(bool $cond, string $msg): void {
    if (!$cond) {
        fwrite(STDERR, "[FAIL] {$msg}\n");
        exit(1);
    }
    echo "[PASS] {$msg}\n";
}

function createBaseSchema(PDO $pdo): void {
    $pdo->exec('CREATE TABLE tools_workspaces (
        account_id INTEGER PRIMARY KEY,
        workspace_json TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT 1,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
    )');
    $pdo->exec('CREATE TABLE tools_workspace_backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        version INTEGER NOT NULL,
        workspace_json TEXT NOT NULL,
        created_at TEXT NOT NULL
    )');
}

// 1. Backup exitoso
$pdo1 = new PDO('sqlite::memory:');
$pdo1->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
createBaseSchema($pdo1);
$res1 = ToolsWorkspaceController::recordAutomaticBackup($pdo1, 10, 1, '{"v":1}', "datetime('now')");
assertTrue($res1['backup_created'] === true, '1. Backup exitoso: backup_created === true');
assertTrue($res1['backup_warning'] === null, '1. Backup exitoso: backup_warning === null');
assertTrue($res1['backup_cleanup_warning'] === null, '1. Backup exitoso: backup_cleanup_warning === null');
$count1 = (int) $pdo1->query('SELECT COUNT(*) FROM tools_workspace_backups WHERE account_id = 10')->fetchColumn();
assertTrue($count1 === 1, '1. Backup exitoso: fila insertada en tools_workspace_backups');

// 2. Tabla de backup no disponible
$pdo2 = new PDO('sqlite::memory:');
$pdo2->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
createBaseSchema($pdo2);
$pdo2->exec('DROP TABLE tools_workspace_backups');
$res2 = ToolsWorkspaceController::recordAutomaticBackup($pdo2, 10, 2, '{"v":2}', "datetime('now')");
assertTrue($res2['backup_created'] === false, '2. Tabla no disponible: backup_created === false');
assertTrue(is_string($res2['backup_warning']) && str_contains($res2['backup_warning'], 'no se pudo generar'), '2. Tabla no disponible: devuelve backup_warning claro');

// 3. Error de inserción (trigger ABORT)
$pdo3 = new PDO('sqlite::memory:');
$pdo3->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
createBaseSchema($pdo3);
$pdo3->exec("CREATE TRIGGER fail_bkp_insert BEFORE INSERT ON tools_workspace_backups
             BEGIN SELECT RAISE(ABORT, 'disk_full_simulated'); END;");
$res3 = ToolsWorkspaceController::recordAutomaticBackup($pdo3, 10, 3, '{"v":3}', "datetime('now')");
assertTrue($res3['backup_created'] === false, '3. Error de inserción: backup_created === false');
assertTrue(is_string($res3['backup_warning']), '3. Error de inserción: informa backup_warning');

// 4. Error de limpieza de backups antiguos (11 backups + trigger ABORT en DELETE)
$pdo4 = new PDO('sqlite::memory:');
$pdo4->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
createBaseSchema($pdo4);
for ($i = 1; $i <= 10; $i++) {
    $pdo4->prepare("INSERT INTO tools_workspace_backups (account_id, version, workspace_json, created_at) VALUES (10, ?, ?, datetime('now'))")
        ->execute([$i, json_encode(['v' => $i])]);
}
$pdo4->exec("CREATE TRIGGER fail_bkp_delete BEFORE DELETE ON tools_workspace_backups
             BEGIN SELECT RAISE(ABORT, 'delete_denied_simulated'); END;");
$res4 = ToolsWorkspaceController::recordAutomaticBackup($pdo4, 10, 11, '{"v":11}', "datetime('now')");
assertTrue($res4['backup_created'] === true, '4. Error de limpieza: backup recién creado sigue siendo true');
assertTrue($res4['backup_warning'] === null, '4. Error de limpieza: no reporta fallo de creación');
assertTrue(is_string($res4['backup_cleanup_warning']) && str_contains($res4['backup_cleanup_warning'], 'limpieza'), '4. Error de limpieza: reporta backup_cleanup_warning');

// 5. Guardado principal exitoso con backup fallido dentro de la misma transacción
$pdo5 = new PDO('sqlite::memory:');
$pdo5->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
createBaseSchema($pdo5);
$pdo5->exec("INSERT INTO tools_workspaces (account_id, workspace_json, schema_version, version, updated_at) VALUES (20, '{\"v\":1}', 1, 1, datetime('now'))");
$pdo5->exec('DROP TABLE tools_workspace_backups');
$pdo5->beginTransaction();
$bkp5 = ToolsWorkspaceController::recordAutomaticBackup($pdo5, 20, 1, '{"v":1}', "datetime('now')");
$pdo5->prepare("UPDATE tools_workspaces SET workspace_json = ?, version = 2, updated_at = datetime('now') WHERE account_id = 20")
    ->execute(['{"v":2}']);
$pdo5->commit();
$savedVersion = (int) $pdo5->query('SELECT version FROM tools_workspaces WHERE account_id = 20')->fetchColumn();
assertTrue($savedVersion === 2, '5. Guardado principal exitoso con backup fallido: versión persistida = 2');
assertTrue($bkp5['backup_created'] === false && is_string($bkp5['backup_warning']), '5. Guardado principal exitoso con backup fallido: no afirma que existe respaldo');

echo "ALL 5 PHP BACKUP ERROR SCENARIOS PASSED\n";
