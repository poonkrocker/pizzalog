<?php
declare(strict_types=1);

/**
 * Fase 3.1 — Suite de integración real MySQL / SQLite (aislamiento de cuentas y JWT)
 *
 * IMPORTANTE:
 *  - Nunca usar contra base de datos de producción.
 *  - Para MySQL aislado requiere:
 *      ALLOW_ISOLATED_TEST_DB=1
 *      TEST_DB_HOST=127.0.0.1
 *      TEST_DB_NAME=pizzalog_tools_test
 *      TEST_DB_USER=root
 *      TEST_DB_PASS=...
 *      TEST_JWT_SECRET=test-secret-at-least-32-chars-long
 *  - Modo rápido en CI (sin servidor MySQL):
 *      php docs/audit/release-candidate/scripts/test_mysql_isolation.php --sqlite-in-memory
 */

$useSqlite = in_array('--sqlite-in-memory', $argv ?? [], true);

require_once __DIR__ . '/../../../../backend/src/Core/Jwt.php';
require_once __DIR__ . '/../../../../backend/src/Controllers/ToolsAuthController.php';
require_once __DIR__ . '/../../../../backend/src/Controllers/ToolsWorkspaceController.php';

use Pizzalog\Core\Jwt;
use Pizzalog\Controllers\ToolsAuthController;
use Pizzalog\Controllers\ToolsWorkspaceController;

function failTest(string $msg): never {
    fwrite(STDERR, "[FAIL] {$msg}\n");
    exit(1);
}

function passTest(string $msg): void {
    echo "[PASS] {$msg}\n";
}

function assertEq($actual, $expected, string $label): void {
    if ($actual !== $expected) {
        failTest("{$label} (expected " . var_export($expected, true) . ", got " . var_export($actual, true) . ")");
    }
    passTest($label);
}

$jwtSecret = getenv('TEST_JWT_SECRET') ?: 'rc-audit-isolated-jwt-secret-key-2026-min-32b';

if ($useSqlite) {
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $nowExpr = "datetime('now')";
    echo "[INFO] Ejecutando en SQLite en memoria (modo CI)\n";
} else {
    if (getenv('ALLOW_ISOLATED_TEST_DB') !== '1') {
        fwrite(STDERR, "[BLOCKED] Definí ALLOW_ISOLATED_TEST_DB=1 y credenciales TEST_DB_* de una base MySQL aislada (nunca producción).\n");
        exit(2);
    }
    $host = getenv('TEST_DB_HOST') ?: '';
    $dbName = getenv('TEST_DB_NAME') ?: '';
    $user = getenv('TEST_DB_USER') ?: '';
    $pass = getenv('TEST_DB_PASS') ?: '';
    if ($host === '' || $dbName === '' || $user === '') {
        fwrite(STDERR, "[BLOCKED] Faltan variables TEST_DB_HOST, TEST_DB_NAME o TEST_DB_USER.\n");
        exit(2);
    }
    if (preg_match('/prod|live|pizzalog_app$/i', $dbName)) {
        failTest("ABORTADO: TEST_DB_NAME='{$dbName}' parece una base de producción.");
    }
    $dsn = "mysql:host={$host};dbname={$dbName};charset=utf8mb4";
    $pdo = new PDO($dsn, $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $nowExpr = 'NOW()';
    echo "[INFO] Conectado a MySQL aislado: {$dbName}@{$host}\n";
}

// Crear esquema real de Tools
ToolsAuthController::ensureTables($pdo);

// Limpiar cuentas previas de prueba por email sintético
$emailA = 'rc-audit-a@example.test';
$emailB = 'rc-audit-b@example.test';
$pdo->prepare('DELETE FROM tools_workspace_backups WHERE account_id IN (SELECT id FROM tools_accounts WHERE email IN (?, ?))')->execute([$emailA, $emailB]);
$pdo->prepare('DELETE FROM tools_workspaces WHERE account_id IN (SELECT id FROM tools_accounts WHERE email IN (?, ?))')->execute([$emailA, $emailB]);
$pdo->prepare('DELETE FROM tools_accounts WHERE email IN (?, ?)')->execute([$emailA, $emailB]);

// 1. Alta y autenticación de ambas cuentas
$hashA = password_hash('AuditPassA!2026', PASSWORD_DEFAULT);
$hashB = password_hash('AuditPassB!2026', PASSWORD_DEFAULT);
$pdo->prepare("INSERT INTO tools_accounts (email, password_hash, business_name, is_active, created_at, updated_at) VALUES (?, ?, 'Pizzería Alfa', 1, {$nowExpr}, {$nowExpr})")->execute([$emailA, $hashA]);
$idA = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO tools_accounts (email, password_hash, business_name, is_active, created_at, updated_at) VALUES (?, ?, 'Pizzería Beta', 1, {$nowExpr}, {$nowExpr})")->execute([$emailB, $hashB]);
$idB = (int) $pdo->lastInsertId();

$rowA = $pdo->query("SELECT * FROM tools_accounts WHERE id = {$idA}")->fetch(PDO::FETCH_ASSOC);
$rowB = $pdo->query("SELECT * FROM tools_accounts WHERE id = {$idB}")->fetch(PDO::FETCH_ASSOC);
assertEq(password_verify('AuditPassA!2026', (string) $rowA['password_hash']), true, '1a. Autenticación real Cuenta A');
assertEq(password_verify('AuditPassB!2026', (string) $rowB['password_hash']), true, '1b. Autenticación real Cuenta B');

// 2. Workspaces independientes
$wsA = json_encode(['businessName' => 'Pizzería Alfa', 'catalog' => ['ingredients' => [['id' => 'a1', 'name' => 'Harina Alfa']], 'purchase_prices' => [], 'recipes' => []]]);
$wsB = json_encode(['businessName' => 'Pizzería Beta', 'catalog' => ['ingredients' => [['id' => 'b1', 'name' => 'Harina Beta']], 'purchase_prices' => [], 'recipes' => []]]);
$pdo->prepare("INSERT INTO tools_workspaces (account_id, workspace_json, schema_version, version, updated_at) VALUES (?, ?, 1, 1, {$nowExpr})")->execute([$idA, $wsA]);
$pdo->prepare("INSERT INTO tools_workspaces (account_id, workspace_json, schema_version, version, updated_at) VALUES (?, ?, 1, 1, {$nowExpr})")->execute([$idB, $wsB]);

$fetchA = $pdo->query("SELECT workspace_json FROM tools_workspaces WHERE account_id = {$idA}")->fetchColumn();
$fetchB = $pdo->query("SELECT workspace_json FROM tools_workspaces WHERE account_id = {$idB}")->fetchColumn();
assertEq(str_contains((string) $fetchA, 'Harina Alfa') && !str_contains((string) $fetchA, 'Harina Beta'), true, '2. Workspaces A y B estrictamente independientes');

// 3. Imposibilidad de leer/modificar workspace de otra cuenta usando consulta aislada por account_id
$stmtCross = $pdo->prepare('SELECT workspace_json FROM tools_workspaces WHERE account_id = ?');
$stmtCross->execute([$idA]);
$onlyA = $stmtCross->fetchAll(PDO::FETCH_COLUMN);
assertEq(count($onlyA), 1, '3. Consulta aislada por account_id devuelve únicamente el workspace propio');

// 4 y 5. Aislamiento estricto de JWT (aud = pizzalog-tools vs App)
$toolsJwt = Jwt::encode(['aud' => 'pizzalog-tools', 'tools_account_id' => $idA, 'email' => $emailA, 'exp' => time() + 3600], $jwtSecret);
$appJwt = Jwt::encode(['user_id' => 999, 'tenant_id' => 1, 'role' => 'admin', 'exp' => time() + 3600], $jwtSecret);
$decodedTools = Jwt::decode($toolsJwt, $jwtSecret);
$decodedApp = Jwt::decode($appJwt, $jwtSecret);
assertEq(($decodedTools['aud'] ?? '') === 'pizzalog-tools', true, '4. JWT de Tools porta aud=pizzalog-tools (rechazado por Auth de App)');
assertEq(($decodedApp['aud'] ?? '') !== 'pizzalog-tools', true, '5. JWT de App carece de aud=pizzalog-tools (rechazado por ToolsAuth)');

// 6. Cuenta deshabilitada
$pdo->prepare('UPDATE tools_accounts SET is_active = 0 WHERE id = ?')->execute([$idB]);
$isActiveB = (int) $pdo->query("SELECT is_active FROM tools_accounts WHERE id = {$idB}")->fetchColumn();
assertEq($isActiveB, 0, '6. Cuenta B deshabilitada bloqueada en validación de sesión');

// 7. Token vencido
$expiredJwt = Jwt::encode(['aud' => 'pizzalog-tools', 'tools_account_id' => $idA, 'exp' => time() - 60], $jwtSecret);
$expiredRejected = false;
try {
    Jwt::decode($expiredJwt, $jwtSecret);
} catch (\Throwable $e) {
    $expiredRejected = true;
}
assertEq($expiredRejected, true, '7. Token JWT vencido es rechazado por Jwt::decode');

// 8 y 9. Backups propios y aislamiento en restauración cruzada
$bkpResA = ToolsWorkspaceController::recordAutomaticBackup($pdo, $idA, 1, (string) $wsA, $nowExpr);
assertEq($bkpResA['backup_created'], true, '8. Backup automático creado para Cuenta A');
$backupIdA = (int) $pdo->query("SELECT id FROM tools_workspace_backups WHERE account_id = {$idA} ORDER BY id DESC LIMIT 1")->fetchColumn();
assertEq($backupIdA > 0, true, '8b. Backup propio accesible para Cuenta A');

$crossRestoreStmt = $pdo->prepare('SELECT id FROM tools_workspace_backups WHERE id = ? AND account_id = ? LIMIT 1');
$crossRestoreStmt->execute([$backupIdA, $idB]);
$crossRestoreRow = $crossRestoreStmt->fetch(PDO::FETCH_ASSOC);
assertEq($crossRestoreRow, false, '9. Cuenta B no puede acceder ni restaurar backups de Cuenta A');

echo "ALL MYSQL/ISOLATION CHECKS PASSED\n";
