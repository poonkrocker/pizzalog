<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

class ToolsSyncController
{
    /**
     * GET /tools/sync/status
     */
    public function status(Request $req): void
    {
        $accountId = (int) $req->auth['tools_account_id'];
        $pdo = Database::pdo();
        $stmt = $pdo->prepare(
            'SELECT ta.id, ta.app_user_id, ta.business_id, b.name AS business_name, u.email AS app_user_email
               FROM tools_accounts ta
          LEFT JOIN businesses b ON b.id = ta.business_id
          LEFT JOIN users u ON u.id = ta.app_user_id
              WHERE ta.id = ?
              LIMIT 1'
        );
        $stmt->execute([$accountId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        $isLinked = !empty($row['business_id']) && !empty($row['app_user_id']);
        Response::ok([
            'linked' => $isLinked,
            'business_id' => $isLinked ? (int) $row['business_id'] : null,
            'business_name' => $isLinked ? (string) $row['business_name'] : null,
            'app_user_email' => $isLinked ? (string) $row['app_user_email'] : null,
        ]);
    }

    /**
     * POST /tools/sync/link-app
     * Vincula la cuenta de Tools con un usuario administrador de Pizzalog App.
     */
    public function linkApp(Request $req): void
    {
        $accountId = (int) $req->auth['tools_account_id'];
        $email = strtolower(trim((string) $req->input('email', '')));
        $password = (string) $req->input('password', '');

        if ($email === '' || $password === '') {
            Response::error('Ingresá email y contraseña de tu cuenta de Pizzalog App', 422);
        }

        $pdo = Database::pdo();
        $stmt = $pdo->prepare(
            "SELECT id, business_id, name, email, password_hash, role, is_active
               FROM users
              WHERE LOWER(email) = ? AND role = 'admin' AND is_active = 1
              LIMIT 1"
        );
        $stmt->execute([$email]);
        $appUser = $stmt->fetch(\PDO::FETCH_ASSOC);

        if (!$appUser || empty($appUser['password_hash']) || !password_verify($password, (string) $appUser['password_hash'])) {
            Response::error('Credenciales de Pizzalog App incorrectas o usuario sin rol administrador', 401);
        }

        $bid = (int) $appUser['business_id'];
        $pdo->prepare('UPDATE tools_accounts SET app_user_id = ?, business_id = ? WHERE id = ?')
            ->execute([(int) $appUser['id'], $bid, $accountId]);

        $bName = $pdo->query("SELECT name FROM businesses WHERE id = {$bid}")->fetchColumn();

        Response::ok([
            'linked' => true,
            'business_id' => $bid,
            'business_name' => (string) $bName,
            'app_user_email' => (string) $appUser['email'],
        ]);
    }

    /**
     * POST /tools/sync/preview
     * Previsualiza los cambios antes de sincronizar entre Tools y App.
     */
    public function preview(Request $req): void
    {
        $bid = !empty($req->auth['business_id']) ? (int) $req->auth['business_id'] : null;
        if (!$bid) {
            Response::error('Esta cuenta de Tools no está vinculada a ningún negocio de Pizzalog App', 403);
        }

        $direction = (string) $req->input('direction', 'to_app');
        $pdo = Database::pdo();

        // Obtener espacio de trabajo de Tools
        $wsRow = $pdo->prepare('SELECT workspace_json FROM tools_workspaces WHERE account_id = ? LIMIT 1');
        $wsRow->execute([(int) $req->auth['tools_account_id']]);
        $wsJson = $wsRow->fetchColumn();
        $workspace = $wsJson ? json_decode((string) $wsJson, true) : null;

        // Insumos actuales de App
        $suppliesStmt = $pdo->prepare('SELECT id, name, cost, unit FROM supplies WHERE business_id = ? AND is_active = 1');
        $suppliesStmt->execute([$bid]);
        $appSupplies = $suppliesStmt->fetchAll(\PDO::FETCH_ASSOC);
        $appSuppliesByName = [];
        foreach ($appSupplies as $s) {
            $norm = mb_strtolower(trim((string) $s['name']));
            $appSuppliesByName[$norm] = $s;
        }

        $toolsIngredients = (array) ($workspace['catalog']['ingredients'] ?? []);
        $toolsPrices = (array) ($workspace['catalog']['purchase_prices'] ?? []);

        $newInApp = 0;
        $updatedPrices = 0;
        $unchanged = 0;

        foreach ($toolsIngredients as $ing) {
            $norm = mb_strtolower(trim((string) ($ing['name'] ?? '')));
            if (!$norm) continue;

            $priceRec = null;
            foreach ($toolsPrices as $p) {
                if (($p['ingredient_id'] ?? '') === ($ing['id'] ?? '')) {
                    $priceRec = $p;
                    break;
                }
            }

            if (!isset($appSuppliesByName[$norm])) {
                $newInApp++;
            } else {
                $currentCost = $appSuppliesByName[$norm]['cost'] !== null ? (float) $appSuppliesByName[$norm]['cost'] : null;
                $newCost = is_numeric($priceRec['purchase_price'] ?? null) ? (float) $priceRec['purchase_price'] : null;
                if ($newCost !== null && ($currentCost === null || abs($currentCost - $newCost) > 0.001)) {
                    $updatedPrices++;
                } else {
                    $unchanged++;
                }
            }
        }

        // Recetas de Tools
        $toolsRecipes = (array) ($workspace['catalog']['recipes'] ?? []);

        Response::ok([
            'direction' => $direction,
            'summary' => [
                'supplies_to_create' => $newInApp,
                'supplies_to_update_cost' => $updatedPrices,
                'supplies_unchanged' => $unchanged,
                'recipes_count' => count($toolsRecipes),
            ],
        ]);
    }

    /**
     * POST /tools/sync/apply
     * Aplica la sincronización transaccional 1-click.
     */
    public function apply(Request $req): void
    {
        $bid = !empty($req->auth['business_id']) ? (int) $req->auth['business_id'] : null;
        if (!$bid) {
            Response::error('Esta cuenta de Tools no está vinculada a ningún negocio de Pizzalog App', 403);
        }

        $direction = (string) $req->input('direction', 'to_app');
        $pdo = Database::pdo();
        PriceListController::ensureTables();
        RecipeCostingController::ensureTables();

        if ($direction === 'to_app') {
            // Sincronizar desde Tools hacia App
            $wsRow = $pdo->prepare('SELECT workspace_json FROM tools_workspaces WHERE account_id = ? LIMIT 1');
            $wsRow->execute([(int) $req->auth['tools_account_id']]);
            $wsJson = $wsRow->fetchColumn();
            $workspace = $wsJson ? json_decode((string) $wsJson, true) : null;
            if (!$workspace) {
                Response::error('No se encontró espacio de trabajo en Tools para sincronizar', 404);
            }

            $toolsIngredients = (array) ($workspace['catalog']['ingredients'] ?? []);
            $toolsPrices = (array) ($workspace['catalog']['purchase_prices'] ?? []);
            $batchId = 'sync_' . date('YmdHis') . '_' . bin2hex(random_bytes(3));

            $pdo->beginTransaction();
            try {
                $createdSupplies = 0;
                $updatedSupplies = 0;

                $selSupply = $pdo->prepare('SELECT id, cost, unit FROM supplies WHERE business_id = ? AND LOWER(name) = ? LIMIT 1 FOR UPDATE');
                $insSupply = $pdo->prepare('INSERT INTO supplies (business_id, name, unit, cost, is_active) VALUES (?, ?, ?, ?, 1)');
                $updSupply = $pdo->prepare('UPDATE supplies SET cost = ?, unit = ? WHERE id = ? AND business_id = ?');

                foreach ($toolsIngredients as $ing) {
                    $name = trim((string) ($ing['name'] ?? ''));
                    if ($name === '') continue;
                    $unit = in_array($ing['base_unit'] ?? null, ['kg', 'g', 'l', 'ml', 'u'], true) ? $ing['base_unit'] : 'kg';

                    $priceRec = null;
                    foreach ($toolsPrices as $p) {
                        if (($p['ingredient_id'] ?? '') === ($ing['id'] ?? '')) {
                            $priceRec = $p;
                            break;
                        }
                    }
                    $cost = is_numeric($priceRec['purchase_price'] ?? null) ? round((float) $priceRec['purchase_price'], 4) : null;

                    $selSupply->execute([$bid, mb_strtolower($name)]);
                    $existing = $selSupply->fetch(\PDO::FETCH_ASSOC);

                    if (!$existing) {
                        $insSupply->execute([$bid, $name, $unit, $cost]);
                        $supplyId = (int) $pdo->lastInsertId();
                        $createdSupplies++;
                        if ($cost !== null) {
                            PriceListController::recordHistory($bid, $supplyId, null, $cost, $unit, null, 'tools_sync', [
                                'batch_id' => $batchId,
                                'source_name' => '1-Click Sync Tools',
                            ]);
                        }
                    } else {
                        $supplyId = (int) $existing['id'];
                        $oldCost = $existing['cost'] !== null ? (float) $existing['cost'] : null;
                        if ($cost !== null && ($oldCost === null || abs($oldCost - $cost) > 0.0001)) {
                            $updSupply->execute([$cost, $unit, $supplyId, $bid]);
                            PriceListController::recordHistory($bid, $supplyId, $oldCost, $cost, $unit, null, 'tools_sync', [
                                'batch_id' => $batchId,
                                'source_name' => '1-Click Sync Tools',
                            ]);
                            $updatedSupplies++;
                        }
                    }
                }

                if ($createdSupplies > 0 || $updatedSupplies > 0) {
                    $pdo->prepare('UPDATE products SET cost_is_current = 0 WHERE business_id = ?')->execute([$bid]);
                }

                $pdo->commit();
                Response::ok([
                    'direction' => 'to_app',
                    'created_supplies' => $createdSupplies,
                    'updated_supplies' => $updatedSupplies,
                    'batch_id' => $batchId,
                ]);
            } catch (\Throwable $e) {
                $pdo->rollBack();
                error_log('[pizzalog-sync] to_app failed: ' . $e->getMessage());
                Response::error('Error al sincronizar datos hacia Pizzalog App', 500);
            }
        } else {
            // from_app: Sincronizar desde App hacia Tools
            // Construir un espacio de trabajo completo de Tools a partir de los datos de la App
            $supplies = $pdo->prepare('SELECT id, name, unit, cost FROM supplies WHERE business_id = ? AND is_active = 1 ORDER BY name ASC');
            $supplies->execute([$bid]);
            $appSupplies = $supplies->fetchAll(\PDO::FETCH_ASSOC);

            $ingredients = [];
            $purchasePrices = [];
            $today = date('Y-m-d');

            foreach ($appSupplies as $s) {
                $id = 'ing_app_' . $s['id'];
                $unit = in_array($s['unit'], ['kg', 'g', 'l', 'ml', 'u'], true) ? $s['unit'] : 'kg';
                $dim = ($unit === 'kg' || $unit === 'g') ? 'mass' : (($unit === 'l' || $unit === 'ml') ? 'volume' : 'count');
                $ingredients[] = [
                    'id' => $id,
                    'name' => (string) $s['name'],
                    'base_dimension' => $dim,
                    'base_unit' => $unit,
                    'is_active' => true,
                ];
                if ($s['cost'] !== null && is_numeric($s['cost'])) {
                    $purchasePrices[] = [
                        'ingredient_id' => $id,
                        'purchase_date' => $today,
                        'purchase_price' => (float) $s['cost'],
                        'currency' => 'ARS',
                        'pack_quantity' => 1,
                        'pack_unit' => $unit,
                        'yield_pct' => 100,
                        'supplier' => 'Pizzalog App Sync',
                    ];
                }
            }

            // Obtener espacio de trabajo actual para preservar gastos operativos y ventas si existen
            $wsRow = $pdo->prepare('SELECT workspace_json FROM tools_workspaces WHERE account_id = ? LIMIT 1');
            $wsRow->execute([(int) $req->auth['tools_account_id']]);
            $wsJson = $wsRow->fetchColumn();
            $existingWs = $wsJson ? json_decode((string) $wsJson, true) : [];

            $newWs = [
                'currency' => $existingWs['currency'] ?? 'ARS',
                'locale' => $existingWs['locale'] ?? 'es-AR',
                'catalog' => [
                    'as_of_date' => $today,
                    'ingredients' => $ingredients,
                    'purchase_prices' => $purchasePrices,
                    'recipes' => $existingWs['catalog']['recipes'] ?? [],
                ],
                'operatingExpenses' => $existingWs['operatingExpenses'] ?? [],
                'productSalesMap' => $existingWs['productSalesMap'] ?? [],
                'salesHistory' => $existingWs['salesHistory'] ?? [],
                'snapshots' => $existingWs['snapshots'] ?? [],
                'pricingScenario' => $existingWs['pricingScenario'] ?? [
                    'target_margin_pct' => 70,
                    'rounding_step' => 100,
                ],
            ];

            $savedJson = json_encode($newWs, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
            $pdo->prepare(
                'INSERT INTO tools_workspaces (account_id, workspace_json, schema_version)
                 VALUES (?, ?, 1)
                 ON DUPLICATE KEY UPDATE workspace_json = VALUES(workspace_json), schema_version = 1, updated_at = NOW()'
            )->execute([(int) $req->auth['tools_account_id'], $savedJson]);

            Response::ok([
                'direction' => 'from_app',
                'imported_ingredients' => count($ingredients),
                'imported_prices' => count($purchasePrices),
            ]);
        }
    }
}
