<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

class ToolsSyncController
{
    /**
     * Normaliza unidades de App al estándar UnitCode de @pizzalog/cost-engine.
     */
    private static function normalizeCostEngineUnit(?string $rawUnit, string $default = 'kg'): string
    {
        $u = strtolower(trim((string) $rawUnit));
        return match ($u) {
            'kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos' => 'kg',
            'g', 'gr', 'grs', 'gramo', 'gramos' => 'g',
            'mg', 'miligramo', 'miligramos' => 'mg',
            'lb', 'libra', 'libras' => 'lb',
            'oz', 'onza', 'onzas' => 'oz',
            'l', 'lt', 'lts', 'litro', 'litros' => 'L',
            'ml', 'mililitro', 'mililitros' => 'ml',
            'cc', 'cm3' => 'cc',
            'u', 'un', 'und', 'unit', 'unidad', 'unidades', 'porcion', 'porciones' => 'unit',
            'dozen', 'docena', 'docenas' => 'dozen',
            default => $default,
        };
    }

    /**
     * Normaliza unidades de Tools al esquema de supplies en App ('kg', 'g', 'l', 'ml', 'u').
     */
    private static function normalizeAppSupplyUnit(?string $rawUnit): string
    {
        $u = strtolower(trim((string) $rawUnit));
        return match ($u) {
            'kg', 'kilo', 'kilos' => 'kg',
            'g', 'gr', 'mg', 'lb', 'oz' => 'g',
            'l', 'lt', 'litro', 'litros' => 'l',
            'ml', 'cc', 'fl_oz_us', 'gal_us' => 'ml',
            'u', 'un', 'unit', 'unidad', 'unidades', 'dozen', 'docena' => 'u',
            default => 'kg',
        };
    }

    private function resolveBusinessId(Request $req, \PDO $pdo): ?int
    {
        if (!empty($req->auth['business_id'])) {
            return (int) $req->auth['business_id'];
        }
        $accountId = (int) ($req->auth['tools_account_id'] ?? 0);
        if ($accountId <= 0) {
            return null;
        }
        $stmt = $pdo->prepare(
            'SELECT COALESCE(ta.business_id, u.business_id) AS bid
               FROM tools_accounts ta
          LEFT JOIN users u ON u.id = ta.app_user_id
              WHERE ta.id = ?
              LIMIT 1'
        );
        $stmt->execute([$accountId]);
        $bid = $stmt->fetchColumn();
        return $bid ? (int) $bid : null;
    }

    /**
     * GET /tools/sync/status
     */
    public function status(Request $req): void
    {
        $accountId = (int) $req->auth['tools_account_id'];
        $pdo = Database::pdo();
        ToolsAuthController::ensureTables($pdo);
        $stmt = $pdo->prepare(
            'SELECT ta.id,
                    ta.app_user_id,
                    COALESCE(ta.business_id, u.business_id) AS business_id,
                    b.name AS business_name,
                    COALESCE(u.email, u.username) AS app_user_email
               FROM tools_accounts ta
          LEFT JOIN users u ON u.id = ta.app_user_id
          LEFT JOIN businesses b ON b.id = COALESCE(ta.business_id, u.business_id)
              WHERE ta.id = ?
              LIMIT 1'
        );
        $stmt->execute([$accountId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        $isLinked = !empty($row['business_id']);
        Response::ok([
            'linked' => $isLinked,
            'business_id' => $isLinked ? (int) $row['business_id'] : null,
            'business_name' => $isLinked ? (string) ($row['business_name'] ?? 'Negocio vinculado') : null,
            'app_user_email' => $isLinked ? (string) ($row['app_user_email'] ?? $req->auth['tools_email'] ?? '') : null,
        ]);
    }

    /**
     * POST /tools/sync/link-app
     * Vincula la cuenta de Tools con un usuario administrador de Pizzalog App (por email o username).
     */
    public function linkApp(Request $req): void
    {
        $accountId = (int) $req->auth['tools_account_id'];
        $environment = (string) ($req->auth['tools_environment'] ?? 'production');
        $identifier = strtolower(trim((string) ($req->input('email', '') ?: $req->input('username', ''))));
        $password = (string) $req->input('password', '');

        if ($identifier === '' || $password === '') {
            Response::error('Ingresá tu usuario/email y contraseña de Pizzalog App', 422);
        }

        $pdo = Database::pdo();
        ToolsAuthController::ensureTables($pdo);
        $stmt = $pdo->prepare(
            "SELECT id, business_id, name, email, username, password_hash, role, is_active
               FROM users
              WHERE (LOWER(email) = ? OR LOWER(username) = ?) AND role = 'admin' AND is_active = 1
              ORDER BY id ASC
              LIMIT 1"
        );
        $stmt->execute([$identifier, $identifier]);
        $appUser = $stmt->fetch(\PDO::FETCH_ASSOC);

        if (!$appUser || empty($appUser['password_hash']) || !password_verify($password, (string) $appUser['password_hash'])) {
            Response::error('Credenciales de Pizzalog App incorrectas o usuario sin rol administrador', 401);
        }

        $bid = (int) $appUser['business_id'];
        $appUserId = (int) $appUser['id'];

        // Evitar colisión en el índice único uq_tools_accounts_app_user_env (app_user_id, environment)
        $pdo->prepare('UPDATE tools_accounts SET app_user_id = NULL WHERE app_user_id = ? AND environment = ? AND id <> ?')
            ->execute([$appUserId, $environment, $accountId]);

        $pdo->prepare('UPDATE tools_accounts SET app_user_id = ?, business_id = ? WHERE id = ?')
            ->execute([$appUserId, $bid, $accountId]);

        $bStmt = $pdo->prepare('SELECT name FROM businesses WHERE id = ? LIMIT 1');
        $bStmt->execute([$bid]);
        $bName = $bStmt->fetchColumn();

        Response::ok([
            'linked' => true,
            'business_id' => $bid,
            'business_name' => (string) ($bName ?: 'Negocio vinculado'),
            'app_user_email' => (string) ($appUser['email'] ?: $appUser['username'] ?: $identifier),
        ]);
    }

    /**
     * POST /tools/sync/preview
     * Previsualiza los cambios antes de sincronizar entre Tools y App.
     */
    public function preview(Request $req): void
    {
        $pdo = Database::pdo();
        ToolsAuthController::ensureTables($pdo);
        $bid = $this->resolveBusinessId($req, $pdo);
        if (!$bid) {
            Response::error('Esta cuenta de Tools no está vinculada a ningún negocio de Pizzalog App', 403);
        }

        $direction = (string) $req->input('direction', 'to_app');

        if ($direction === 'from_app') {
            $suppliesStmt = $pdo->prepare('SELECT COUNT(*) FROM supplies WHERE business_id = ? AND is_active = 1');
            $suppliesStmt->execute([$bid]);
            $suppliesCount = (int) $suppliesStmt->fetchColumn();

            $productsStmt = $pdo->prepare('SELECT COUNT(*) FROM products WHERE business_id = ? AND is_active = 1');
            $productsStmt->execute([$bid]);
            $productsCount = (int) $productsStmt->fetchColumn();

            $salesTicketsCount = 0;
            $salesAggCount = 0;
            try {
                $salesStmt = $pdo->prepare("SELECT COUNT(DISTINCT s.id) FROM sales s WHERE s.business_id = ? AND s.status = 'completed'");
                $salesStmt->execute([$bid]);
                $salesTicketsCount = (int) $salesStmt->fetchColumn();

                $aggStmt = $pdo->prepare("
                    SELECT COUNT(*) FROM (
                        SELECT 1 
                          FROM sale_items si 
                          JOIN sales s ON s.id = si.sale_id 
                         WHERE s.business_id = ? AND s.status = 'completed' AND si.product_id IS NOT NULL 
                         GROUP BY si.product_id, DATE_FORMAT(s.created_at, '%Y-%m-01'), COALESCE(s.channel, 'counter')
                    ) agg
                ");
                $aggStmt->execute([$bid]);
                $salesAggCount = (int) $aggStmt->fetchColumn();
            } catch (\Throwable $e) {
                // Ignorar si no existen tablas de ventas aún
            }

            Response::ok([
                'direction' => 'from_app',
                'summary' => [
                    'app_supplies_count' => $suppliesCount,
                    'app_products_count' => $productsCount,
                    'app_sales_tickets' => $salesTicketsCount,
                    'app_sales_history_rows' => $salesAggCount,
                ],
            ]);
            return;
        }

        // direction === 'to_app'
        $wsRow = $pdo->prepare('SELECT workspace_json FROM tools_workspaces WHERE account_id = ? LIMIT 1');
        $wsRow->execute([(int) $req->auth['tools_account_id']]);
        $wsJson = $wsRow->fetchColumn();
        $workspace = $wsJson ? json_decode((string) $wsJson, true) : null;

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

        $toolsRecipes = (array) ($workspace['catalog']['recipes'] ?? []);

        Response::ok([
            'direction' => 'to_app',
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
        $pdo = Database::pdo();
        ToolsAuthController::ensureTables($pdo);
        $bid = $this->resolveBusinessId($req, $pdo);
        if (!$bid) {
            Response::error('Esta cuenta de Tools no está vinculada a ningún negocio de Pizzalog App', 403);
        }

        $direction = (string) $req->input('direction', 'to_app');
        PriceListController::ensureTables();
        RecipeCostingController::ensureTables($pdo);

        if ($direction === 'to_app') {
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
                    $unit = self::normalizeAppSupplyUnit((string) ($ing['base_unit'] ?? 'kg'));

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
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                error_log('[pizzalog-sync] to_app failed: ' . $e->getMessage());
                Response::error('Error al sincronizar datos hacia Pizzalog App: ' . $e->getMessage(), 500);
            }
        } else {
            // from_app: Sincronizar catálogo, productos, recetas, precios de venta e historial desde App hacia Tools
            $today = date('Y-m-d');

            // 1. Insumos y precios de compra
            $suppliesStmt = $pdo->prepare('SELECT id, name, unit, cost FROM supplies WHERE business_id = ? AND is_active = 1 ORDER BY name ASC');
            $suppliesStmt->execute([$bid]);
            $appSupplies = $suppliesStmt->fetchAll(\PDO::FETCH_ASSOC);

            $ingredients = [];
            $purchasePrices = [];
            $supplyIdToIngredientId = [];
            $supplyNameToIngredientId = [];

            foreach ($appSupplies as $s) {
                $ingId = 'ing_app_' . $s['id'];
                $supplyIdToIngredientId[(int) $s['id']] = $ingId;
                $normName = mb_strtolower(trim((string) $s['name']));
                if ($normName !== '') {
                    $supplyNameToIngredientId[$normName] = $ingId;
                }
                $unit = self::normalizeCostEngineUnit((string) ($s['unit'] ?? 'kg'), 'kg');
                $dim = in_array($unit, ['kg', 'g', 'mg', 'lb', 'oz'], true)
                    ? 'mass'
                    : (in_array($unit, ['L', 'l', 'ml', 'cc', 'fl_oz_us', 'gal_us'], true) ? 'volume' : 'count');
                $ingredients[] = [
                    'id' => $ingId,
                    'name' => (string) $s['name'],
                    'base_dimension' => $dim,
                    'base_unit' => $unit,
                    'is_active' => true,
                ];
                if ($s['cost'] !== null && is_numeric($s['cost'])) {
                    $purchasePrices[] = [
                        'ingredient_id' => $ingId,
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

            // 2. Subrecetas desde recipe_studio_recipes
            $subrecipes = [];
            $subrecipeIdMap = [];
            try {
                $subStmt = $pdo->prepare("
                    SELECT id, name, yield_quantity, yield_unit 
                      FROM recipe_studio_recipes 
                     WHERE business_id = ? AND recipe_type = 'subrecipe' AND is_active = 1
                     ORDER BY name ASC
                ");
                $subStmt->execute([$bid]);
                $subRows = $subStmt->fetchAll(\PDO::FETCH_ASSOC);

                $compStmt = $pdo->prepare("
                    SELECT component_type, supply_id, component_recipe_id, quantity, unit, sort_order 
                      FROM recipe_studio_components 
                     WHERE business_id = ? AND recipe_id = ?
                     ORDER BY sort_order ASC
                ");

                foreach ($subRows as $sub) {
                    $toolsSubId = 'sub_app_' . $sub['id'];
                    $subrecipeIdMap[(int) $sub['id']] = $toolsSubId;
                    $compStmt->execute([$bid, $sub['id']]);
                    $comps = $compStmt->fetchAll(\PDO::FETCH_ASSOC);
                    $components = [];
                    foreach ($comps as $c) {
                        $compUnit = self::normalizeCostEngineUnit((string) ($c['unit'] ?? 'kg'), 'kg');
                        if ($c['component_type'] === 'supply' && !empty($c['supply_id'])) {
                            $components[] = [
                                'component_type' => 'ingredient',
                                'ingredient_id' => $supplyIdToIngredientId[(int) $c['supply_id']] ?? ('ing_app_' . $c['supply_id']),
                                'quantity' => (float) $c['quantity'],
                                'unit' => $compUnit,
                            ];
                        } elseif ($c['component_type'] === 'recipe' && !empty($c['component_recipe_id'])) {
                            $components[] = [
                                'component_type' => 'subrecipe',
                                'recipe_id' => 'sub_app_' . $c['component_recipe_id'],
                                'quantity' => (float) $c['quantity'],
                                'unit' => $compUnit,
                            ];
                        }
                    }

                    $subrecipes[] = [
                        'id' => $toolsSubId,
                        'name' => (string) $sub['name'],
                        'recipe_type' => 'subrecipe',
                        'yield_quantity' => (float) ($sub['yield_quantity'] > 0 ? $sub['yield_quantity'] : 1),
                        'yield_unit' => self::normalizeCostEngineUnit((string) ($sub['yield_unit'] ?? 'kg'), 'kg'),
                        'currency' => 'ARS',
                        'components' => $components,
                    ];
                }
            } catch (\Throwable $e) {
                // Si la tabla no existe aún, continuar
            }

            // 3. Ventas recientes por producto (últimos 30 días para referencia)
            $recentUnitsByProduct = [];
            try {
                $recentStmt = $pdo->prepare("
                    SELECT si.product_id, SUM(si.quantity) AS monthly_units
                      FROM sale_items si
                      JOIN sales s ON s.id = si.sale_id
                     WHERE s.business_id = ? AND s.status = 'completed' AND si.product_id IS NOT NULL
                       AND s.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                     GROUP BY si.product_id
                ");
                $recentStmt->execute([$bid]);
                foreach ($recentStmt->fetchAll(\PDO::FETCH_ASSOC) as $ru) {
                    $recentUnitsByProduct[(int) $ru['product_id']] = (float) $ru['monthly_units'];
                }
            } catch (\Throwable $e) {
                // Ignorar si falla
            }

            // 4. Productos activos de App -> Recetas en Tools y precios en productSalesMap
            $productsStmt = $pdo->prepare('SELECT id, name, price, category_id FROM products WHERE business_id = ? AND is_active = 1 ORDER BY name ASC');
            $productsStmt->execute([$bid]);
            $appProducts = $productsStmt->fetchAll(\PDO::FETCH_ASSOC);

            $productRecipes = [];
            $productSalesMap = [];

            $appRecipeByProdId = [];
            try {
                $appRecStmt = $pdo->prepare("
                    SELECT id, linked_product_id, name, yield_quantity, yield_unit, target_food_cost_pct 
                      FROM recipe_studio_recipes 
                     WHERE business_id = ? AND recipe_type = 'product' AND linked_product_id IS NOT NULL AND is_active = 1
                ");
                $appRecStmt->execute([$bid]);
                foreach ($appRecStmt->fetchAll(\PDO::FETCH_ASSOC) as $ar) {
                    $appRecipeByProdId[(int) $ar['linked_product_id']] = $ar;
                }
            } catch (\Throwable $e) {
                // Ignorar
            }

            $compStmt = $pdo->prepare("
                SELECT component_type, supply_id, component_recipe_id, quantity, unit, sort_order 
                  FROM recipe_studio_components 
                 WHERE business_id = ? AND recipe_id = ?
                 ORDER BY sort_order ASC
            ");

            $legacyCompStmt = null;
            try {
                $legacyCompStmt = $pdo->prepare("
                    SELECT pi.ingredient_id, pi.quantity, pi.unit, i.name AS ingredient_name
                      FROM product_ingredients pi
                      JOIN ingredients i ON i.id = pi.ingredient_id AND i.business_id = ?
                     WHERE pi.product_id = ?
                     ORDER BY i.name ASC
                ");
            } catch (\Throwable $e) {
                $legacyCompStmt = null;
            }

            foreach ($appProducts as $p) {
                $pid = (int) $p['id'];
                $toolsProdId = 'prod_app_' . $pid;
                $sellingPrice = is_numeric($p['price']) ? (float) $p['price'] : null;

                $components = [];
                $yieldQty = 1.0;
                $yieldUnit = 'unit';
                $targetFoodCost = 30.0;

                if (isset($appRecipeByProdId[$pid])) {
                    $ar = $appRecipeByProdId[$pid];
                    $yieldQty = (float) ($ar['yield_quantity'] > 0 ? $ar['yield_quantity'] : 1);
                    $yieldUnit = self::normalizeCostEngineUnit((string) ($ar['yield_unit'] ?? 'unit'), 'unit');
                    $targetFoodCost = (float) ($ar['target_food_cost_pct'] > 0 ? $ar['target_food_cost_pct'] : 30);

                    try {
                        $compStmt->execute([$bid, $ar['id']]);
                        foreach ($compStmt->fetchAll(\PDO::FETCH_ASSOC) as $c) {
                            $compUnit = self::normalizeCostEngineUnit((string) ($c['unit'] ?? 'kg'), 'kg');
                            if ($c['component_type'] === 'supply' && !empty($c['supply_id'])) {
                                $components[] = [
                                    'component_type' => 'ingredient',
                                    'ingredient_id' => $supplyIdToIngredientId[(int) $c['supply_id']] ?? ('ing_app_' . $c['supply_id']),
                                    'quantity' => (float) $c['quantity'],
                                    'unit' => $compUnit,
                                ];
                            } elseif ($c['component_type'] === 'recipe' && !empty($c['component_recipe_id'])) {
                                $components[] = [
                                    'component_type' => 'subrecipe',
                                    'recipe_id' => $subrecipeIdMap[(int) $c['component_recipe_id']] ?? ('sub_app_' . $c['component_recipe_id']),
                                    'quantity' => (float) $c['quantity'],
                                    'unit' => $compUnit,
                                ];
                            }
                        }
                    } catch (\Throwable $e) {
                        // Ignorar componentes si falla
                    }
                }

                // Fallback a product_ingredients si no tenía receta en Recipe Studio
                if (empty($components) && $legacyCompStmt !== null) {
                    try {
                        $legacyCompStmt->execute([$bid, $pid]);
                        foreach ($legacyCompStmt->fetchAll(\PDO::FETCH_ASSOC) as $lc) {
                            $ingName = trim((string) ($lc['ingredient_name'] ?? ''));
                            if ($ingName === '') continue;
                            $normIngName = mb_strtolower($ingName);
                            $compUnit = self::normalizeCostEngineUnit((string) ($lc['unit'] ?? 'g'), 'g');
                            $qty = $lc['quantity'] !== null && (float) $lc['quantity'] > 0 ? (float) $lc['quantity'] : 1.0;

                            if (isset($supplyNameToIngredientId[$normIngName])) {
                                $targetIngId = $supplyNameToIngredientId[$normIngName];
                            } else {
                                $targetIngId = 'ing_legacy_' . (int) $lc['ingredient_id'];
                                $supplyNameToIngredientId[$normIngName] = $targetIngId;
                                $dim = in_array($compUnit, ['kg', 'g', 'mg', 'lb', 'oz'], true)
                                    ? 'mass'
                                    : (in_array($compUnit, ['L', 'l', 'ml', 'cc', 'fl_oz_us', 'gal_us'], true) ? 'volume' : 'count');
                                $baseUnit = $dim === 'mass' ? 'kg' : ($dim === 'volume' ? 'L' : 'unit');
                                $ingredients[] = [
                                    'id' => $targetIngId,
                                    'name' => $ingName,
                                    'base_dimension' => $dim,
                                    'base_unit' => $baseUnit,
                                    'is_active' => true,
                                ];
                            }

                            $components[] = [
                                'component_type' => 'ingredient',
                                'ingredient_id' => $targetIngId,
                                'quantity' => $qty,
                                'unit' => $compUnit,
                            ];
                        }
                    } catch (\Throwable $e) {
                        // Ignorar si falla lectura de product_ingredients
                    }
                }

                $productRecipes[] = [
                    'id' => $toolsProdId,
                    'name' => (string) $p['name'],
                    'recipe_type' => 'product',
                    'yield_quantity' => $yieldQty,
                    'yield_unit' => $yieldUnit,
                    'target_food_cost_pct' => $targetFoodCost,
                    'currency' => 'ARS',
                    'components' => $components,
                ];

                $productSalesMap[$toolsProdId] = [
                    'sellingPrice' => $sellingPrice,
                    'monthlyUnitsSold' => $recentUnitsByProduct[$pid] ?? null,
                ];
            }

            // 5. Historial de ventas mensuales por canal desde sale_items + sales
            $salesHistory = [];
            try {
                $histStmt = $pdo->prepare("
                    SELECT 
                        si.product_id,
                        si.product_name,
                        DATE_FORMAT(s.created_at, '%Y-%m-01') AS period_start,
                        LAST_DAY(s.created_at) AS period_end,
                        COALESCE(s.channel, 'counter') AS channel,
                        SUM(si.quantity) AS quantity,
                        SUM(si.line_total) AS gross_revenue
                    FROM sale_items si
                    JOIN sales s ON s.id = si.sale_id
                    WHERE s.business_id = ? 
                      AND s.status = 'completed' 
                      AND si.product_id IS NOT NULL
                    GROUP BY si.product_id, si.product_name, DATE_FORMAT(s.created_at, '%Y-%m-01'), LAST_DAY(s.created_at), COALESCE(s.channel, 'counter')
                    ORDER BY period_start DESC, si.product_name ASC
                ");
                $histStmt->execute([$bid]);
                foreach ($histStmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
                    $ch = mb_strtolower(trim((string) $row['channel']));
                    $channelLabel = match ($ch) {
                        'dine_in', 'salon' => 'Salón',
                        'delivery' => 'Delivery Propio',
                        'pedidosya', 'rappi' => 'PedidosYa / Rappi',
                        'whatsapp', 'web' => 'WhatsApp / Web',
                        'counter', 'takeaway' => 'Mostrador / Para llevar',
                        default => !empty($ch) ? ucfirst($ch) : 'Mostrador',
                    };

                    $salesHistory[] = [
                        'id' => 'sale_app_' . $row['product_id'] . '_' . str_replace('-', '', (string) $row['period_start']) . '_' . substr(md5((string) $row['channel']), 0, 6),
                        'product_id' => 'prod_app_' . $row['product_id'],
                        'product_name' => (string) $row['product_name'],
                        'quantity' => round((float) $row['quantity'], 2),
                        'period_start' => (string) $row['period_start'],
                        'period_end' => (string) $row['period_end'],
                        'channel' => $channelLabel,
                        'gross_revenue' => round((float) $row['gross_revenue'], 2),
                        'net_revenue' => round((float) $row['gross_revenue'], 2),
                        'source' => 'Pizzalog App (Ventas)',
                        'imported_at' => $today,
                    ];
                }
            } catch (\Throwable $e) {
                // Ignorar si falla lectura de ventas
            }

            // 6. Obtener espacio de trabajo actual para preservar gastos operativos, snapshots y limpiar datos demo
            $wsRow = $pdo->prepare('SELECT workspace_json FROM tools_workspaces WHERE account_id = ? LIMIT 1');
            $wsRow->execute([(int) $req->auth['tools_account_id']]);
            $wsJson = $wsRow->fetchColumn();
            $existingWs = $wsJson ? json_decode((string) $wsJson, true) : [];

            // Conjunto de IDs demo a eliminar para evitar duplicados y datos ficticios
            $demoIds = [
                'prod_margherita', 'prod_focaccia_a', 'prod_pollo_merma', 'prod_trufa_incompleta',
                'sub_masa_napolitana', 'sub_salsa_san_marzano', 'sub_aceite_ajo_romero',
                'ing_harina_00', 'ing_agua', 'ing_levadura_fresca', 'ing_sal_fina', 'ing_aceite_oliva',
                'ing_tomate_pelado', 'ing_mozzarella_fior', 'ing_albahaca_fresca', 'ing_pechuga_pollo',
                'ing_trufa_negra', 'ing_caja_pizza_33', 'ing_bolsa_delivery',
            ];
            $demoSet = array_flip($demoIds);

            // Preservar recetas personalizadas existentes que no sean demo ni colisionen con las de App
            $combinedRecipes = array_merge($subrecipes, $productRecipes);
            $importedRecipeIds = array_flip(array_column($combinedRecipes, 'id'));
            foreach ((array) ($existingWs['catalog']['recipes'] ?? []) as $exRec) {
                $rid = $exRec['id'] ?? '';
                if (!isset($demoSet[$rid]) && !isset($importedRecipeIds[$rid])) {
                    $combinedRecipes[] = $exRec;
                }
            }

            // Preservar insumos personalizados existentes que no sean demo
            $importedIngIds = array_flip(array_column($ingredients, 'id'));
            foreach ((array) ($existingWs['catalog']['ingredients'] ?? []) as $exIng) {
                $iid = $exIng['id'] ?? '';
                if (!isset($demoSet[$iid]) && !isset($importedIngIds[$iid])) {
                    $ingredients[] = $exIng;
                }
            }

            foreach ((array) ($existingWs['catalog']['purchase_prices'] ?? []) as $exP) {
                $iid = $exP['ingredient_id'] ?? '';
                if (!isset($demoSet[$iid]) && !isset($importedIngIds[$iid])) {
                    $purchasePrices[] = $exP;
                }
            }

            // Preservar ventas personalizadas existentes que no sean demo
            $importedSaleIds = array_flip(array_column($salesHistory, 'id'));
            foreach ((array) ($existingWs['salesHistory'] ?? []) as $exSale) {
                $pid = $exSale['product_id'] ?? '';
                $sid = $exSale['id'] ?? '';
                if (!isset($demoSet[$pid]) && !isset($importedSaleIds[$sid]) && !str_starts_with($sid, 'sale_10_') && !str_starts_with($sid, 'sale_11_')) {
                    $salesHistory[] = $exSale;
                }
            }

            // Preservar productSalesMap existente para productos no demo
            foreach ((array) ($existingWs['productSalesMap'] ?? []) as $k => $v) {
                if (!isset($demoSet[$k]) && !isset($productSalesMap[$k])) {
                    $productSalesMap[$k] = $v;
                }
            }

            $bizNameStmt = $pdo->prepare('SELECT name FROM businesses WHERE id = ? LIMIT 1');
            $bizNameStmt->execute([$bid]);
            $appBusinessName = trim((string) ($bizNameStmt->fetchColumn() ?: ''));
            $resolvedBusinessName = $appBusinessName !== ''
                ? $appBusinessName
                : (trim((string) ($existingWs['businessName'] ?? '')) ?: 'Mi Pizzería');

            $newWs = [
                'businessName' => $resolvedBusinessName,
                'currency' => $existingWs['currency'] ?? 'ARS',
                'locale' => $existingWs['locale'] ?? 'es-AR',
                'unitSystem' => $existingWs['unitSystem'] ?? 'metric',
                'defaultTargetFoodCostPct' => $existingWs['defaultTargetFoodCostPct'] ?? 30,
                'defaultRoundingIncrement' => $existingWs['defaultRoundingIncrement'] ?? 100,
                'defaultPackagingCost' => $existingWs['defaultPackagingCost'] ?? 0,
                'defaultChannelFeePct' => $existingWs['defaultChannelFeePct'] ?? 0,
                'salesPeriod' => date('Y-m'),
                'catalog' => [
                    'as_of_date' => $today,
                    'ingredients' => array_values($ingredients),
                    'purchase_prices' => array_values($purchasePrices),
                    'recipes' => array_values($combinedRecipes),
                ],
                'operatingExpenses' => array_values((array) ($existingWs['operatingExpenses'] ?? [])),
                'productSalesMap' => (object) $productSalesMap,
                'salesHistory' => array_values($salesHistory),
                'snapshots' => array_values((array) ($existingWs['snapshots'] ?? [])),
                'equivalences' => (object) ($existingWs['equivalences'] ?? []),
                'pricingScenario' => $existingWs['pricingScenario'] ?? [
                    'target_margin_pct' => 70,
                    'rounding_step' => 100,
                ],
            ];

            $accountId = (int) $req->auth['tools_account_id'];
            $savedJson = json_encode($newWs, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
            $pdo->prepare(
                'INSERT INTO tools_workspaces (account_id, workspace_json, schema_version)
                 VALUES (?, ?, 1)
                 ON DUPLICATE KEY UPDATE workspace_json = VALUES(workspace_json), schema_version = 1, updated_at = NOW()'
            )->execute([$accountId, $savedJson]);

            $tsStmt = $pdo->prepare('SELECT updated_at FROM tools_workspaces WHERE account_id = ? LIMIT 1');
            $tsStmt->execute([$accountId]);
            $updatedAt = $tsStmt->fetchColumn();

            Response::ok([
                'direction' => 'from_app',
                'imported_ingredients' => count($ingredients),
                'imported_prices' => count($purchasePrices),
                'imported_recipes' => count($combinedRecipes),
                'imported_products' => count($appProducts),
                'imported_sales' => count($salesHistory),
                'updated_at' => $updatedAt ?: null,
                'workspace' => $newWs,
            ]);
        }
    }
}
