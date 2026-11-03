<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

class ToolsWorkspaceController
{
    public function show(Request $req): void
    {
        $stmt = Database::pdo()->prepare(
            'SELECT workspace_json, schema_version
               FROM tools_workspaces
              WHERE account_id = ?
              LIMIT 1'
        );
        $stmt->execute([(int) $req->auth['tools_account_id']]);
        $row = $stmt->fetch();

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
        }

        Response::ok([
            'workspace' => $workspace,
            'schema_version' => $row ? (int) $row['schema_version'] : 1,
        ]);
    }

    public function save(Request $req): void
    {
        $workspace = $req->input('workspace');
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

        $stmt = Database::pdo()->prepare(
            'INSERT INTO tools_workspaces (account_id, workspace_json, schema_version)
             VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE workspace_json = VALUES(workspace_json), schema_version = 1'
        );
        $stmt->execute([(int) $req->auth['tools_account_id'], $json]);

        Response::ok(['saved' => true]);
    }
}
