import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as costEnginePkg from '../dist/index.js';
import * as priceListPkg from '../../price-list/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

function loadToolsTsModule(relPathFromToolsSrc, cache = new Map()) {
  const fullPath = path.resolve(REPO_ROOT, 'frontend/apps/tools/src', relPathFromToolsSrc);
  if (cache.has(fullPath)) return cache.get(fullPath);

  const source = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  const moduleObj = { exports: {} };
  cache.set(fullPath, moduleObj.exports);

  const customRequire = (id) => {
    if (id === '@pizzalog/cost-engine') return costEnginePkg;
    if (id === '@pizzalog/price-list') return priceListPkg;
    if (id.startsWith('./')) {
      const targetRel = id.endsWith('.ts') ? id : `${id}.ts`;
      return loadToolsTsModule(path.join(path.dirname(relPathFromToolsSrc), targetRel), cache);
    }
    throw new Error(`Unsupported require in test loader: ${id}`);
  };

  const fn = new Function('exports', 'require', 'module', transpiled);
  fn(moduleObj.exports, customRequire, moduleObj);
  cache.set(fullPath, moduleObj.exports);
  return moduleObj.exports;
}

function readToolsFile(relPath) {
  return fs.readFileSync(path.resolve(REPO_ROOT, relPath), 'utf8');
}

const { createEmptyWorkspace, createInitialDemoWorkspace, normalizeWorkspace, isDemoWorkspace } = loadToolsTsModule('demoData.ts');
const { applyImportMappings } = loadToolsTsModule('importNormalization.ts');
const {
  CostEngine,
  calculatePricingScenario,
  computeUsableIngredientCost,
  createCostSnapshot,
  decomposeRecipeCategoryCosts,
  generateProfitKitV2WorkbookBytes,
  selectEffectivePurchasePrice,
  todayLocalDateString,
  toLocalIsoTimestamp,
} = costEnginePkg;

test('Bloque 5 (Tareas 5.1 a 5.12): Recorrido funcional completo desde cero, experiencia guiada, móvil y manejo seguro de errores', async (t) => {
  await t.test('Tarea 5.1 y 5.12: Alta desde cero arranca limpia y permite onboarding guiado o modo demo con limpieza 1-clic', () => {
    const emptyWs = createEmptyWorkspace('es-AR', 'ARS');
    assert.equal(emptyWs.catalog.ingredients.length, 0);
    assert.equal(emptyWs.catalog.recipes.length, 0);
    assert.equal(emptyWs.operatingExpenses.length, 0);
    assert.equal(emptyWs.snapshots.length, 0);
    assert.equal(emptyWs.unitSystem, 'metric');
    assert.equal(isDemoWorkspace(emptyWs), false);

    const demoWs = createInitialDemoWorkspace('es-AR', 'ARS');
    assert.equal(isDemoWorkspace(demoWs), true);
    assert.ok(demoWs.catalog.ingredients.length >= 6);
    assert.ok(demoWs.catalog.recipes.some((r) => r.recipe_type === 'product'));

    const normalizedUs = normalizeWorkspace({ ...emptyWs, unitSystem: 'us_customary' });
    assert.equal(normalizedUs.unitSystem, 'us_customary');

    const appTsx = readToolsFile('frontend/apps/tools/src/App.tsx');
    assert.match(appTsx, /emptyOnboardingTitle/, 'App debe renderizar tarjeta de onboarding cuando el catálogo está vacío');
    assert.match(appTsx, /stepper-grid/, 'App debe incluir stepper guiado de 6 pasos');
    assert.match(appTsx, /demoBannerClearBtn/, 'App debe incluir acción para limpiar datos demo en 1 clic');
    assert.match(appTsx, /ContextualHelpModal/, 'App debe ofrecer ayuda contextual');
  });

  await t.test('Tareas 5.2 y 5.3: Insumos con merma, peso por unidad, detección INCOMPLETO y precios históricos sin sobrescribir snapshots', () => {
    const harina = { id: 'ing_h', name: 'Harina 0000', base_dimension: 'mass', base_unit: 'g', is_active: true };
    const huevo = { id: 'ing_egg', name: 'Huevo Fresco', base_dimension: 'count', base_unit: 'unit', unit_weight_g: 55, is_active: true };
    const muzza = { id: 'ing_m', name: 'Mozzarella', base_dimension: 'mass', base_unit: 'g', is_active: true };
    const pollo = { id: 'ing_pollo', name: 'Pollo', base_dimension: 'mass', base_unit: 'g', is_active: true };

    // Faltante de precio nunca debe dar costo 0 silencioso:
    const missing = computeUsableIngredientCost(harina, undefined, 'ARS');
    assert.equal(missing.status, 'missing');
    assert.equal(missing.usableUnitCostInBase, null);

    // Merma del 80% sobre compra de 1 kg a $8.000 => $10/g utilizable (= $10.000/kg utilizable):
    const pricesT1 = [
      { ingredient_id: 'ing_h', purchase_date: '2026-10-01', purchase_price: 25000, currency: 'ARS', pack_quantity: 25, pack_unit: 'kg', yield_pct: 100, supplier: 'Molino A' },
      { ingredient_id: 'ing_egg', purchase_date: '2026-10-01', purchase_price: 2400, currency: 'ARS', pack_quantity: 1, pack_unit: 'dozen', yield_pct: 100, supplier: 'Granja' },
      { ingredient_id: 'ing_m', purchase_date: '2026-10-01', purchase_price: 8000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100, supplier: 'Tambo' },
      { ingredient_id: 'ing_pollo', purchase_date: '2026-10-01', purchase_price: 8000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 80, supplier: 'Avícola' },
    ];

    const polloCalc = computeUsableIngredientCost(pollo, selectEffectivePurchasePrice('ing_pollo', pricesT1), 'ARS');
    assert.equal(polloCalc.status, 'complete');
    assert.ok(Math.abs((polloCalc.usableUnitCostInBase ?? 0) - 10) < 0.0001, '1kg/$8000 con 80% rendimiento = $10/g');

    // Receta usa huevo por gramos usando unit_weight_g (55g = $200/unit):
    const catalogT1 = {
      ingredients: [harina, huevo, muzza, pollo],
      purchase_prices: pricesT1,
      recipes: [
        {
          id: 'rec_pizza_test',
          name: 'Pizza Pollo Especial',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          target_food_cost_pct: 30,
          currency: 'ARS',
          components: [
            { component_type: 'ingredient', ingredient_id: 'ing_h', quantity: 250, unit: 'g' }, // 250
            { component_type: 'ingredient', ingredient_id: 'ing_egg', quantity: 55, unit: 'g' }, // 1 unidad = 200
            { component_type: 'ingredient', ingredient_id: 'ing_m', quantity: 200, unit: 'g' }, // 1600
            { component_type: 'ingredient', ingredient_id: 'ing_pollo', quantity: 100, unit: 'g' }, // 1000
          ],
        },
      ],
    };

    const resT1 = new CostEngine(catalogT1).calculateRecipeCost('rec_pizza_test');
    assert.equal(resT1.status, 'complete');
    assert.ok(Math.abs((resT1.raw_unit_cost ?? 0) - 3050) < 0.01);

    const pricingOptionsT1 = {
      target_food_cost_pct: 30,
      rounding_increment: 500,
      rounding_mode: 'ceil',
    };
    const snapT1 = createCostSnapshot(catalogT1, 'rec_pizza_test', pricingOptionsT1, '2026-10-01T12:00:00Z');

    // Nuevo precio histórico posterior en Mozzarella ($12.000/kg) actualiza hoy pero preserva snapT1 inmutable:
    const pricesT2 = [
      ...pricesT1,
      { ingredient_id: 'ing_m', purchase_date: '2026-11-15', purchase_price: 12000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100, supplier: 'Tambo Nuevo' },
    ];
    const effectiveMuzza = selectEffectivePurchasePrice('ing_m', pricesT2);
    assert.equal(effectiveMuzza?.purchase_price, 12000);
    const resT2 = new CostEngine({ ...catalogT1, purchase_prices: pricesT2 }).calculateRecipeCost('rec_pizza_test');
    assert.ok(Math.abs((resT2.raw_unit_cost ?? 0) - 3850) < 0.01, 'Suba de Mozzarella de $8k a $12k (+200g) sube costo en +$800');
    assert.equal(snapT1.cost_result.raw_unit_cost, resT1.raw_unit_cost, 'Snapshot histórico debe permanecer inmutable');

    const historyModal = readToolsFile('frontend/apps/tools/src/PriceHistoryModal.tsx');
    assert.match(historyModal, /export function PriceHistoryModal/);
    assert.match(historyModal, /export function ExchangeRatesModal/);
  });

  await t.test('Tareas 5.4 a 5.9: Flujo subreceta + panadero -> receta final -> precio -> ventas -> gastos -> break-even -> simulador por ingrediente', () => {
    const ingredients = [
      { id: 'harina', name: 'Harina 000', base_dimension: 'mass', base_unit: 'g', is_active: true },
      { id: 'agua', name: 'Agua', base_dimension: 'volume', base_unit: 'ml', density_g_per_ml: 1, is_free: true, is_active: true },
      { id: 'levadura', name: 'Levadura', base_dimension: 'mass', base_unit: 'g', is_active: true },
      { id: 'sal', name: 'Sal', base_dimension: 'mass', base_unit: 'g', is_active: true },
      { id: 'tomate', name: 'Tomate Triturado', base_dimension: 'mass', base_unit: 'g', is_active: true },
      { id: 'muzza', name: 'Queso Mozzarella', base_dimension: 'mass', base_unit: 'g', is_active: true },
    ];
    const purchase_prices = [
      { ingredient_id: 'harina', purchase_price: 25000, currency: 'ARS', pack_quantity: 25, pack_unit: 'kg', yield_pct: 100 }, // $1/g
      { ingredient_id: 'levadura', purchase_price: 5000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 }, // $5/g
      { ingredient_id: 'sal', purchase_price: 1000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 }, // $1/g
      { ingredient_id: 'tomate', purchase_price: 2000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 }, // $2/g
      { ingredient_id: 'muzza', purchase_price: 10000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 }, // $10/g
    ];
    const recipes = [
      {
        id: 'masa',
        name: 'Masa 65%',
        recipe_type: 'subrecipe',
        yield_quantity: 1680,
        yield_unit: 'g',
        currency: 'ARS',
        bakers_dough: {
          total_flour_g: 1000,
          hydration_pct: 65,
          salt_pct: 2,
          direct_yeast_pct: 1,
          flours: [{ ingredient_id: 'harina', share_pct: 100 }],
          water_ingredient_id: 'agua',
          yeast_ingredient_id: 'levadura',
          salt_ingredient_id: 'sal',
          yield_basis: 'measured_yield',
          measured_yield_g: 1680,
        },
      },
      {
        id: 'salsa',
        name: 'Salsa Pizza',
        recipe_type: 'subrecipe',
        yield_quantity: 1000,
        yield_unit: 'g',
        currency: 'ARS',
        components: [{ component_type: 'ingredient', ingredient_id: 'tomate', quantity: 1000, unit: 'g' }],
      },
      {
        id: 'muzzarella_pizza',
        name: 'Pizza Mozzarella Real',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        target_food_cost_pct: 30,
        currency: 'ARS',
        components: [
          { component_type: 'subrecipe', recipe_id: 'masa', quantity: 280, unit: 'g' }, // 1/6 de masa batch ($1070 -> $178.33)
          { component_type: 'subrecipe', recipe_id: 'salsa', quantity: 100, unit: 'g' }, // $200
          { component_type: 'ingredient', ingredient_id: 'muzza', quantity: 200, unit: 'g' }, // $2000
        ],
      },
    ];

    const catalog = { ingredients, purchase_prices, recipes };
    const engine = new CostEngine(catalog);
    const pizzaCost = engine.calculateRecipeCost('muzzarella_pizza');
    assert.equal(pizzaCost.status, 'complete');
    // Masa total cost: 1000*1 + 10*5 + 20*1 = 1070 -> 280/1680 = 1/6 => 178.3333; Salsa = 200; Muzza = 2000 => 2378.3333
    assert.ok(Math.abs((pizzaCost.raw_unit_cost ?? 0) - 2378.3333) < 0.05);

    const pricing = calculatePricingScenario({
      unit_cost: pizzaCost.raw_unit_cost,
      status: pizzaCost.status,
      currency: 'ARS',
      target_food_cost_pct: 30,
      rounding_increment: 500,
      rounding_mode: 'ceil',
    });
    // 2378.3333 / 0.3 = 7927.77 -> ceil(500) = 8000
    assert.equal(pricing.raw_suggested_price, 8000);

    // Simulador por categoría real de insumo (Tarea 5.9): +10% en Harinas/Levaduras afecta SOLO ese rubro dentro de la masa (($1000+$50)/6 = $175 -> +$17.50), no +$237.83
    const breakdown = decomposeRecipeCategoryCosts(catalog, 'muzzarella_pizza', 'ARS');
    assert.ok(Math.abs(breakdown.flourCost - 175) < 0.1, 'Harina + Levadura dentro de masa = $175');
    assert.ok(Math.abs(breakdown.dairyCost - 2000) < 0.1, 'Mozzarella en dairy = $2000');
    const simulatedCostFlourUp10 = pizzaCost.raw_unit_cost + breakdown.flourCost * 0.10;
    assert.ok(Math.abs(simulatedCostFlourUp10 - (pizzaCost.raw_unit_cost + 17.5)) < 0.1);

    // Ventas importadas + Gastos operativos -> Break-Even (Tareas 5.7 y 5.8):
    const emptyWs = createEmptyWorkspace('es-AR', 'ARS');
    emptyWs.catalog = catalog;
    const mapped = applyImportMappings(
      emptyWs,
      [
        {
          name: 'Ventas',
          rows: [
            ['Producto', 'Unidades', 'Periodo', 'Canal', 'Total'],
            ['Pizza Mozzarella Real', '200', todayLocalDateString(), 'Salón', '1600000'],
          ],
        },
        {
          name: 'Gastos',
          rows: [
            ['Concepto', 'Categoria', 'Periodo', 'Importe'],
            ['Alquiler', 'rent', 'monthly', '500000'],
          ],
        },
      ],
      [
        {
          sheet_index: 0,
          name: 'Ventas',
          kind: 'sales',
          confidence: 1,
          header_row_index: 0,
          row_count: 1,
          headers: ['Producto', 'Unidades', 'Periodo', 'Canal', 'Total'],
          columns: { product_name: 0, quantity: 1, period_start: 2, channel: 3, gross_revenue: 4 },
          warnings: [],
        },
        {
          sheet_index: 1,
          name: 'Gastos',
          kind: 'operating_expenses',
          confidence: 1,
          header_row_index: 0,
          row_count: 1,
          headers: ['Concepto', 'Categoria', 'Periodo', 'Importe'],
          columns: { expense_name: 0, expense_category: 1, expense_period: 2, expense_amount: 3 },
          warnings: [],
        },
      ]
    );
    assert.equal(mapped.workspace.salesHistory.length, 1);
    assert.equal(mapped.workspace.operatingExpenses.length, 1);
    const totalRevenue = 200 * 8000;
    const totalCogs = 200 * pizzaCost.raw_unit_cost;
    const contribMargin = totalRevenue - totalCogs;
    const weightedMarginRatio = contribMargin / totalRevenue;
    const breakEvenRev = 500000 / weightedMarginRatio;
    assert.ok(breakEvenRev > 500000 && breakEvenRev < totalRevenue, 'Break-even coherente menor a la facturación positiva');

    // Excel v2 exporta también con este catálogo completo sin errores:
    const xlsxBytes = generateProfitKitV2WorkbookBytes({
      businessName: 'Pizzería E2E Test',
      currency: 'ARS',
      locale: 'es-AR',
      unitSystem: 'metric',
      defaultTargetFoodCostPct: 30,
      defaultRoundingIncrement: 500,
      defaultPackagingCost: 0,
      defaultChannelFeePct: 0,
      catalog,
      operatingExpenses: mapped.workspace.operatingExpenses,
      salesHistory: mapped.workspace.salesHistory,
      productSalesMap: mapped.workspace.productSalesMap,
    });
    assert.ok(xlsxBytes.byteLength > 20000, 'Excel v2 debe generarse completo');
  });

  await t.test('Tareas 5.10 y 5.11: Estilos responsivos móviles/escritorio y manejo de errores sin pantalla blanca ni fugas técnicas', () => {
    const css = readToolsFile('frontend/apps/tools/src/styles.css');
    assert.match(css, /@media\s*\(max-width:\s*768px\)/, 'styles.css debe incluir breakpoint móvil 768px');
    assert.match(css, /@media\s*\(max-width:\s*480px\)/, 'styles.css debe incluir breakpoint móvil compacto 480px');
    assert.match(css, /\.kpi-card/, 'styles.css debe definir .kpi-card usado en vistas estratégicas');
    assert.match(css, /\.empty-state/, 'styles.css debe definir .empty-state');
    assert.match(css, /\.btn--secondary/, 'styles.css debe definir .btn--secondary');
    assert.match(css, /\.row-actions/, 'styles.css debe definir .row-actions');
    assert.match(css, /\.report-kpi-grid/, 'styles.css debe definir .report-kpi-grid responsivo');

    const reportModal = readToolsFile('frontend/apps/tools/src/ExecutiveReportModal.tsx');
    assert.match(reportModal, /report-kpi-grid/, 'ExecutiveReportModal debe usar report-kpi-grid responsivo en lugar de repeat(4, 1fr) fijo');
    assert.doesNotMatch(reportModal, /repeat\(4,\s*1fr\)/, 'ExecutiveReportModal no debe usar 4 columnas fijas sin media query');

    const wsCtrl = readToolsFile('backend/src/Controllers/ToolsWorkspaceController.php');
    assert.match(wsCtrl, /error_log\(/, 'ToolsWorkspaceController debe registrar el detalle técnico en error_log');
    assert.match(wsCtrl, /No se pudo guardar el espacio de trabajo/, 'ToolsWorkspaceController debe devolver mensaje amigable al cliente en HTTP 500');

    const authGate = readToolsFile('frontend/apps/tools/src/ToolsAuthGate.tsx');
    assert.match(authGate, /class ToolsErrorBoundary/, 'ToolsAuthGate debe definir ErrorBoundary global con recuperación');
    assert.match(authGate, /recoveryDownload/, 'ErrorBoundary debe permitir descargar respaldo JSON ante fallo');
    assert.match(authGate, /function parseToolsJsonResponse/, 'ToolsAuthGate debe validar respuestas HTML vs JSON antes de hacer JSON.parse');

    const appTsx = readToolsFile('frontend/apps/tools/src/App.tsx');
    assert.match(appTsx, /parseToolsJsonResponse</, 'App debe utilizar parseToolsJsonResponse en llamadas HTTP');
    assert.match(appTsx, /t\.ingEmptyState/, 'App debe mostrar estado vacío en Insumos');
    assert.match(appTsx, /t\.subEmptyState/, 'App debe mostrar estado vacío en Subrecetas');
    assert.match(appTsx, /t\.recEmptyState/, 'App debe mostrar estado vacío en Recetas');
    assert.match(appTsx, /t\.expEmptyState/, 'App debe mostrar estado vacío en Gastos');
    assert.match(appTsx, /t\.salesEmptyState/, 'App debe mostrar estado vacío en Ventas');

    // Timestamps locales nunca invalidan ISO:
    const tsNow = toLocalIsoTimestamp(new Date(2026, 10, 18, 23, 55, 0));
    assert.match(tsNow, /^2026-11-18T23:55:00(\.\d{3})?[+-]\d{2}:\d{2}$/);
  });
});
