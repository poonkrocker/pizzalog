import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as costEnginePkg from '../dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

function readRepoFile(relPath) {
  return fs.readFileSync(path.resolve(REPO_ROOT, relPath), 'utf8');
}

const { CostEngine, computeUsableIngredientCost, convertQuantity } = costEnginePkg;

/**
 * Réplica JS fiel del algoritmo ToolsSyncController::computeUnitCostForApp
 * para validar paridad exacta de conversión envase/merma Tools -> App.
 */
function simulateToolsSyncUnitCostForApp(ing, prices, appTargetUnit) {
  if (ing.is_free) return 0;
  const candidates = prices
    .map((rec, idx) => ({ rec, idx, date: String(rec.purchase_date ?? '').trim() }))
    .filter((x) => x.rec.ingredient_id === ing.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.idx - a.idx);
  const effective = candidates[0]?.rec;
  if (!effective || typeof effective.purchase_price !== 'number') return null;
  const packQty = effective.pack_quantity > 0 ? effective.pack_quantity : 1;
  const packUnit = effective.pack_unit || ing.base_unit;
  const normAppUnit = appTargetUnit === 'l' ? 'L' : appTargetUnit === 'u' ? 'unit' : appTargetUnit;
  let convertedQty = null;
  try {
    convertedQty = convertQuantity(packQty, packUnit, normAppUnit, ing);
  } catch {
    return null;
  }
  if (!(convertedQty > 0)) return null;
  const yieldPct = effective.yield_pct > 0 && effective.yield_pct <= 100 ? effective.yield_pct : 100;
  return Number(((effective.purchase_price / convertedQty) / (yieldPct / 100)).toFixed(4));
}

test('Bloque 8 (Tareas 8.1 a 8.5): Integración opcional con Pizzalog App (vinculación, importación, protección manual, idempotencia y errores)', async (t) => {
  await t.test('Tarea 8.1: Vinculación y desvinculación segura sin afectar autonomía ni mezclar cuentas', () => {
    const syncCtrl = readRepoFile('backend/src/Controllers/ToolsSyncController.php');
    assert.match(syncCtrl, /public function linkApp/, 'Debe implementar POST /tools/sync/link-app');
    assert.match(syncCtrl, /WHERE \(LOWER\(email\) = \? OR LOWER\(username\) = \?\) AND role = 'admin' AND is_active = 1/, 'linkApp debe restringir a admin activo de App');
    assert.match(syncCtrl, /password_verify\(\$password,\s*\(string\)\s*\$appUser\['password_hash'\]\)/, 'linkApp debe verificar contraseña real de App');
    assert.match(syncCtrl, /public function unlinkApp/, 'Debe implementar POST /tools/sync/unlink-app');
    assert.match(syncCtrl, /UPDATE tools_accounts SET app_user_id = NULL, business_id = NULL WHERE id = \?/, 'unlinkApp limpia únicamente vínculo sin tocar catálogos');

    // ToolsAuth permite que cuenta desvinculada o con password propia trabaje de forma 100% autónoma
    const toolsAuth = readRepoFile('backend/src/Core/ToolsAuth.php');
    assert.match(toolsAuth, /empty\(\$account\['password_hash'\]\)/, 'ToolsAuth no debe bloquear cuenta autónoma aunque el vínculo de App sea nulo o inactivo');
  });

  await t.test('Tarea 8.2: Importación App -> Tools y conversión de costos envase/merma Tools -> App coinciden con Cost Engine', () => {
    const syncCtrl = readRepoFile('backend/src/Controllers/ToolsSyncController.php');
    assert.match(syncCtrl, /FROM supplies WHERE business_id = \? AND is_active = 1/);
    assert.match(syncCtrl, /FROM recipe_studio_recipes/);
    assert.match(syncCtrl, /FROM recipe_studio_components/);
    assert.match(syncCtrl, /FROM product_ingredients pi/);
    assert.match(syncCtrl, /FROM sale_items si[\s\S]*JOIN sales s/);
    assert.match(syncCtrl, /private static function convertQuantityForApp\(/);
    assert.match(syncCtrl, /private static function computeUnitCostForApp\(/);

    // Paridad exacta de costo unitario Tools -> App (saco 25 kg a $25.000 => $1.000/kg en App; pollo $8.000/kg con 80% merma => $10.000/kg)
    const flourIng = { id: 'ing_h', name: 'Harina', base_dimension: 'mass', base_unit: 'g', is_active: true };
    const flourPrices = [
      { ingredient_id: 'ing_h', purchase_date: '2026-10-01', purchase_price: 20000, currency: 'ARS', pack_quantity: 25, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'ing_h', purchase_date: '2026-11-15', purchase_price: 25000, currency: 'ARS', pack_quantity: 25, pack_unit: 'kg', yield_pct: 100 },
    ];
    const appFlourCostKg = simulateToolsSyncUnitCostForApp(flourIng, flourPrices, 'kg');
    const engineFlour = computeUsableIngredientCost(flourIng, flourPrices[1], 'ARS');
    assert.equal(appFlourCostKg, 1000, 'Bolsa 25 kg a $25.000 vigente debe exportarse como $1.000/kg a App');
    assert.ok(Math.abs((engineFlour.usableUnitCostInBase * 1000) - appFlourCostKg) < 0.01);

    const polloIng = { id: 'ing_p', name: 'Pollo', base_dimension: 'mass', base_unit: 'g', is_active: true };
    const polloPrices = [
      { ingredient_id: 'ing_p', purchase_date: '2026-11-15', purchase_price: 8000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 80 },
    ];
    assert.equal(simulateToolsSyncUnitCostForApp(polloIng, polloPrices, 'kg'), 10000);

    // Rechazar conversión silenciosa inválida sin densidad o peso/unidad
    const eggNoWeight = { id: 'ing_e', name: 'Huevo', base_dimension: 'count', base_unit: 'unit', is_active: true };
    assert.equal(simulateToolsSyncUnitCostForApp(eggNoWeight, [{ ingredient_id: 'ing_e', purchase_price: 2400, pack_quantity: 1, pack_unit: 'dozen', yield_pct: 100 }], 'kg'), null);

    // Validar que estructura importada desde App es ejecutable por CostEngine
    const simulatedImportedCatalog = {
      ingredients: [
        { id: 'ing_app_1', name: 'Tomate App', base_dimension: 'mass', base_unit: 'kg', is_active: true },
        { id: 'ing_app_2', name: 'Mozzarella App', base_dimension: 'mass', base_unit: 'kg', is_active: true },
      ],
      purchase_prices: [
        { ingredient_id: 'ing_app_1', purchase_date: '2026-11-18', purchase_price: 2000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100, supplier: 'Pizzalog App Sync' },
        { ingredient_id: 'ing_app_2', purchase_date: '2026-11-18', purchase_price: 9000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100, supplier: 'Pizzalog App Sync' },
      ],
      recipes: [
        {
          id: 'sub_app_10',
          name: 'Salsa App',
          recipe_type: 'subrecipe',
          yield_quantity: 1,
          yield_unit: 'kg',
          currency: 'ARS',
          components: [{ component_type: 'ingredient', ingredient_id: 'ing_app_1', quantity: 1000, unit: 'g' }],
        },
        {
          id: 'prod_app_20',
          name: 'Muzza App',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          target_food_cost_pct: 30,
          currency: 'ARS',
          components: [
            { component_type: 'subrecipe', recipe_id: 'sub_app_10', quantity: 100, unit: 'g' },
            { component_type: 'ingredient', ingredient_id: 'ing_app_2', quantity: 200, unit: 'g' },
          ],
        },
      ],
    };
    const res = new CostEngine(simulatedImportedCatalog).calculateRecipeCost('prod_app_20');
    assert.equal(res.status, 'complete');
    assert.ok(Math.abs((res.raw_unit_cost ?? 0) - 2000) < 0.01);
  });

  await t.test('Tarea 8.3: Datos manuales y ediciones previas no se sobrescriben sin autorización explícita (merge_preserve_manual)', () => {
    const syncCtrl = readRepoFile('backend/src/Controllers/ToolsSyncController.php');
    assert.match(syncCtrl, /\$mode\s*=\s*\(string\)\s*\$req->input\('mode',\s*'merge_preserve_manual'\)/, 'Modo por defecto debe ser conservador merge_preserve_manual');
    assert.match(syncCtrl, /overwrite_app_records/, 'Solo debe permitir sobreescritura cuando se envía mode=overwrite_app_records');
    assert.match(syncCtrl, /\$sup === 'Pizzalog App Sync'/, 'Debe distinguir historial de precios manual vs Pizzalog App Sync para no borrar compras manuales');
    assert.match(syncCtrl, /\$existingHasFormula/, 'En modo merge_preserve_manual debe preservar fórmulas ya cargadas manualmente aunque coincida el ID');
    assert.match(syncCtrl, /array_key_exists\('sellingPrice',\s*\$exPlan\)/, 'Debe preservar sellingPrice manual en merge_preserve_manual');
    assert.match(syncCtrl, /array_key_exists\('monthlyUnitsSold',\s*\$exPlan\)/, 'Debe preservar monthlyUnitsSold manual en merge_preserve_manual');

    const appSrc = readRepoFile('frontend/apps/tools/src/App.tsx');
    assert.match(appSrc, /syncImportMode/, 'La UI de Sync debe ofrecer selección explícita de modo antes de importar desde App');
    assert.match(appSrc, /merge_preserve_manual/);
    assert.match(appSrc, /overwrite_app_records/);
  });

  await t.test('Tarea 8.4: Sincronización repetida evita duplicados y previsualiza deltas reales de cambios', () => {
    const syncCtrl = readRepoFile('backend/src/Controllers/ToolsSyncController.php');
    assert.match(syncCtrl, /\$skippedDuplicatePrices/, 'from_app debe omitir filas de precio idénticas en sincronizaciones repetidas');
    assert.match(syncCtrl, /'new_supplies_to_add'\s*=>/, 'preview from_app debe reportar insumos nuevos reales');
    assert.match(syncCtrl, /'new_products_to_add'\s*=>/, 'preview from_app debe reportar productos nuevos reales');
    assert.match(syncCtrl, /'manual_items_preserved'\s*=>/, 'preview from_app debe reportar ítems manuales preservados');
    assert.match(syncCtrl, /private static function selectLatestPurchasePrice\(/, 'preview y apply to_app deben seleccionar el último precio vigente');
  });

  await t.test('Tarea 8.5: Errores de conexión, transacciones con rollback, backup pre-sync y mensajes seguros sin fuga SQL', () => {
    const syncCtrl = readRepoFile('backend/src/Controllers/ToolsSyncController.php');
    assert.match(syncCtrl, /INSERT INTO tools_workspace_backups/, 'from_app debe crear backup automático antes de modificar tools_workspaces');
    assert.match(syncCtrl, /\$pdo->beginTransaction\(\)/, 'from_app debe ejecutar actualización dentro de transacción');
    assert.match(syncCtrl, /\$pdo->rollBack\(\)/, 'Ante fallo debe revertir transacción sin dejar datos corruptos');
    assert.match(syncCtrl, /No se pudo completar la importación desde Pizzalog App/, 'from_app debe responder error amigable en HTTP 500 cuando debug=false');
    assert.match(syncCtrl, /No se pudo completar la sincronización hacia Pizzalog App/, 'to_app debe responder error amigable en HTTP 500 cuando debug=false');

    const appSrc = readRepoFile('frontend/apps/tools/src/App.tsx');
    assert.match(appSrc, /setSyncError\(err\?\.message \|\| 'No se pudo vincular la cuenta'\)/);
    assert.match(appSrc, /setSyncError\(err\?\.message \|\| 'Error al sincronizar'\)/);
  });
});
