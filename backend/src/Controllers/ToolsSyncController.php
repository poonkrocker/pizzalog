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

    /**
     * Convierte una cantidad de envase en Tools a la unidad destino en App respetando dimensiones físicas.
     */
    private static function convertQuantityForApp(
        float $qty,
        string $fromUnit,
        string $toUnit,
        ?float $densityGPerMl = null,
        ?float $unitWeightG = null
    ): ?float {
        if (!is_finite($qty) || $qty <= 0) {
            return null;
        }
        $fromNorm = self::normalizeCostEngineUnit($fromUnit, $fromUnit);
        $toNorm = self::normalizeCostEngineUnit($toUnit, $toUnit);
        if ($fromNorm === $toNorm) {
            return $qty;
        }

        $massToG = [
            'g' => 1.0,
            'kg' => 1000.0,
            'mg' => 0.001,
            'lb' => 453.59237,
            'oz' => 28.349523125,
        ];
        $volToMl = [
            'ml' => 1.0,
            'cc' => 1.0,
            'L' => 1000.0,
            'fl_oz_us' => 29.5735295625,
            'gal_us' => 3785.411784,
        ];
        $countToUnit = [
            'unit' => 1.0,
            'dozen' => 12.0,
        ];

        $fromGrams = $massToG[$fromNorm] ?? null;
        $toGrams = $massToG[$toNorm] ?? null;
        if ($fromGrams !== null && $toGrams !== null) {
            return ($qty * $fromGrams) / $toGrams;
        }

        $fromMl = $volToMl[$fromNorm] ?? null;
        $toMl = $volToMl[$toNorm] ?? null;
        if ($fromMl !== null && $toMl !== null) {
            return ($qty * $fromMl) / $toMl;
        }

        $fromCount = $countToUnit[$fromNorm] ?? null;
        $toCount = $countToUnit[$toNorm] ?? null;
        if ($fromCount !== null && $toCount !== null) {
            return ($qty * $fromCount) / $toCount;
        }

        // Puente explícito masa <-> volumen cuando el ingrediente define densidad_g_per_ml
        if ($densityGPerMl !== null && $densityGPerMl > 0) {
            if ($fromGrams !== null && $toMl !== null) {
                $grams = $qty * $fromGrams;
                return ($grams / $densityGPerMl) / $toMl;
            }
            if ($fromMl !== null && $toGrams !== null) {
                $grams = ($qty * $fromMl) * $densityGPerMl;
                return $grams / $toGrams;
            }
        }

        // Puente explícito conteo <-> masa cuando el ingrediente define unit_weight_g
        if ($unitWeightG !== null && $unitWeightG > 0) {
            if ($fromCount !== null && $toGrams !== null) {
                return ($qty * $fromCount * $unitWeightG) / $toGrams;
            }
            if ($fromGrams !== null && $toCount !== null) {
                return (($qty * $fromGrams) / $unitWeightG) / $toCount;
            }
        }

        return null;
    }

    /**
     * Selecciona el precio de compra vigente más reciente para un ingrediente (paridad con Cost Engine).
     */
    private static function selectLatestPurchasePrice(string $ingredientId, array $prices, ?string $asOfDate = null): ?array
    {
        $candidates = [];
        foreach ($prices as $idx => $p) {
            if (!is_array($p) || ($p['ingredient_id'] ?? '') !== $ingredientId) {
                continue;
            }
            $date = trim((string) ($p['purchase_date'] ?? ''));
            if ($asOfDate !== null && $asOfDate !== '' && $date !== '' && $date > $asOfDate) {
                continue;
            }
            $candidates[] = ['idx' => $idx, 'date' => $date, 'rec' => $p];
        }
        if (empty($candidates)) {
            return null;
        }
        usort($candidates, static function (array $a, array $b): int {
            $cmp = strcmp($b['date'], $a['date']);
            return $cmp !== 0 ? $cmp : ($b['idx'] <=> $a['idx']);
        });
        return $candidates[0]['rec'];
    }

    /**
     * Calcula el costo unitario utilizable en la unidad de App considerando tamaño de envase y rendimiento (%).
     */
    private static function computeUnitCostForApp(array $ingredient, array $prices, string $appTargetUnit): ?float
    {
        $ingId = (string) ($ingredient['id'] ?? '');
        if ($ingId === '') {
            return null;
        }
        if (!empty($ingredient['is_free'])) {
            return 0.0;
        }
        $priceRec = self::selectLatestPurchasePrice($ingId, $prices);
        if (!$priceRec || !is_numeric($priceRec['purchase_price'] ?? null)) {
            return null;
        }
        $packPrice = (float) $priceRec['purchase_price'];
        $packQty = is_numeric($priceRec['pack_quantity'] ?? null) && (float) $priceRec['pack_quantity'] > 0
            ? (float) $priceRec['pack_quantity']
            : 1.0;
        $packUnit = (string) ($priceRec['pack_unit'] ?? ($ingredient['base_unit'] ?? $appTargetUnit));
        $density = is_numeric($ingredient['density_g_per_ml'] ?? null) ? (float) $ingredient['density_g_per_ml'] : null;
        $unitWeight = is_numeric($ingredient['unit_weight_g'] ?? null) ? (float) $ingredient['unit_weight_g'] : null;

        $convertedPackQty = self::convertQuantityForApp($packQty, $packUnit, $appTargetUnit, $density, $unitWeight);
        if ($convertedPackQty === null || $convertedPackQty <= 0) {
            return null;
        }
        $yieldPct = is_numeric($priceRec['yield_pct'] ?? null) ? (float) $priceRec['yield_pct'] : 100.0;
        if ($yieldPct <= 0 || $yieldPct > 100) {
            $yieldPct = 100.0;
        }
        return round(($packPrice / $convertedPackQty) / ($yieldPct / 100.0), 4);
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
            "SELECT COALESCE(ta.business_id, u.business_id) AS bid
               FROM tools_accounts ta
               JOIN users u ON u.id = ta.app_user_id
              WHERE ta.id = ?
                AND ta.app_user_id IS NOT NULL
                AND u.is_active = 1
                AND u.role = 'admin'
              LIMIT 1"
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
                    u.is_active AS app_user_active,
                    u.role AS app_user_role,
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

        $isLinked = !empty($row['app_user_id'])
            && !empty($row['business_id'])
            && (int) ($row['app_user_active'] ?? 0) === 1
            && ($row['app_user_role'] ?? '') === 'admin';
        Response::ok([
            'linked' => $isLinked,
            'business_id' => $isLinked ? (int) $row['business_id'] : null,
            'business_name' => $isLinked ? (string) ($row['business_name'] ?? 'Negocio vinculado') : null,
            'app_user_email' => $isLinked ? (string) ($row['app_user_email'] ?? $req->auth['tools_email'] ?? '') : null,
        ]);
    }

    /**
     * POST /tools/sync/unlink-app
     * Desvincula la cuenta de Tools de Pizzalog App sin tocar los datos de ninguno de los dos sistemas.
     */
    public function unlinkApp(Request $req): void
    {
        $accountId = (int) $req->auth['tools_account_id'];
        $pdo = Database::pdo();
        ToolsAuthController::ensureTables($pdo);
        $pdo->prepare('UPDATE tools_accounts SET app_user_id = NULL, business_id = NULL WHERE id = ?')
            ->execute([$accountId]);

        Response::ok([
            'linked' => false,
            'business_id' => null,
            'business_name' => null,
            'app_user_email' => null,
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
            error_log('[pizzalog-sync] Failed App link attempt account_id=' . $accountId . ' tag=' . substr(hash('sha256', $identifier), 0, 12));
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
        $mode = (string) $req->input('mode', 'merge_preserve_manual');
        if (!in_array($mode, ['merge_preserve_manual', 'overwrite_app_records'], true)) {
            $mode = 'merge_preserve_manual';
        }

        if ($direction === 'from_app') {
            $suppliesStmt = $pdo->prepare('SELECT id, name FROM supplies WHERE business_id = ? AND is_active = 1');
            $suppliesStmt->execute([$bid]);
            $appSupplies = $suppliesStmt->fetchAll(\PDO::FETCH_ASSOC);
            $suppliesCount = count($appSupplies);

            $productsStmt = $pdo->prepare('SELECT id, name FROM products WHERE business_id = ? AND is_active = 1');
            $productsStmt->execute([$bid]);
            $appProducts = $productsStmt->fetchAll(\PDO::FETCH_ASSOC);
            $productsCount = count($appProducts);

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
                error_log('[pizzalog-sync] preview from_app sales query note: ' . $e->getMessage());
            }

            $wsRow = $pdo->prepare('SELECT workspace_json FROM tools_workspaces WHERE account_id = ? LIMIT 1');
            $wsRow->execute([(int) $req->auth['tools_account_id']]);
            $wsJson = $wsRow->fetchColumn();
            $existingWs = $wsJson ? json_decode((string) $wsJson, true) : [];

            $existingIngIds = [];
            $manualIngCount = 0;
            foreach ((array) ($existingWs['catalog']['ingredients'] ?? []) as $exIng) {
                $iid = (string) ($exIng['id'] ?? '');
                if ($iid !== '') {
                    $existingIngIds[$iid] = true;
                    if (!str_starts_with($iid, 'ing_app_') && !str_starts_with($iid, 'ing_')) {
                        $manualIngCount++;
                    } elseif (str_starts_with($iid, 'ing_') && !str_starts_with($iid, 'ing_app_') && !in_array($iid, ['ing_harina', 'ing_levadura', 'ing_sal', 'ing_agua', 'ing_tomate', 'ing_aceite', 'ing_mozzarella', 'ing_pollo', 'ing_garbanzo', 'ing_trufa', 'ing_harina_00', 'ing_levadura_fresca', 'ing_sal_fina', 'ing_aceite_oliva', 'ing_tomate_pelado', 'ing_mozzarella_fior', 'ing_albahaca_fresca', 'ing_pechuga_pollo', 'ing_trufa_negra', 'ing_caja_pizza_33', 'ing_bolsa_delivery'], true)) {
                        $manualIngCount++;
                    }
                }
            }
            $existingRecIds = [];
            $manualRecCount = 0;
            foreach ((array) ($existingWs['catalog']['recipes'] ?? []) as $exRec) {
                $rid = (string) ($exRec['id'] ?? '');
                if ($rid !== '') {
                    $existingRecIds[$rid] = $exRec;
                    if (!str_starts_with($rid, 'prod_app_') && !str_starts_with($rid, 'sub_app_') && !in_array($rid, ['prod_margherita', 'prod_focaccia_a', 'prod_pollo_merma', 'prod_trufa_incompleta', 'sub_masa_poolish', 'sub_salsa', 'sub_masa_napolitana', 'sub_salsa_san_marzano', 'sub_aceite_ajo_romero'], true)) {
                        $manualRecCount++;
                    }
                }
            }

            $newSuppliesToAdd = 0;
            $existingAppLinked = 0;
            foreach ($appSupplies as $s) {
                $idKey = 'ing_app_' . $s['id'];
                if (isset($existingIngIds[$idKey])) {
                    $existingAppLinked++;
                } else {
                    $newSuppliesToAdd++;
                }
            }
            $newProductsToAdd = 0;
            foreach ($appProducts as $p) {
                $pKey = 'prod_app_' . $p['id'];
                if (!isset($existingRecIds[$pKey])) {
                    $newProductsToAdd++;
                } else {
                    $existingAppLinked++;
                }
            }

            Response::ok([
                'direction' => 'from_app',
                'mode' => $mode,
                'summary' => [
                    'app_supplies_count' => $suppliesCount,
                    'app_products_count' => $productsCount,
                    'app_sales_tickets' => $salesTicketsCount,
                    'app_sales_history_rows' => $salesAggCount,
                    'new_supplies_to_add' => $newSuppliesToAdd,
                    'new_products_to_add' => $newProductsToAdd,
                    'existing_app_linked_count' => $existingAppLinked,
                    'manual_items_preserved' => $manualIngCount + $manualRecCount,
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

            if (!isset($appSuppliesByName[$norm])) {
                $newInApp++;
            } else {
                $appUnit = (string) ($appSuppliesByName[$norm]['unit'] ?? self::normalizeAppSupplyUnit((string) ($ing['base_unit'] ?? 'kg')));
                $currentCost = $appSuppliesByName[$norm]['cost'] !== null ? (float) $appSuppliesByName[$norm]['cost'] : null;
                $newCost = self::computeUnitCostForApp($ing, $toolsPrices, $appUnit);
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
        $mode = (string) $req->input('mode', 'merge_preserve_manual');
        if (!in_array($mode, ['merge_preserve_manual', 'overwrite_app_records'], true)) {
            $mode = 'merge_preserve_manual';
        }
        $driver = (string) $pdo->getAttribute(\PDO::ATTR_DRIVER_NAME);
        $nowExpr = $driver === 'sqlite' ? "datetime('now')" : 'NOW()';

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
            $forUpdate = $driver === 'sqlite' ? '' : ' FOR UPDATE';

            $pdo->beginTransaction();
            try {
                $createdSupplies = 0;
                $updatedSupplies = 0;

                $selSupply = $pdo->prepare("SELECT id, cost, unit FROM supplies WHERE business_id = ? AND LOWER(name) = ? LIMIT 1{$forUpdate}");
                $insSupply = $pdo->prepare('INSERT INTO supplies (business_id, name, unit, cost, is_active) VALUES (?, ?, ?, ?, 1)');
                $updSupply = $pdo->prepare('UPDATE supplies SET cost = ?, unit = ? WHERE id = ? AND business_id = ?');

                foreach ($toolsIngredients as $ing) {
                    $name = trim((string) ($ing['name'] ?? ''));
                    if ($name === '') continue;
                    $unit = self::normalizeAppSupplyUnit((string) ($ing['base_unit'] ?? 'kg'));

                    $selSupply->execute([$bid, mb_strtolower($name)]);
                    $existing = $selSupply->fetch(\PDO::FETCH_ASSOC);

                    if (!$existing) {
                        $cost = self::computeUnitCostForApp($ing, $toolsPrices, $unit);
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
                        $targetUnit = trim((string) ($existing['unit'] ?? $unit)) ?: $unit;
                        $cost = self::computeUnitCostForApp($ing, $toolsPrices, $targetUnit);
                        $oldCost = $existing['cost'] !== null ? (float) $existing['cost'] : null;
                        if ($cost !== null && ($oldCost === null || abs($oldCost - $cost) > 0.0001)) {
                            $updSupply->execute([$cost, $targetUnit, $supplyId, $bid]);
                            PriceListController::recordHistory($bid, $supplyId, $oldCost, $cost, $targetUnit, null, 'tools_sync', [
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
                error_log('[pizzalog-sync] to_app failed account_id=' . (int) ($req->auth['tools_account_id'] ?? 0) . ': ' . $e->getMessage());
                $debug = (bool) \Pizzalog\Core\Config::get('debug', false);
                Response::error(
                    $debug ? ('Error al sincronizar datos hacia Pizzalog App: ' . $e->getMessage()) : 'No se pudo completar la sincronización hacia Pizzalog App. Los cambios fueron revertidos sin afectar los datos existentes.',
                    500
                );
            }
        } else {
            // from_app: Sincronizar catálogo, productos, recetas, precios de venta e historial desde App hacia Tools
            $today = date('Y-m-d');
            $wsRowPre = $pdo->prepare('SELECT workspace_json FROM tools_workspaces WHERE account_id = ? LIMIT 1');
            $wsRowPre->execute([(int) $req->auth['tools_account_id']]);
            $wsJsonPre = $wsRowPre->fetchColumn();
            $existingWsPre = $wsJsonPre ? json_decode((string) $wsJsonPre, true) : [];
            $targetCurrency = is_string($existingWsPre['currency'] ?? null) && trim($existingWsPre['currency']) !== ''
                ? trim($existingWsPre['currency'])
                : 'ARS';

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
                        'currency' => $targetCurrency,
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
                        'currency' => $targetCurrency,
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
                    $rawFc = (float) ($ar['target_food_cost_pct'] ?? 30);
                    $targetFoodCost = ($rawFc > 0 && $rawFc < 100) ? $rawFc : 30.0;

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
                    'currency' => $targetCurrency,
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

            // 6. Obtener espacio de trabajo actual para preservar ediciones manuales, gastos y crear backup previo
            $accountId = (int) $req->auth['tools_account_id'];
            $wsRow = $pdo->prepare('SELECT workspace_json, version FROM tools_workspaces WHERE account_id = ? LIMIT 1');
            $wsRow->execute([$accountId]);
            $wsCurrentRow = $wsRow->fetch(\PDO::FETCH_ASSOC);
            $wsJson = $wsCurrentRow ? (string) ($wsCurrentRow['workspace_json'] ?? '') : '';
            $existingWs = $wsJson !== '' ? json_decode($wsJson, true) : [];

            $demoIds = [
                'prod_margherita', 'prod_focaccia_a', 'prod_pollo_merma', 'prod_trufa_incompleta',
                'sub_masa_poolish', 'sub_salsa',
                'sub_masa_napolitana', 'sub_salsa_san_marzano', 'sub_aceite_ajo_romero',
                'ing_harina', 'ing_levadura', 'ing_sal', 'ing_agua', 'ing_tomate',
                'ing_aceite', 'ing_mozzarella', 'ing_pollo', 'ing_garbanzo', 'ing_trufa',
                'ing_harina_00', 'ing_levadura_fresca', 'ing_sal_fina', 'ing_aceite_oliva',
                'ing_tomate_pelado', 'ing_mozzarella_fior', 'ing_albahaca_fresca', 'ing_pechuga_pollo',
                'ing_trufa_negra', 'ing_caja_pizza_33', 'ing_bolsa_delivery',
            ];
            $demoSet = array_flip($demoIds);
            $demoExpenseSet = array_flip(['exp_1', 'exp_2', 'exp_3', 'exp_4']);
            $demoSnapshotSet = array_flip(['snap_margh_sep', 'snap_margh_oct', 'snap_margh_nov']);

            $existingIngredientsById = [];
            foreach ((array) ($existingWs['catalog']['ingredients'] ?? []) as $exIng) {
                $iid = (string) ($exIng['id'] ?? '');
                if ($iid !== '' && !isset($demoSet[$iid])) {
                    $existingIngredientsById[$iid] = $exIng;
                }
            }
            $existingRecipesById = [];
            foreach ((array) ($existingWs['catalog']['recipes'] ?? []) as $exRec) {
                $rid = (string) ($exRec['id'] ?? '');
                if ($rid !== '' && !isset($demoSet[$rid])) {
                    $existingRecipesById[$rid] = $exRec;
                }
            }

            // Fusionar ingredientes preservando metadatos técnicos manuales (densidad, unit_weight_g, is_free)
            $preservedManualCount = 0;
            foreach ($ingredients as &$appIng) {
                $iid = (string) ($appIng['id'] ?? '');
                if (isset($existingIngredientsById[$iid])) {
                    $ex = $existingIngredientsById[$iid];
                    if (array_key_exists('density_g_per_ml', $ex) && $ex['density_g_per_ml'] !== null) {
                        $appIng['density_g_per_ml'] = $ex['density_g_per_ml'];
                    }
                    if (array_key_exists('unit_weight_g', $ex) && $ex['unit_weight_g'] !== null) {
                        $appIng['unit_weight_g'] = $ex['unit_weight_g'];
                    }
                    if (!empty($ex['is_free'])) {
                        $appIng['is_free'] = true;
                    }
                    if ($mode === 'merge_preserve_manual' && !empty($ex['base_unit'])) {
                        $appIng['base_dimension'] = $ex['base_dimension'] ?? $appIng['base_dimension'];
                        $appIng['base_unit'] = $ex['base_unit'];
                    }
                }
            }
            unset($appIng);

            $importedIngIds = array_flip(array_column($ingredients, 'id'));
            foreach ($existingIngredientsById as $iid => $exIng) {
                if (!isset($importedIngIds[$iid])) {
                    $ingredients[] = $exIng;
                    $preservedManualCount++;
                }
            }

            // Historial de precios: preservar TODAS las cargas manuales y evitar duplicar filas idénticas de App Sync
            $manualAndPriorPrices = [];
            $latestAppSyncPriceByIng = [];
            foreach ((array) ($existingWs['catalog']['purchase_prices'] ?? []) as $exIdx => $exP) {
                if (!is_array($exP)) continue;
                $iid = (string) ($exP['ingredient_id'] ?? '');
                if ($iid === '' || isset($demoSet[$iid])) continue;
                $sup = (string) ($exP['supplier'] ?? '');
                if ($sup === 'Pizzalog App Sync') {
                    $latestAppSyncPriceByIng[$iid] = $exP;
                    $manualAndPriorPrices[] = $exP;
                } else {
                    $manualAndPriorPrices[] = $exP;
                }
            }

            $mergedPurchasePrices = $manualAndPriorPrices;
            $skippedDuplicatePrices = 0;
            foreach ($purchasePrices as $newAppPrice) {
                $iid = (string) ($newAppPrice['ingredient_id'] ?? '');
                $prevApp = $latestAppSyncPriceByIng[$iid] ?? null;
                if (
                    $prevApp !== null
                    && is_numeric($prevApp['purchase_price'] ?? null)
                    && is_numeric($newAppPrice['purchase_price'] ?? null)
                    && abs((float) $prevApp['purchase_price'] - (float) $newAppPrice['purchase_price']) <= 0.0001
                    && (string) ($prevApp['pack_unit'] ?? '') === (string) ($newAppPrice['pack_unit'] ?? '')
                ) {
                    $skippedDuplicatePrices++;
                    continue;
                }
                $mergedPurchasePrices[] = $newAppPrice;
            }

            // Recetas y Subrecetas: en merge_preserve_manual no sobrescribir recetas ya cargadas/editadas manualmente
            $mergedAppRecipes = [];
            foreach (array_merge($subrecipes, $productRecipes) as $appRec) {
                $rid = (string) ($appRec['id'] ?? '');
                $exRec = $existingRecipesById[$rid] ?? null;
                $existingHasFormula = $exRec !== null && (!empty($exRec['components']) || !empty($exRec['bakers_dough']) || !empty($exRec['faina']));
                if ($mode === 'merge_preserve_manual' && $exRec !== null && ($existingHasFormula || (isset($appRec['components']) && count((array) $appRec['components']) === 0))) {
                    $mergedAppRecipes[] = $exRec;
                    $preservedManualCount++;
                } else {
                    $mergedAppRecipes[] = $appRec;
                }
            }
            $importedRecipeIds = array_flip(array_column($mergedAppRecipes, 'id'));
            foreach ($existingRecipesById as $rid => $exRec) {
                if (!isset($importedRecipeIds[$rid])) {
                    $mergedAppRecipes[] = $exRec;
                    $preservedManualCount++;
                }
            }

            // Ventas históricas: conservar registros manuales y deduplicar por id estable
            $importedSaleIds = array_flip(array_column($salesHistory, 'id'));
            foreach ((array) ($existingWs['salesHistory'] ?? []) as $exSale) {
                $pid = (string) ($exSale['product_id'] ?? '');
                $sid = (string) ($exSale['id'] ?? '');
                if (!isset($demoSet[$pid]) && !isset($importedSaleIds[$sid]) && !str_starts_with($sid, 'sale_10_') && !str_starts_with($sid, 'sale_11_')) {
                    $salesHistory[] = $exSale;
                }
            }

            // productSalesMap: preservar precios de carta o unidades cargadas manualmente cuando el modo es conservador
            $existingSalesMap = is_array($existingWs['productSalesMap'] ?? null) ? $existingWs['productSalesMap'] : [];
            foreach ($productSalesMap as $k => $appPlan) {
                $exPlan = $existingSalesMap[$k] ?? null;
                if ($mode === 'merge_preserve_manual' && is_array($exPlan)) {
                    $mergedPlan = $appPlan;
                    if (array_key_exists('sellingPrice', $exPlan) && $exPlan['sellingPrice'] !== null) {
                        $mergedPlan['sellingPrice'] = $exPlan['sellingPrice'];
                    }
                    if (array_key_exists('monthlyUnitsSold', $exPlan) && $exPlan['monthlyUnitsSold'] !== null) {
                        $mergedPlan['monthlyUnitsSold'] = $exPlan['monthlyUnitsSold'];
                    }
                    $productSalesMap[$k] = $mergedPlan;
                }
            }
            foreach ($existingSalesMap as $k => $v) {
                if (!isset($demoSet[$k]) && !isset($productSalesMap[$k])) {
                    $productSalesMap[$k] = $v;
                }
            }

            $bizNameStmt = $pdo->prepare('SELECT name FROM businesses WHERE id = ? LIMIT 1');
            $bizNameStmt->execute([$bid]);
            $appBusinessName = trim((string) ($bizNameStmt->fetchColumn() ?: ''));
            $existingBusinessName = trim((string) ($existingWs['businessName'] ?? ''));
            $isDefaultBizName = $existingBusinessName === '' || $existingBusinessName === 'Mi Pizzería' || str_contains($existingBusinessName, 'Il Forno') || str_contains($existingBusinessName, 'Demo');
            $resolvedBusinessName = ($mode === 'merge_preserve_manual' && !$isDefaultBizName)
                ? $existingBusinessName
                : ($appBusinessName !== '' ? $appBusinessName : ($existingBusinessName ?: 'Mi Pizzería'));

            $cleanExpenses = [];
            foreach ((array) ($existingWs['operatingExpenses'] ?? []) as $exExp) {
                $eid = (string) ($exExp['id'] ?? '');
                $ename = (string) ($exExp['name'] ?? '');
                if (!isset($demoExpenseSet[$eid]) && !str_contains($ename, '(Demo)')) {
                    $cleanExpenses[] = $exExp;
                }
            }

            $cleanSnapshots = [];
            foreach ((array) ($existingWs['snapshots'] ?? []) as $exSnap) {
                $sid = (string) ($exSnap['snapshot_id'] ?? '');
                $rid = (string) ($exSnap['recipe_id'] ?? '');
                if (!isset($demoSnapshotSet[$sid]) && !isset($demoSet[$rid])) {
                    $cleanSnapshots[] = $exSnap;
                }
            }

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
                    'purchase_prices' => array_values($mergedPurchasePrices),
                    'recipes' => array_values($mergedAppRecipes),
                ],
                'operatingExpenses' => array_values($cleanExpenses),
                'productSalesMap' => (object) $productSalesMap,
                'salesHistory' => array_values($salesHistory),
                'snapshots' => array_values($cleanSnapshots),
                'equivalences' => (object) ($existingWs['equivalences'] ?? []),
                'pricingScenario' => $existingWs['pricingScenario'] ?? [
                    'target_margin_pct' => 70,
                    'rounding_step' => 100,
                ],
            ];

            $savedJson = json_encode($newWs, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
            if ($savedJson === false || strlen($savedJson) > 20 * 1024 * 1024) {
                Response::error('El espacio de trabajo resultante supera el límite seguro de 20 MB', 413);
            }

            $pdo->beginTransaction();
            try {
                if ($wsCurrentRow) {
                    $curVersion = (int) ($wsCurrentRow['version'] ?? 1);
                    try {
                        $pdo->prepare(
                            "INSERT INTO tools_workspace_backups (account_id, version, workspace_json, created_at)
                             VALUES (?, ?, ?, {$nowExpr})"
                        )->execute([$accountId, $curVersion, $wsJson]);
                    } catch (\Throwable $ignoreBkp) {
                        error_log('[pizzalog-sync] pre-sync backup note: ' . $ignoreBkp->getMessage());
                    }

                    $newVersion = $curVersion + 1;
                    $pdo->prepare(
                        "UPDATE tools_workspaces
                            SET workspace_json = ?, schema_version = 1, version = ?, updated_at = {$nowExpr}
                          WHERE account_id = ?"
                    )->execute([$savedJson, $newVersion, $accountId]);
                } else {
                    $newVersion = 1;
                    $pdo->prepare(
                        "INSERT INTO tools_workspaces (account_id, workspace_json, schema_version, version, updated_at)
                         VALUES (?, ?, 1, 1, {$nowExpr})"
                    )->execute([$accountId, $savedJson]);
                }

                $tsStmt = $pdo->prepare('SELECT version, updated_at FROM tools_workspaces WHERE account_id = ? LIMIT 1');
                $tsStmt->execute([$accountId]);
                $tsRow = $tsStmt->fetch(\PDO::FETCH_ASSOC);
                $updatedAt = $tsRow['updated_at'] ?? null;
                $finalVersion = isset($tsRow['version']) ? (int) $tsRow['version'] : $newVersion;

                $pdo->commit();

                Response::ok([
                    'direction' => 'from_app',
                    'mode' => $mode,
                    'imported_ingredients' => count($ingredients),
                    'imported_prices' => count($mergedPurchasePrices),
                    'skipped_duplicate_prices' => $skippedDuplicatePrices,
                    'preserved_manual_items' => $preservedManualCount,
                    'imported_recipes' => count($mergedAppRecipes),
                    'imported_products' => count($appProducts),
                    'imported_sales' => count($salesHistory),
                    'version' => $finalVersion,
                    'updated_at' => $updatedAt ?: null,
                    'workspace' => $newWs,
                ]);
            } catch (\Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                error_log('[pizzalog-sync] from_app failed account_id=' . $accountId . ': ' . $e->getMessage());
                $debug = (bool) \Pizzalog\Core\Config::get('debug', false);
                Response::error(
                    $debug ? ('Error al importar desde Pizzalog App: ' . $e->getMessage()) : 'No se pudo completar la importación desde Pizzalog App. No se modificó tu espacio de trabajo.',
                    500
                );
            }
        }
    }
}
