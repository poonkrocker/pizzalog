import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CostEngine,
  calculatePortfolioScenario,
  calculatePricingScenario,
  decomposeRecipeCategoryCosts,
  generateProfitKitV2WorkbookBytes,
} from '../dist/index.js';

const TOLERANCE = 1e-6;

function assertClose(actual, expected, label, tol = TOLERANCE) {
  assert.notEqual(actual, null, `${label}: expected ${expected}, got null`);
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: expected ${expected}, got ${actual} (diff=${Math.abs(actual - expected)})`
  );
}

function extractZipTextEntries(zipBytes) {
  const buf = Buffer.from(zipBytes);
  const entries = {};
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataStart = offset + 30 + nameLen + extraLen;
    const dataEnd = dataStart + compSize;
    entries[name] = buf.subarray(dataStart, dataEnd).toString('utf8');
    offset = dataEnd;
  }
  return entries;
}

/**
 * Extrae un mapa { "A5": { f, v } } desde el XML de una hoja OpenXML.
 */
function parseSheetCells(sheetXml) {
  const cells = {};
  const cellRegex = /<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g;
  let match;
  while ((match = cellRegex.exec(sheetXml)) !== null) {
    const ref = match[1];
    const attrs = match[2];
    const inner = match[3];
    const fMatch = /<f>([\s\S]*?)<\/f>/.exec(inner);
    const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
    const tMatch = /<is><t>([\s\S]*?)<\/t><\/is>/.exec(inner);
    const isStr = attrs.includes('t="str"') || attrs.includes('t="inlineStr"');
    let val = null;
    if (tMatch) {
      val = unescapeXml(tMatch[1]);
    } else if (vMatch) {
      const rawV = unescapeXml(vMatch[1]);
      val = isStr ? rawV : Number(rawV);
    }
    cells[ref] = {
      f: fMatch ? unescapeXml(fMatch[1]) : null,
      v: val,
    };
  }
  return cells;
}

function unescapeXml(str) {
  return String(str ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function buildCrossInterfaceWorkspace() {
  return {
    businessName: 'Pizzería Paridad 4 Interfaces',
    currency: 'ARS',
    locale: 'es-AR',
    unitSystem: 'metric',
    defaultTargetFoodCostPct: 30,
    defaultRoundingIncrement: 500,
    defaultPackagingCost: 350,
    defaultChannelFeePct: 25,
    catalog: {
      ingredients: [
        { id: 'ing_harina', name: 'Harina 0000 Panadera', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'ing_levadura', name: 'Levadura Fresca', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'ing_sal', name: 'Sal Fina', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'ing_agua', name: 'Agua Filtrada', base_dimension: 'volume', base_unit: 'ml', density_g_per_ml: 1, is_free: true, is_active: true },
        { id: 'ing_tomate', name: 'Tomate Triturado Italiano', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'ing_aceite', name: 'Aceite de Oliva Virgen Extra', base_dimension: 'volume', base_unit: 'ml', density_g_per_ml: 0.92, is_active: true },
        { id: 'ing_mozzarella', name: 'Queso Mozzarella', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'ing_pollo', name: 'Pollo Crudo (con merma 10%)', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'ing_jamon', name: 'Jamón Cocido Natural', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'ing_trufa', name: 'Trufa Negra Sin Precio', base_dimension: 'mass', base_unit: 'g', is_active: true },
      ],
      purchase_prices: [
        { ingredient_id: 'ing_harina', purchase_price: 25000, currency: 'ARS', pack_quantity: 25, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'ing_levadura', purchase_price: 5000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'ing_sal', purchase_price: 300, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'ing_tomate', purchase_price: 8000, currency: 'ARS', pack_quantity: 8, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'ing_aceite', purchase_price: 10000, currency: 'ARS', pack_quantity: 5, pack_unit: 'L', yield_pct: 100 },
        { ingredient_id: 'ing_mozzarella', purchase_price: 2000, currency: 'ARS', pack_quantity: 500, pack_unit: 'g', yield_pct: 100 },
        { ingredient_id: 'ing_pollo', purchase_price: 1000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 90 },
        { ingredient_id: 'ing_jamon', purchase_price: 9600, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 96 },
        { ingredient_id: 'ing_trufa', purchase_price: null, currency: 'ARS', pack_quantity: 100, pack_unit: 'g', yield_pct: 100 },
      ],
      recipes: [
        {
          id: 'sub_masa_poolish',
          name: 'Masa con Poolish 70%',
          recipe_type: 'subrecipe',
          yield_quantity: 1728,
          yield_unit: 'g',
          currency: 'ARS',
          bakers_dough: {
            total_flour_g: 1000,
            hydration_pct: 70,
            yield_basis: 'measured_yield',
            measured_yield_g: 1728,
            flours: [{ ingredient_id: 'ing_harina', share_pct: 100 }],
            poolish: { flour_pct: 30, water_pct: 100, yeast_pct: 1.0, yeast_ingredient_id: 'ing_levadura' },
            salt_pct: 2.5,
            salt_ingredient_id: 'ing_sal',
            water_ingredient_id: 'ing_agua',
          },
        },
        {
          id: 'sub_salsa',
          name: 'Salsa Pomodoro Casa',
          recipe_type: 'subrecipe',
          yield_quantity: 1000,
          yield_unit: 'g',
          currency: 'ARS',
          components: [
            { component_type: 'ingredient', ingredient_id: 'ing_tomate', quantity: 800, unit: 'g' },
            { component_type: 'ingredient', ingredient_id: 'ing_aceite', quantity: 100, unit: 'ml' },
          ],
        },
        {
          id: 'prod_margherita',
          name: 'Pizza Margherita Clásica',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          target_food_cost_pct: 30,
          currency: 'ARS',
          components: [
            { component_type: 'subrecipe', recipe_id: 'sub_masa_poolish', quantity: 220, unit: 'g' },
            { component_type: 'subrecipe', recipe_id: 'sub_salsa', quantity: 100, unit: 'g' },
            { component_type: 'ingredient', ingredient_id: 'ing_mozzarella', quantity: 220, unit: 'g' },
          ],
        },
        {
          id: 'prod_especial_jamon',
          name: 'Pizza Especial con Jamón y Pollo',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          target_food_cost_pct: 30,
          currency: 'ARS',
          components: [
            { component_type: 'subrecipe', recipe_id: 'sub_masa_poolish', quantity: 250, unit: 'g' },
            { component_type: 'subrecipe', recipe_id: 'sub_salsa', quantity: 100, unit: 'g' },
            { component_type: 'ingredient', ingredient_id: 'ing_mozzarella', quantity: 200, unit: 'g' },
            { component_type: 'ingredient', ingredient_id: 'ing_jamon', quantity: 100, unit: 'g' },
            { component_type: 'ingredient', ingredient_id: 'ing_pollo', quantity: 90, unit: 'g' },
          ],
        },
        {
          id: 'prod_focaccia_a',
          name: 'Focaccia Rellena Producto A',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          target_food_cost_pct: 30,
          currency: 'ARS',
          components: [
            { component_type: 'subrecipe', recipe_id: 'sub_salsa', quantity: 100, unit: 'g' },
            { component_type: 'ingredient', ingredient_id: 'ing_mozzarella', quantity: 150, unit: 'g' },
          ],
        },
        {
          id: 'prod_trufa_incompleta',
          name: 'Pizza Trufa Incompleta',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          target_food_cost_pct: 30,
          currency: 'ARS',
          components: [
            { component_type: 'ingredient', ingredient_id: 'ing_harina', quantity: 200, unit: 'g' },
            { component_type: 'ingredient', ingredient_id: 'ing_trufa', quantity: 20, unit: 'g' },
          ],
        },
      ],
    },
    productSalesMap: {
      prod_margherita: { monthlyUnitsSold: 950, sellingPrice: 4200 },
      prod_especial_jamon: { monthlyUnitsSold: 500, sellingPrice: 8000 },
      prod_focaccia_a: { monthlyUnitsSold: 420, sellingPrice: 2600 },
      prod_trufa_incompleta: { monthlyUnitsSold: 45, sellingPrice: null },
    },
    operatingExpenses: [
      { id: 'exp_1', name: 'Alquiler', category: 'rent', period: 'monthly', amount: 850000 },
      { id: 'exp_2', name: 'Sueldos', category: 'payroll', period: 'monthly', amount: 1800000 },
      { id: 'exp_3', name: 'Limpieza Semanal', category: 'other', period: 'weekly', amount: 30000 }, // 30000 * 52 / 12 = 130000
      { id: 'exp_4', name: 'Licencia Anual', category: 'software', period: 'yearly', amount: 240000 }, // 240000 / 12 = 20000
    ],
  };
}

/**
 * Reproduce exactamente la lógica de la interfaz Web (computeFilteredSummary y simulatedBusinessResult en App.tsx)
 */
function evaluateWebAndSimulatorInterfaces(state, simParams = { pricePct: 0, unitsPct: 0, flourPct: 0, dairyPct: 0, meatPct: 0, otherPct: 0 }) {
  const engine = new CostEngine(state.catalog);
  const products = state.catalog.recipes.filter((r) => r.recipe_type === 'product');

  const totalFixedExpenses = state.operatingExpenses.reduce((acc, exp) => {
    const mult = exp.period === 'weekly' ? 52 / 12 : exp.period === 'yearly' ? 1 / 12 : 1;
    return acc + exp.amount * mult;
  }, 0);

  const webRows = [];
  const simRows = [];
  let webTotalUnits = 0;
  let webTotalRev = 0;
  let webTotalCogs = 0;
  let webTotalContrib = 0;

  let simTotalUnits = 0;
  let simTotalRev = 0;
  let simTotalCogs = 0;
  let simTotalContrib = 0;

  for (const r of products) {
    const res = engine.calculateRecipeCost(r.id);
    const plan = state.productSalesMap[r.id] ?? {};
    const units = plan.monthlyUnitsSold ?? 0;
    const manualPrice = plan.sellingPrice && plan.sellingPrice > 0 ? Number(plan.sellingPrice) : undefined;
    const isComplete = res.status === 'complete' && res.raw_unit_cost !== null && res.raw_unit_cost > 0;

    const pricing = calculatePricingScenario({
      unit_cost: isComplete ? res.raw_unit_cost : null,
      status: isComplete ? 'complete' : 'incomplete',
      currency: state.currency,
      target_food_cost_pct: r.target_food_cost_pct ?? state.defaultTargetFoodCostPct,
      rounding_increment: state.defaultRoundingIncrement,
      rounding_mode: 'ceil',
      selling_price: manualPrice,
      packaging_cost: state.defaultPackagingCost,
      channel_fee_pct: state.defaultChannelFeePct,
    });

    const evalPrice = pricing.raw_evaluated_price ?? 0;
    const grossProfit = pricing.raw_gross_profit ?? 0;
    const decomp = decomposeRecipeCategoryCosts(state.catalog, r.id, state.currency);

    if (isComplete) {
      webTotalUnits += units;
      webTotalRev += evalPrice * units;
      webTotalCogs += res.raw_unit_cost * units;
      webTotalContrib += grossProfit * units;

      const restCost = Math.max(0, res.raw_unit_cost - decomp.flourCost - decomp.dairyCost - decomp.meatCost);
      const simUnitCost =
        decomp.flourCost * (1 + simParams.flourPct / 100) +
        decomp.dairyCost * (1 + simParams.dairyPct / 100) +
        decomp.meatCost * (1 + simParams.meatPct / 100) +
        restCost * (1 + simParams.otherPct / 100);
      const simPrice = Math.round(evalPrice * (1 + simParams.pricePct / 100));
      const simUnits = Math.round(units * (1 + simParams.unitsPct / 100));

      simTotalUnits += simUnits;
      simTotalRev += simPrice * simUnits;
      simTotalCogs += simUnitCost * simUnits;
      simTotalContrib += (simPrice - simUnitCost) * simUnits;

      simRows.push({
        id: r.id,
        status: 'complete',
        baseCost: res.raw_unit_cost,
        simUnitCost,
        basePrice: evalPrice,
        simPrice,
        baseUnits: units,
        simUnits,
        decomp,
      });
    } else {
      simRows.push({
        id: r.id,
        status: 'incomplete',
        baseCost: null,
        simUnitCost: null,
        basePrice: null,
        simPrice: null,
        baseUnits: units,
        simUnits: 0,
        decomp,
      });
    }

    webRows.push({
      id: r.id,
      status: isComplete ? 'complete' : 'incomplete',
      unitCost: res.raw_unit_cost,
      minPrice: pricing.raw_minimum_price,
      suggPrice: pricing.raw_suggested_price,
      evalPrice: isComplete ? evalPrice : null,
      grossProfit: isComplete ? grossProfit : null,
      fcPct: pricing.food_cost_pct,
      marginPct: pricing.gross_margin_pct,
      markupPct: pricing.markup_pct,
      netDeliv: pricing.raw_net_contribution_after_channel,
      units,
      decomp,
    });
  }

  return {
    webRows,
    simRows,
    totalFixedExpenses,
    webSummary: {
      totalUnits: webTotalUnits,
      totalRev: webTotalRev,
      totalCogs: webTotalCogs,
      totalContrib: webTotalContrib,
      netProfit: webTotalContrib - totalFixedExpenses,
    },
    simSummary: {
      totalUnits: simTotalUnits,
      totalRev: simTotalRev,
      totalCogs: simTotalCogs,
      totalContrib: simTotalContrib,
      netProfit: simTotalContrib - totalFixedExpenses,
    },
  };
}

test('Tarea 1.7: Paridad matemática exacta entre las 4 interfaces (Cost Engine, App Web, Simulador y Excel v2)', async (t) => {
  const ws = buildCrossInterfaceWorkspace();
  const engine = new CostEngine(ws.catalog);
  const bytes = generateProfitKitV2WorkbookBytes(ws);
  const zipEntries = extractZipTextEntries(bytes);

  // Hojas en zip: sheet6.xml = 05_Subrecetas, sheet7.xml = 06_Recetas_Productos, sheet8.xml = 07_Precios,
  // sheet9.xml = 08_Ventas, sheet11.xml = 10_Gastos, sheet12.xml = 11_Rentabilidad, sheet13.xml = 12_Simulaciones
  const s05 = parseSheetCells(zipEntries['xl/worksheets/sheet6.xml']);
  const s06 = parseSheetCells(zipEntries['xl/worksheets/sheet7.xml']);
  const s07 = parseSheetCells(zipEntries['xl/worksheets/sheet8.xml']);
  const s08 = parseSheetCells(zipEntries['xl/worksheets/sheet9.xml']);
  const s10 = parseSheetCells(zipEntries['xl/worksheets/sheet11.xml']);
  const s11 = parseSheetCells(zipEntries['xl/worksheets/sheet12.xml']);
  const s12 = parseSheetCells(zipEntries['xl/worksheets/sheet13.xml']);

  const baseEval = evaluateWebAndSimulatorInterfaces(ws, {
    pricePct: 0,
    unitsPct: 0,
    flourPct: 0,
    dairyPct: 0,
    meatPct: 0,
    otherPct: 0,
  });

  await t.test('1. Paridad de subrecetas entre Cost Engine y Excel Hoja 05 (incluyendo desglose por rubro J, K, L)', () => {
    const subrecipes = ws.catalog.recipes.filter((r) => r.recipe_type === 'subrecipe');
    subrecipes.forEach((sub, idx) => {
      const row = 5 + idx;
      const engRes = engine.calculateRecipeCost(sub.id);
      const engDecomp = decomposeRecipeCategoryCosts(ws.catalog, sub.id, ws.currency);

      assert.equal(s05[`A${row}`].v, sub.id);
      assertClose(s05[`E${row}`].v, engRes.raw_batch_cost, `Hoja 05 E${row} batch_cost de ${sub.id}`);
      assertClose(s05[`H${row}`].v, engRes.raw_unit_cost, `Hoja 05 H${row} unit_cost de ${sub.id}`);
      assertClose(s05[`I${row}`].v, engRes.cost_per_kg, `Hoja 05 I${row} cost_per_kg de ${sub.id}`);
      assertClose(s05[`J${row}`].v, engDecomp.flourCost, `Hoja 05 J${row} flourCost/u de ${sub.id}`);
      assertClose(s05[`K${row}`].v, engDecomp.dairyCost, `Hoja 05 K${row} dairyCost/u de ${sub.id}`);
      assertClose(s05[`L${row}`].v, engDecomp.meatCost, `Hoja 05 L${row} meatCost/u de ${sub.id}`);
    });
  });

  await t.test('2. Paridad por receta final entre Cost Engine, App Web, Simulador Base (0%) y Excel Hojas 06, 07, 08 y 12', () => {
    baseEval.webRows.forEach((wRow, idx) => {
      const r = 5 + idx;
      const rSim = 15 + idx;
      const engRes = engine.calculateRecipeCost(wRow.id);
      const simRow = baseEval.simRows[idx];

      if (wRow.status === 'complete') {
        // 1) Cost Engine === Web UI === Simulador Base === Excel Hoja 06 (H) === Hoja 07 (D) === Hoja 08 (E) === Hoja 12 (E, F)
        assertClose(engRes.raw_unit_cost, wRow.unitCost, `${wRow.id}: CostEngine vs Web UI`);
        assertClose(engRes.raw_unit_cost, simRow.baseCost, `${wRow.id}: CostEngine vs Simulador Base`);
        assertClose(engRes.raw_unit_cost, simRow.simUnitCost, `${wRow.id}: CostEngine vs Simulador @ 0%`);
        assertClose(engRes.raw_unit_cost, s06[`H${r}`].v, `${wRow.id}: CostEngine vs Excel Hoja 06 H${r}`);
        assertClose(engRes.raw_unit_cost, s07[`D${r}`].v, `${wRow.id}: CostEngine vs Excel Hoja 07 D${r}`);
        assertClose(engRes.raw_unit_cost, s08[`E${r}`].v, `${wRow.id}: CostEngine vs Excel Hoja 08 E${r}`);
        assertClose(engRes.raw_unit_cost, s12[`E${rSim}`].v, `${wRow.id}: CostEngine vs Excel Hoja 12 E${rSim}`);
        assertClose(engRes.raw_unit_cost, s12[`F${rSim}`].v, `${wRow.id}: CostEngine vs Excel Hoja 12 F${rSim} @ 0%`);

        // 2) Desglose de rubros en Excel Hoja 06 (Cols I, J, K) === decomposeRecipeCategoryCosts
        assertClose(s06[`I${r}`].v, wRow.decomp.flourCost, `${wRow.id}: Hoja 06 I${r} flourCost`);
        assertClose(s06[`J${r}`].v, wRow.decomp.dairyCost, `${wRow.id}: Hoja 06 J${r} dairyCost`);
        assertClose(s06[`K${r}`].v, wRow.decomp.meatCost, `${wRow.id}: Hoja 06 K${r} meatCost`);

        // 3) Precios, Food Cost %, Margen %, Markup % y Contribución Delivery en Hoja 07 === CostEngine / Web UI
        assertClose(s07[`G${r}`].v, wRow.minPrice, `${wRow.id}: Hoja 07 G${r} minimum_price`);
        assertClose(s07[`H${r}`].v, wRow.suggPrice, `${wRow.id}: Hoja 07 H${r} suggested_price`);
        assertClose(s07[`J${r}`].v, wRow.evalPrice, `${wRow.id}: Hoja 07 J${r} evaluated_price`);
        assertClose(s07[`K${r}`].v, wRow.grossProfit, `${wRow.id}: Hoja 07 K${r} gross_profit`);
        assertClose(s07[`L${r}`].v, wRow.fcPct, `${wRow.id}: Hoja 07 L${r} food_cost_pct`);
        assertClose(s07[`M${r}`].v, wRow.marginPct, `${wRow.id}: Hoja 07 M${r} gross_margin_pct`);
        assertClose(s07[`N${r}`].v, wRow.markupPct, `${wRow.id}: Hoja 07 N${r} markup_pct`);
        assertClose(s07[`O${r}`].v, wRow.netDeliv, `${wRow.id}: Hoja 07 O${r} net_contribution_after_channel`);
      } else {
        // Receta incompleta bloqueada en las 4 interfaces
        assert.equal(engRes.status, 'incomplete');
        assert.equal(engRes.raw_unit_cost, null);
        assert.equal(wRow.unitCost, null);
        assert.equal(simRow.simUnitCost, null);
        assert.equal(s06[`G${r}`].v, 'INCOMPLETO');
        assert.equal(s07[`C${r}`].v, 'INCOMPLETO');
        assert.equal(s07[`G${r}`].v, 'BLOQUEADO (INCOMPLETO)');
        assert.equal(s07[`H${r}`].v, 'BLOQUEADO (INCOMPLETO)');
        assert.equal(s08[`G${r}`].v, 0, 'Receta incompleta aporta $0 a facturación en Hoja 08');
        assert.equal(s08[`H${r}`].v, 0, 'Receta incompleta aporta $0 a CMV en Hoja 08');
      }
    });
  });

  await t.test('3. Paridad de Totales de Negocio (Facturación, CMV, Contribución, Gastos Fijos y EBITDA) entre Web, Simulador y Excel Hojas 08, 10, 11 y 12', () => {
    // Totales en Hoja 11 (B5 = Unidades, B6 = Facturación, B7 = CMV, B9 = Contribución, B11 = Gastos Fijos, B12 = EBITDA)
    assertClose(s11['B5'].v, baseEval.webSummary.totalUnits, 'Hoja 11 B5 Unidades === Web UI');
    assertClose(s11['B6'].v, baseEval.webSummary.totalRev, 'Hoja 11 B6 Facturación === Web UI');
    assertClose(s11['B7'].v, baseEval.webSummary.totalCogs, 'Hoja 11 B7 CMV === Web UI');
    assertClose(s11['B9'].v, baseEval.webSummary.totalContrib, 'Hoja 11 B9 Contribución === Web UI');
    assertClose(s11['B11'].v, baseEval.totalFixedExpenses, 'Hoja 11 B11 Gastos Fijos === Web UI');
    assertClose(s11['B12'].v, baseEval.webSummary.netProfit, 'Hoja 11 B12 EBITDA === Web UI');

    // Paridad con Hoja 12 (Simulador inicial en 0%)
    assertClose(s12['B12'].v, baseEval.simSummary.totalRev, 'Hoja 12 B12 Facturación Simulada @ 0% === Simulador Web');
    assertClose(s12['D12'].v, baseEval.simSummary.netProfit, 'Hoja 12 D12 Ganancia Neta Simulada @ 0% === Simulador Web');
  });

  await t.test('4. Paridad del Simulador ante subas por rubro (+15% Harina, +20% Lácteos, +10% Carnes, +5% Otros, +12% Precio, -5% Unidades)', () => {
    const shock = { pricePct: 12, unitsPct: -5, flourPct: 15, dairyPct: 20, meatPct: 10, otherPct: 5 };
    const shockedWebSim = evaluateWebAndSimulatorInterfaces(ws, shock);

    // Evaluar exactamente la fórmula de la Hoja 12 (Columna F, D, I, J, K, L) con los valores de Hoja 06 (Cols H, I, J, K)
    let excelSimRevTotal = 0;
    let excelSimCogsTotal = 0;
    let excelSimContribTotal = 0;

    shockedWebSim.simRows.forEach((sRow, idx) => {
      if (sRow.status !== 'complete') return;
      const r6 = 5 + idx;
      const h6 = Number(s06[`H${r6}`].v);
      const i6 = Number(s06[`I${r6}`].v);
      const j6 = Number(s06[`J${r6}`].v);
      const k6 = Number(s06[`K${r6}`].v);

      // Fórmula exacta en Hoja 12 Columna F:
      // '06'!I{r6}*(1+$B$7/100) + '06'!J{r6}*(1+$B$8/100) + '06'!K{r6}*(1+$B$9/100) + MAX(0,'06'!H{r6}-'06'!I{r6}-'06'!J{r6}-'06'!K{r6})*(1+$B$10/100)
      const excelFormulaSimCost =
        i6 * (1 + shock.flourPct / 100) +
        j6 * (1 + shock.dairyPct / 100) +
        k6 * (1 + shock.meatPct / 100) +
        Math.max(0, h6 - i6 - j6 - k6) * (1 + shock.otherPct / 100);

      assertClose(
        excelFormulaSimCost,
        sRow.simUnitCost,
        `${sRow.id}: Costo Simulado en fórmula Excel Hoja 12 === Simulador Web App`
      );

      const c8 = Number(s08[`C${r6}`].v);
      const j7 = Number(s07[`J${r6}`].v);
      const excelSimUnits = Math.round(c8 * (1 + shock.unitsPct / 100));
      const excelSimPrice = Math.round(j7 * (1 + shock.pricePct / 100));

      excelSimRevTotal += excelSimUnits * excelSimPrice;
      excelSimCogsTotal += excelSimUnits * excelFormulaSimCost;
      excelSimContribTotal += excelSimUnits * (excelSimPrice - excelFormulaSimCost);
    });

    assertClose(excelSimRevTotal, shockedWebSim.simSummary.totalRev, 'Facturación Simulada Total: Excel vs Web Simulator');
    assertClose(excelSimCogsTotal, shockedWebSim.simSummary.totalCogs, 'CMV Simulado Total: Excel vs Web Simulator');
    assertClose(excelSimContribTotal, shockedWebSim.simSummary.totalContrib, 'Contribución Simulada Total: Excel vs Web Simulator');
    assertClose(
      excelSimContribTotal - shockedWebSim.totalFixedExpenses,
      shockedWebSim.simSummary.netProfit,
      'EBITDA Simulado Total: Excel vs Web Simulator'
    );
  });
});
