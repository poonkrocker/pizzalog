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

/**
 * Carga y transpila en memoria un módulo TypeScript de frontend/apps/tools/src/
 * inyectando @pizzalog/cost-engine y @pizzalog/price-list reales.
 */
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

const { createEmptyWorkspace, createInitialDemoWorkspace, normalizeWorkspace } = loadToolsTsModule('demoData.ts');
const { applyImportMappings, findUnmatchedComponents } = loadToolsTsModule('importNormalization.ts');
const { CostEngine, calculatePricingScenario } = costEnginePkg;
const {
  detectPriceListColumns,
  extractPriceListItems,
  matchPriceList,
  rematch,
  summarizeMatches,
} = priceListPkg;

test('Bloque 4 (Tareas 4.1 a 4.7): Auditoría y validación del importador inteligente, listas de precios, duplicados, parciales, vista previa y exportación/reimportación', async (t) => {
  await t.test('Tareas 4.1 y 4.2: Importación multi-hoja real (Insumos + Precios + Subrecetas y Productos en la misma hoja + Gastos + Ventas por canal)', () => {
    const emptyWs = createEmptyWorkspace('es-AR', 'ARS');

    const sheets = [
      {
        name: '01_Insumos',
        rows: [
          ['Nombre del Insumo', 'Unidad Base', 'Dimensión', 'Precio de Compra', 'Moneda', 'Cant. Envase', 'Unidad Envase', 'Rendimiento %', 'Densidad (g/ml)', 'Peso Unidad (g)', 'Proveedor'],
          ['Harina 0000', 'g', 'mass', '$ 25.000,00', 'ARS', '25', 'KG', '100', '', '', 'Molino Cañuelas'],
          ['Tomate Triturado', 'g', 'mass', '8.000', 'ARS', '8', 'kg', '100', '', '', 'La Huerta'],
          ['Aceite de Oliva', 'ml', 'volume', '10,000.00', 'ARS', '5', 'lt', '100', '0.92', '', 'Olivares'],
          ['Queso Mozzarella', 'g', 'mass', '2000', 'ARS', '500', 'grs', '100', '', '', 'Lácteos Sur'],
          ['Pollo Fresco', 'g', 'mass', '1.000', 'ARS', '1', 'Kilo', '90', '', '', 'Avícola'],
          ['Huevo Fresco', 'unit', 'count', '2.400', 'ARS', '1', 'docena', '100', '', '55', 'Granja'],
        ],
      },
      {
        name: '02_Recetas',
        rows: [
          ['Nombre de Receta', 'Tipo de Receta', 'Rendimiento', 'Unidad de Rendimiento', 'Componente', 'Cantidad', 'Unidad Componente'],
          // Producto final listado ANTES que su subreceta para comprobar que el importador ordena y resuelve subrecetas de la misma hoja:
          ['Pizza Napolitana Real', 'Producto', '1', 'unidad', 'Salsa Casa Importada', '100', 'gr'],
          ['Pizza Napolitana Real', 'Producto', '1', 'unidad', 'Queso Mozzarella', '200', 'g'],
          ['Pizza Napolitana Real', 'Producto', '1', 'unidad', 'Harina 0000', '250', 'g'],
          // Subreceta definida en la misma hoja:
          ['Salsa Casa Importada', 'Subreceta', '1000', 'g', 'Tomate Triturado', '800', 'g'],
          ['Salsa Casa Importada', 'Subreceta', '1000', 'g', 'Aceite de Oliva', '100', 'ml'],
        ],
      },
      {
        name: '03_Gastos',
        rows: [
          ['Concepto', 'Categoría', 'Frecuencia', 'Importe'],
          ['Alquiler Local Central', 'Alquiler', 'Mensual', '$ 850.000'],
          ['Equipo de Cocina', 'Sueldos', 'Mensual', '1.800.000'],
          ['Limpieza', 'Otros', 'Semanal', '30.000'],
        ],
      },
      {
        name: '04_Ventas',
        rows: [
          ['Producto', 'Unidades Vendidas', 'Inicio Período', 'Fin Período', 'Canal', 'Venta Bruta', 'Venta Neta', 'Origen'],
          ['Pizza Napolitana Real', '400', '01/11/2026', '30/11/2026', 'Salón', '2000000', '2000000', 'TPV'],
          ['Pizza Napolitana Real', '250', '01/11/2026', '30/11/2026', 'PedidosYa', '1250000', '1000000', 'App'],
        ],
      },
    ];

    const mappings = [
      {
        sheet_index: 0,
        name: '01_Insumos',
        kind: 'ingredients',
        header_row_index: 0,
        headers: sheets[0].rows[0],
        columns: {
          name: 0, base_unit: 1, base_dimension: 2, purchase_price: 3, currency: 4,
          pack_quantity: 5, pack_unit: 6, yield_pct: 7, density_g_per_ml: 8, unit_weight_g: 9, supplier: 10,
        },
        confidence: 0.95,
        warnings: [],
        row_count: 6,
      },
      {
        sheet_index: 1,
        name: '02_Recetas',
        kind: 'recipes',
        header_row_index: 0,
        headers: sheets[1].rows[0],
        columns: {
          recipe_name: 0, recipe_type: 1, yield_quantity: 2, yield_unit: 3,
          component_name: 4, component_quantity: 5, component_unit: 6,
        },
        confidence: 0.95,
        warnings: [],
        row_count: 5,
      },
      {
        sheet_index: 2,
        name: '03_Gastos',
        kind: 'operating_expenses',
        header_row_index: 0,
        headers: sheets[2].rows[0],
        columns: { expense_name: 0, expense_category: 1, expense_period: 2, expense_amount: 3 },
        confidence: 0.95,
        warnings: [],
        row_count: 3,
      },
      {
        sheet_index: 3,
        name: '04_Ventas',
        kind: 'sales',
        header_row_index: 0,
        headers: sheets[3].rows[0],
        columns: {
          product_name: 0, quantity: 1, period_start: 2, period_end: 3,
          channel: 4, gross_revenue: 5, net_revenue: 6, source: 7,
        },
        confidence: 0.95,
        warnings: [],
        row_count: 2,
      },
    ];

    // Verificar que findUnmatchedComponents no reporte falsos no-vinculados cuando los insumos y subrecetas vienen en el mismo archivo:
    const unmatched = findUnmatchedComponents(emptyWs, sheets, mappings);
    assert.deepEqual(unmatched, [], 'Ningún componente debe quedar sin vincular cuando los insumos y subrecetas están en el mismo archivo');

    const applied = applyImportMappings(emptyWs, sheets, mappings);
    assert.equal(applied.counts.ingredients, 6);
    assert.equal(applied.counts.prices, 6);
    assert.equal(applied.counts.recipes, 2, 'Debe importar tanto la subreceta como el producto final');
    assert.equal(applied.counts.expenses, 3);
    assert.equal(applied.counts.sales, 2);

    // Verificar cálculo exacto de la receta importada en CostEngine:
    // Salsa Casa: 800g tomate ($800) + 100ml aceite ($200) = $1000 / 1000g => $1/g
    // Pizza Napolitana Real: 100g Salsa ($100) + 200g Mozzarella ($800) + 250g Harina ($250) = $1150
    const engine = new CostEngine(applied.workspace.catalog);
    const pizza = applied.workspace.catalog.recipes.find((r) => r.name === 'Pizza Napolitana Real');
    assert.ok(pizza);
    const costRes = engine.calculateRecipeCost(pizza.id);
    assert.equal(costRes.status, 'complete');
    assert.equal(costRes.raw_unit_cost, 1150);

    // Verificar que las unidades vendidas mensuales del período 2026-11 (400 + 250 = 650) se asignaron al producto:
    assert.equal(applied.workspace.productSalesMap[pizza.id]?.monthlyUnitsSold, 650);
  });

  await t.test('Tareas 4.3 y 4.4: Interpretación de formatos numéricos/unidades y detección de duplicados y alias (equivalences)', () => {
    const baseWs = createEmptyWorkspace('es-AR', 'ARS');
    baseWs.catalog.ingredients.push({
      id: 'ing_mozz_existente',
      name: 'Queso Mozzarella',
      base_dimension: 'mass',
      base_unit: 'g',
      is_active: true,
    });

    const sheets = [
      {
        name: 'Precios_Proveedor',
        rows: [
          ['Insumo', 'Unidad Base', 'Precio Compra', 'Cant Envase', 'Unidad Envase', 'Fecha', 'Proveedor'],
          // Variación de mayúsculas/acentos sobre insumo existente ("queso mozzarella"): no debe duplicar el ingrediente
          ['  QUESO   MOZZARELLA ', 'gr', '$ 22.000,00', '5', 'Kilos', '15/11/2026', 'Lácteos Sur'],
          // Mismo insumo, misma fecha y mismo proveedor con precio corregido: debe actualizar en lugar de duplicar el registro de precio
          ['Queso Mozzarella', 'g', '$ 24.000,00', '5', 'kg', '2026-11-15', 'Lacteos Sur'],
        ],
      },
      {
        name: 'Receta_Con_Alias',
        rows: [
          ['Receta', 'Tipo', 'Rendimiento', 'Unidad Rend', 'Ingrediente', 'Cantidad', 'Unidad'],
          ['Fugazzeta', 'Producto', '1', 'u', 'Muzza Barraza Especial', '300', 'grs'],
        ],
      },
    ];

    const mappings = [
      {
        sheet_index: 0,
        name: 'Precios_Proveedor',
        kind: 'ingredients',
        header_row_index: 0,
        headers: sheets[0].rows[0],
        columns: { name: 0, base_unit: 1, purchase_price: 2, pack_quantity: 3, pack_unit: 4, purchase_date: 5, supplier: 6 },
        confidence: 0.95,
        warnings: [],
        row_count: 2,
      },
      {
        sheet_index: 1,
        name: 'Receta_Con_Alias',
        kind: 'recipes',
        header_row_index: 0,
        headers: sheets[1].rows[0],
        columns: { recipe_name: 0, recipe_type: 1, yield_quantity: 2, yield_unit: 3, component_name: 4, component_quantity: 5, component_unit: 6 },
        confidence: 0.95,
        warnings: [],
        row_count: 1,
      },
    ];

    // Sin equivalencia, "Muzza Barraza Especial" se detecta como no vinculado:
    const unmatchedBefore = findUnmatchedComponents(baseWs, sheets, mappings);
    assert.deepEqual(unmatchedBefore, ['Muzza Barraza Especial']);

    // Con equivalencia asignada por el usuario ("muzza barraza especial" -> "ing_mozz_existente"), vincula sin duplicar:
    const customEq = { 'muzza barraza especial': 'ing_mozz_existente' };
    assert.deepEqual(findUnmatchedComponents(baseWs, sheets, mappings, customEq), []);

    const applied = applyImportMappings(baseWs, sheets, mappings, customEq);
    assert.equal(applied.workspace.catalog.ingredients.length, 1, 'No debe duplicar Queso Mozzarella');
    assert.equal(applied.workspace.catalog.purchase_prices.length, 1, 'Misma fecha y proveedor debe actualizar el precio sin duplicar');
    assert.equal(applied.workspace.catalog.purchase_prices[0].purchase_price, 24000);
    assert.equal(applied.workspace.catalog.recipes.length, 1);

    const eng = new CostEngine(applied.workspace.catalog);
    // $24,000 / 5000g = $4.80/g * 300g = $1440
    assert.equal(eng.calculateRecipeCost(applied.workspace.catalog.recipes[0].id).raw_unit_cost, 1440);
  });

  await t.test('Tarea 4.5: Importaciones parciales (importa filas válidas, crea insumos sin precio como incompletos y reporta advertencias por fila)', () => {
    const emptyWs = createEmptyWorkspace('es-AR', 'ARS');
    const sheets = [
      {
        name: 'Insumos_Mixtos',
        rows: [
          ['Insumo', 'Unidad Base', 'Precio', 'Cant Envase', 'Unidad Envase'],
          ['Harina 0000', 'g', '25000', '25', 'kg'], // Válido con precio
          ['Trufa Negra', 'g', '', '', ''], // Válido sin precio -> debe crear el insumo sin inventar precio $0
          ['Insumo Unidad Inválida', 'pizca', '500', '1', 'pizca'], // Unidad inválida -> se omite con warning
          ['Aceite sin Densidad en Kilos', 'ml', '10000', '5', 'kg'], // Envase en kg para base ml sin densidad -> crea insumo pero rechaza el precio incompatible
        ],
      },
    ];
    const mappings = [
      {
        sheet_index: 0,
        name: 'Insumos_Mixtos',
        kind: 'ingredients',
        header_row_index: 0,
        headers: sheets[0].rows[0],
        columns: { name: 0, base_unit: 1, purchase_price: 2, pack_quantity: 3, pack_unit: 4 },
        confidence: 0.9,
        warnings: [],
        row_count: 4,
      },
    ];

    const res = applyImportMappings(emptyWs, sheets, mappings);
    assert.equal(res.counts.ingredients, 3, 'Debe importar los 3 insumos con unidad base válida (Harina, Trufa, Aceite)');
    assert.equal(res.counts.prices, 1, 'Solo Harina tiene precio y presentación compatible');
    assert.ok(res.warnings.some((w) => w.includes('fila 4') && w.includes('unidad base falta')), 'Advierte fila 4 con unidad inválida');
    assert.ok(res.warnings.some((w) => w.includes('fila 5') && w.includes('incompatible')), 'Advierte fila 5 con envase incompatible sin densidad');
  });

  await t.test('Tarea 4.6: Vista previa de cambios en actualización de lista de precios de proveedor (variación %, revinculación manual y resumen)', () => {
    const rows = [
      ['Proveedor Lácteos y Harinas S.A.', '', ''],
      ['Artículo', 'Presentación', 'Precio Final'],
      ['Harina 0000 Panadera', 'Bolsa x 25 kg', '$ 30.000,00'], // Antes $25,000 ($1/g -> $1.20/g = +20%)
      ['Muzzarella Cilindro', 'Horma x 5 kg', '$ 22.000,00'], // Antes $2,000/500g ($4/g -> $4.40/g = +10%)
      ['Insumo Desconocido XYZ', 'Caja x 10 u', '$ 15.000,00'], // Sin coincidencia
    ];

    const cols = detectPriceListColumns(rows);
    assert.ok(cols);
    assert.equal(cols.header_row_index, 1);

    const items = extractPriceListItems(rows, cols);
    assert.equal(items.length, 3);

    const catalogEntries = [
      { id: 'ing_harina', name: 'Harina 0000 Panadera', unit: 'g', current_price_per_unit: 1.0 },
      { id: 'ing_mozzarella', name: 'Queso Mozzarella', unit: 'g', current_price_per_unit: 4.0 },
      { id: 'ing_caja', name: 'Caja de Pizza', unit: 'u', current_price_per_unit: 1000 },
    ];

    const matches = matchPriceList(items, catalogEntries);
    const summaryBefore = summarizeMatches(matches);
    assert.equal(summaryBefore.total, 3);
    assert.equal(summaryBefore.matched, 2);
    assert.equal(summaryBefore.unmatched, 1);

    // Verificar cálculo exacto de variation_pct en la vista previa antes de aplicar:
    assert.equal(matches[0].target_id, 'ing_harina');
    assert.ok(Math.abs(matches[0].variation_pct - 20) < 1e-6, 'Harina sube +20% ($1.00/g -> $1.20/g)');
    assert.equal(matches[1].target_id, 'ing_mozzarella');
    assert.ok(Math.abs(matches[1].variation_pct - 10) < 1e-6, 'Mozzarella sube +10% ($4.00/g -> $4.40/g)');

    // Revincular manualmente el ítem 3 a 'ing_caja':
    const rematched = rematch(matches[2], catalogEntries, { target_id: 'ing_caja' });
    assert.equal(rematched.target_id, 'ing_caja');
    assert.equal(rematched.new_price_per_unit, 1500);
    assert.ok(Math.abs(rematched.variation_pct - 50) < 1e-6, 'Caja sube +50% ($1000/u -> $1500/u)');
  });

  await t.test('Tarea 4.7: Exportación de un espacio de trabajo en Cuenta A y reimportación íntegra en Cuenta B con paridad matemática 100%', () => {
    const accountAWs = createInitialDemoWorkspace();
    accountAWs.businessName = 'Pizzería Exportada Cuenta A';
    accountAWs.defaultTargetFoodCostPct = 28;
    accountAWs.defaultRoundingIncrement = 250;

    // Exportar JSON desde Cuenta A:
    const exportedJson = JSON.stringify(accountAWs, null, 2);

    // Importar y normalizar en Cuenta B:
    const parsedInB = JSON.parse(exportedJson);
    const accountBWs = normalizeWorkspace(parsedInB);

    const engA = new CostEngine(accountAWs.catalog);
    const engB = new CostEngine(accountBWs.catalog);

    assert.equal(accountBWs.businessName, accountAWs.businessName);
    assert.equal(accountBWs.catalog.ingredients.length, accountAWs.catalog.ingredients.length);
    assert.equal(accountBWs.catalog.recipes.length, accountAWs.catalog.recipes.length);
    assert.equal(accountBWs.operatingExpenses.length, accountAWs.operatingExpenses.length);
    assert.equal(accountBWs.salesHistory.length, accountAWs.salesHistory.length);

    for (const rec of accountAWs.catalog.recipes) {
      const resA = engA.calculateRecipeCost(rec.id);
      const resB = engB.calculateRecipeCost(rec.id);
      assert.equal(resB.status, resA.status, `${rec.id} status idéntico tras reimportación`);
      assert.equal(resB.raw_batch_cost, resA.raw_batch_cost, `${rec.id} batch_cost idéntico tras reimportación`);
      assert.equal(resB.raw_unit_cost, resA.raw_unit_cost, `${rec.id} unit_cost idéntico tras reimportación`);

      const prA = calculatePricingScenario({
        unit_cost: resA.raw_unit_cost,
        status: resA.status,
        currency: accountAWs.currency,
        target_food_cost_pct: accountAWs.defaultTargetFoodCostPct,
        rounding_increment: accountAWs.defaultRoundingIncrement,
      });
      const prB = calculatePricingScenario({
        unit_cost: resB.raw_unit_cost,
        status: resB.status,
        currency: accountBWs.currency,
        target_food_cost_pct: accountBWs.defaultTargetFoodCostPct,
        rounding_increment: accountBWs.defaultRoundingIncrement,
      });
      assert.equal(prB.raw_suggested_price, prA.raw_suggested_price, `${rec.id} suggested_price idéntico en Cuenta B`);
    }
  });
});
