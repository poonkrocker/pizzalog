<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

class ToolsWorkspaceController
{
    /**
     * GET /tools/workspace
     * Devuelve el espacio de trabajo del usuario autenticado junto con su versión de concurrencia (version y updated_at).
     */
    public function show(Request $req): void
    {
        $accountId = (int) $req->auth['tools_account_id'];
        $pdo = Database::pdo();
        ToolsAuthController::ensureTables($pdo);
        $stmt = $pdo->prepare(
            'SELECT workspace_json, schema_version, version, updated_at
               FROM tools_workspaces
              WHERE account_id = ?
              LIMIT 1'
        );
        $stmt->execute([$accountId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        $workspace = null;
        if ($row) {
            $workspace = json_decode((string)$row['workspace_json'], true);
            if (
                !is_array($workspace)
                || !is_array($workspace['catalog'] ?? null)
                || !is_array($workspace['catalog']['ingredients'] ?? null)
                || !is_array($workspace['catalog']['purchase_prices'] ?? null)
                || !is_array($workspace['catalog']['recipes'] ?? null)
            ) {
                Response::error('El espacio de trabajo guardado está dañado o tiene una versión incompatible. No se sobrescribieron los datos.', 500);
            }
            if (empty($workspace['businessName']) || !is_string($workspace['businessName'])) {
                $workspace['businessName'] = 'Mi Pizzería';
            }
            $workspace['currency'] = is_string($workspace['currency'] ?? null) && $workspace['currency'] !== '' ? $workspace['currency'] : 'ARS';
            $workspace['locale'] = in_array($workspace['locale'] ?? '', ['es-AR', 'pt-BR', 'en'], true) ? $workspace['locale'] : 'es-AR';
            $workspace['unitSystem'] = ($workspace['unitSystem'] ?? '') === 'us_customary' ? 'us_customary' : 'metric';
            $workspace['defaultTargetFoodCostPct'] = is_numeric($workspace['defaultTargetFoodCostPct'] ?? null) ? (float) $workspace['defaultTargetFoodCostPct'] : 30;
            $workspace['defaultRoundingIncrement'] = is_numeric($workspace['defaultRoundingIncrement'] ?? null) ? (float) $workspace['defaultRoundingIncrement'] : 100;
            $workspace['defaultPackagingCost'] = is_numeric($workspace['defaultPackagingCost'] ?? null) ? (float) $workspace['defaultPackagingCost'] : 0;
            $workspace['defaultChannelFeePct'] = is_numeric($workspace['defaultChannelFeePct'] ?? null) ? (float) $workspace['defaultChannelFeePct'] : 0;
            $workspace['operatingExpenses'] = array_values((array) ($workspace['operatingExpenses'] ?? []));
            $workspace['salesHistory'] = array_values((array) ($workspace['salesHistory'] ?? []));
            $workspace['snapshots'] = array_values((array) ($workspace['snapshots'] ?? []));
            $workspace['productSalesMap'] = (object) (is_array($workspace['productSalesMap'] ?? null) ? $workspace['productSalesMap'] : []);
            $workspace['equivalences'] = (object) (is_array($workspace['equivalences'] ?? null) ? $workspace['equivalences'] : []);
        }

        Response::ok([
            'workspace' => $workspace,
            'schema_version' => $row ? (int) $row['schema_version'] : 1,
            'version' => $row ? (int) ($row['version'] ?? 1) : 1,
            'updated_at' => $row ? (string) $row['updated_at'] : null,
        ]);
    }

    /**
     * PUT / POST /tools/workspace
     * Guarda el espacio de trabajo con control de concurrencia optimista (version incremental + updated_at),
     * bloqueo de fila (SELECT ... FOR UPDATE) y respaldo automático en tools_workspace_backups.
     */
    public function save(Request $req): void
    {
        @ini_set('max_execution_time', '120');
        @set_time_limit(120);
        @ini_set('memory_limit', '256M');

        if ($req->postMaxExceeded) {
            Response::error('El espacio de trabajo supera el límite configurado del servidor (post_max_size / 20 MB)', 413);
        }

        $accountId = (int) $req->auth['tools_account_id'];
        $workspace = $req->input('workspace');
        $expectedUpdatedAt = $req->input('updated_at');
        $expectedVersion = $req->input('version');

        if (
            !is_array($workspace)
            || !is_array($workspace['catalog'] ?? null)
            || !is_array($workspace['catalog']['ingredients'] ?? null)
            || !is_array($workspace['catalog']['purchase_prices'] ?? null)
            || !is_array($workspace['catalog']['recipes'] ?? null)
            || !is_array($workspace['operatingExpenses'] ?? null)
            || !is_array($workspace['productSalesMap'] ?? null)
            || !is_array($workspace['snapshots'] ?? null)
        ) {
            Response::error('El espacio de trabajo no tiene la estructura requerida por Tools v1', 422);
        }

        $json = json_encode($workspace, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        if ($json === false || strlen($json) > 20 * 1024 * 1024) {
            Response::error('El espacio de trabajo supera el tamaño permitido (20 MB)', 413);
        }

        $pdo = Database::pdo();
        ToolsAuthController::ensureTables($pdo);
        $driver = (string) $pdo->getAttribute(\PDO::ATTR_DRIVER_NAME);
        $forUpdateClause = $driver === 'sqlite' ? '' : ' FOR UPDATE';
        $nowExpr = $driver === 'sqlite' ? "datetime('now')" : 'NOW()';

        $pdo->beginTransaction();

        try {
            $checkStmt = $pdo->prepare(
                "SELECT account_id, version, updated_at, workspace_json FROM tools_workspaces WHERE account_id = ?{$forUpdateClause}"
            );
            $checkStmt->execute([$accountId]);
            $existing = $checkStmt->fetch(\PDO::FETCH_ASSOC);

            if ($existing) {
                $currentVersion = (int) ($existing['version'] ?? 1);
                $currentUpdatedAt = (string) $existing['updated_at'];

                // Control optimista prioritario por version incremental monotónica (resuelve colisiones dentro del mismo segundo)
                if ($expectedVersion !== null && $expectedVersion !== '' && (int) $expectedVersion !== $currentVersion) {
                    $pdo->rollBack();
                    Response::error('El espacio de trabajo fue modificado en otra sesión o pestaña. Recargá los cambios antes de guardar.', 409, [
                        'current_version' => $currentVersion,
                        'current_updated_at' => $currentUpdatedAt,
                    ]);
                }

                // Control optimista adicional por updated_at
                if ($expectedUpdatedAt !== null && $expectedUpdatedAt !== '' && $expectedUpdatedAt !== $currentUpdatedAt) {
                    $pdo->rollBack();
                    Response::error('El espacio de trabajo fue modificado en otra sesión o pestaña. Recargá los cambios antes de guardar.', 409, [
                        'current_version' => $currentVersion,
                        'current_updated_at' => $currentUpdatedAt,
                    ]);
                }

                // Guardar backup automático del estado anterior antes de sobrescribir
                try {
                    $bkpStmt = $pdo->prepare(
                        "INSERT INTO tools_workspace_backups (account_id, version, workspace_json, created_at)
                         VALUES (?, ?, ?, {$nowExpr})"
                    );
                    $bkpStmt->execute([$accountId, $currentVersion, (string) $existing['workspace_json']]);

                    // Conservar los últimos 10 backups por cuenta
                    $keepStmt = $pdo->prepare(
                        'SELECT id FROM tools_workspace_backups WHERE account_id = ? ORDER BY id DESC LIMIT 1 OFFSET 10'
                    );
                    $keepStmt->execute([$accountId]);
                    $cutoffId = $keepStmt->fetchColumn();
                    if ($cutoffId) {
                        $pdo->prepare('DELETE FROM tools_workspace_backups WHERE account_id = ? AND id <= ?')
                            ->execute([$accountId, (int) $cutoffId]);
                    }
                } catch (\Throwable $ignoreBkp) {
                    // No abortar guardado principal si la tabla de backups no está disponible
                }

                $newVersion = $currentVersion + 1;
                $updateStmt = $pdo->prepare(
                    "UPDATE tools_workspaces
                        SET workspace_json = ?, schema_version = 1, version = ?, updated_at = {$nowExpr}
                      WHERE account_id = ?"
                );
                $updateStmt->execute([$json, $newVersion, $accountId]);
            } else {
                $newVersion = 1;
                $insertStmt = $pdo->prepare(
                    "INSERT INTO tools_workspaces (account_id, workspace_json, schema_version, version, updated_at)
                     VALUES (?, ?, 1, 1, {$nowExpr})"
                );
                $insertStmt->execute([$accountId, $json]);
            }

            $refreshStmt = $pdo->prepare('SELECT version, updated_at FROM tools_workspaces WHERE account_id = ? LIMIT 1');
            $refreshStmt->execute([$accountId]);
            $refreshed = $refreshStmt->fetch(\PDO::FETCH_ASSOC);
            $newUpdatedAt = (string) ($refreshed['updated_at'] ?? '');
            $finalVersion = (int) ($refreshed['version'] ?? $newVersion);

            $pdo->commit();

            Response::ok([
                'saved' => true,
                'version' => $finalVersion,
                'updated_at' => $newUpdatedAt,
            ]);
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('[pizzalog-tools] Error saving workspace for account ' . $accountId . ': ' . $e->getMessage());
            $debug = (bool) \Pizzalog\Core\Config::get('debug', false);
            Response::error(
                $debug ? ('No se pudo guardar el espacio de trabajo: ' . $e->getMessage()) : 'No se pudo guardar el espacio de trabajo en este momento. Reintentá en unos segundos.',
                500
            );
        }
    }

    /**
     * GET /tools/workspace/backups
     * Lista los puntos de restauración automáticos disponibles para la cuenta autenticada.
     */
    public function backups(Request $req): void
    {
        $accountId = (int) $req->auth['tools_account_id'];
        $pdo = Database::pdo();
        ToolsAuthController::ensureTables($pdo);

        $stmt = $pdo->prepare(
            'SELECT id, version, created_at, LENGTH(workspace_json) AS size_bytes
               FROM tools_workspace_backups
              WHERE account_id = ?
              ORDER BY id DESC
              LIMIT 10'
        );
        $stmt->execute([$accountId]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        Response::ok([
            'backups' => array_map(static fn(array $r): array => [
                'id' => (int) $r['id'],
                'version' => (int) $r['version'],
                'created_at' => (string) $r['created_at'],
                'size_bytes' => (int) $r['size_bytes'],
            ], $rows),
        ]);
    }

    /**
     * POST /tools/workspace/restore
     * Restaura un backup previo perteneciente exclusivamente a la cuenta autenticada.
     */
    public function restore(Request $req): void
    {
        $accountId = (int) $req->auth['tools_account_id'];
        $backupId = (int) $req->input('backup_id', 0);
        if ($backupId <= 0) {
            Response::error('Indicá un backup_id válido para restaurar', 422);
        }

        $pdo = Database::pdo();
        ToolsAuthController::ensureTables($pdo);
        $driver = (string) $pdo->getAttribute(\PDO::ATTR_DRIVER_NAME);
        $nowExpr = $driver === 'sqlite' ? "datetime('now')" : 'NOW()';

        // Verificar aislamiento estricto por account_id
        $bkpStmt = $pdo->prepare(
            'SELECT id, version, workspace_json FROM tools_workspace_backups WHERE id = ? AND account_id = ? LIMIT 1'
        );
        $bkpStmt->execute([$backupId, $accountId]);
        $backup = $bkpStmt->fetch(\PDO::FETCH_ASSOC);
        if (!$backup) {
            Response::error('No se encontró el backup solicitado para esta cuenta', 404);
        }

        $workspace = json_decode((string) $backup['workspace_json'], true);
        if (!is_array($workspace) || !is_array($workspace['catalog'] ?? null)) {
            Response::error('El backup seleccionado no contiene una estructura válida', 422);
        }

        $pdo->beginTransaction();
        try {
            $curStmt = $pdo->prepare('SELECT version, workspace_json FROM tools_workspaces WHERE account_id = ? LIMIT 1');
            $curStmt->execute([$accountId]);
            $current = $curStmt->fetch(\PDO::FETCH_ASSOC);

            $nextVersion = $current ? ((int) $current['version'] + 1) : 1;
            if ($current) {
                $pdo->prepare(
                    "INSERT INTO tools_workspace_backups (account_id, version, workspace_json, created_at)
                     VALUES (?, ?, ?, {$nowExpr})"
                )->execute([$accountId, (int) $current['version'], (string) $current['workspace_json']]);

                $pdo->prepare(
                    "UPDATE tools_workspaces SET workspace_json = ?, version = ?, updated_at = {$nowExpr} WHERE account_id = ?"
                )->execute([(string) $backup['workspace_json'], $nextVersion, $accountId]);
            } else {
                $pdo->prepare(
                    "INSERT INTO tools_workspaces (account_id, workspace_json, schema_version, version, updated_at)
                     VALUES (?, ?, 1, 1, {$nowExpr})"
                )->execute([$accountId, (string) $backup['workspace_json']]);
            }

            $refStmt = $pdo->prepare('SELECT version, updated_at FROM tools_workspaces WHERE account_id = ? LIMIT 1');
            $refStmt->execute([$accountId]);
            $ref = $refStmt->fetch(\PDO::FETCH_ASSOC);

            $pdo->commit();
            Response::ok([
                'restored' => true,
                'restored_from_backup_id' => (int) $backup['id'],
                'restored_from_version' => (int) $backup['version'],
                'version' => (int) ($ref['version'] ?? $nextVersion),
                'updated_at' => (string) ($ref['updated_at'] ?? ''),
                'workspace' => $workspace,
            ]);
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('[pizzalog-tools] Error restoring backup for account ' . $accountId . ': ' . $e->getMessage());
            $debug = (bool) \Pizzalog\Core\Config::get('debug', false);
            Response::error(
                $debug ? ('No se pudo restaurar el backup: ' . $e->getMessage()) : 'No se pudo restaurar la copia de seguridad en este momento.',
                500
            );
        }
    }
}
