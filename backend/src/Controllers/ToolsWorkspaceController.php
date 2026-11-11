<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

class ToolsWorkspaceController
{
    /**
     * GET /tools/workspace
     * Devuelve el espacio de trabajo del usuario autenticado junto con su versión de concurrencia (updated_at).
     */
    public function show(Request $req): void
    {
        $accountId = (int) $req->auth['tools_account_id'];
        $stmt = Database::pdo()->prepare(
            'SELECT workspace_json, schema_version, updated_at
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
            'updated_at' => $row ? (string) $row['updated_at'] : null,
        ]);
    }

    /**
     * PUT /tools/workspace
     * Guarda el espacio de trabajo con control de concurrencia optimista y bloqueo de fila (SELECT ... FOR UPDATE).
     */
    public function save(Request $req): void
    {
        $accountId = (int) $req->auth['tools_account_id'];
        $workspace = $req->input('workspace');
        $expectedUpdatedAt = $req->input('updated_at');

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
        if ($json === false || strlen($json) > 5 * 1024 * 1024) {
            Response::error('El espacio de trabajo supera el tamaño permitido (5 MB)', 413);
        }

        $pdo = Database::pdo();
        $pdo->beginTransaction();

        try {
            // Bloqueo de fila para concurrencia optimista
            $checkStmt = $pdo->prepare(
                'SELECT id, updated_at FROM tools_workspaces WHERE account_id = ? FOR UPDATE'
            );
            $checkStmt->execute([$accountId]);
            $existing = $checkStmt->fetch(\PDO::FETCH_ASSOC);

            if ($existing) {
                $currentUpdatedAt = (string) $existing['updated_at'];
                // Control optimista: si el cliente envió un updated_at previo y ya cambió en la base de datos
                if ($expectedUpdatedAt !== null && $expectedUpdatedAt !== '' && $expectedUpdatedAt !== $currentUpdatedAt) {
                    $pdo->rollBack();
                    Response::error('El espacio de trabajo fue modificado en otra sesión o pestaña. Recargá los cambios antes de guardar.', 409, [
                        'current_updated_at' => $currentUpdatedAt,
                    ]);
                }

                $updateStmt = $pdo->prepare(
                    'UPDATE tools_workspaces
                        SET workspace_json = ?, schema_version = 1, updated_at = NOW()
                      WHERE account_id = ?'
                );
                $updateStmt->execute([$json, $accountId]);
            } else {
                $insertStmt = $pdo->prepare(
                    'INSERT INTO tools_workspaces (account_id, workspace_json, schema_version, updated_at)
                     VALUES (?, ?, 1, NOW())'
                );
                $insertStmt->execute([$accountId, $json]);
            }

            // Obtener el updated_at actualizado
            $refreshStmt = $pdo->prepare('SELECT updated_at FROM tools_workspaces WHERE account_id = ? LIMIT 1');
            $refreshStmt->execute([$accountId]);
            $newUpdatedAt = (string) $refreshStmt->fetchColumn();

            $pdo->commit();

            Response::ok([
                'saved' => true,
                'updated_at' => $newUpdatedAt,
            ]);
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Response::error('No se pudo guardar el espacio de trabajo: ' . $e->getMessage(), 500);
        }
    }
}
