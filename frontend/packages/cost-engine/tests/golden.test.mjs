import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CostEngine,
  CostEngineValidationError,
  calculatePricingScenario,
  convertQuantity,
  createCostSnapshot,
} from '../dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const goldenPath = path.resolve(
  __dirname,
  '../../cost-engine-fixtures/src/golden-cases.json'
);
const goldenData = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
const cases = goldenData.cases;

function assertClose(actual, expected, tolerance = 1e-6, message = '') {
  assert.equal(typeof actual, 'number', `Se esperaba número pero se recibió ${actual}. ${message}`);
  const diff = Math.abs(actual - expected);
  assert.ok(
    diff <= tolerance,
    `${message ? message + ': ' : ''}Valor actual ${actual} difiere del esperado ${expected} en ${diff} (tolerancia ±${tolerance})`
  );
}

describe('Pizzalog Cost Engine v1 — Batería de 8 Pruebas Golden (CE-001 a CE-008)', () => {
  it('CE-001: Masa pizza Arrabbiata 220 g con biga — regresión histórica exacta contra hoja Masas!D43', () => {
    const c = cases.CE_001;
    const recipe = {
      id: 'ce_001_masa_arrabbiata',
      name: 'Masa Pizza Arrabbiata 220g (Biga 25%)',
      recipe_type: 'subrecipe',
      yield_quantity: 220,
      yield_unit: 'g',
      currency: c.currency,
      bakers_dough: c.dough_profile,
    };

    const engine = new CostEngine({
      ingredients: c.ingredients,
      purchase_prices: c.purchase_prices,
      recipes: [recipe],
    });

    const result = engine.calculateRecipeCost(recipe.id);
    assert.equal(result.status, 'complete');
    assert.ok(result.cost_per_kg !== null && result.cost_per_kg !== undefined);

    // Verificar paridad exacta con Masas!D43 (ARS 932.298871562119 / kg) y bollo 220g (ARS 205.105751743666)
    assertClose(result.cost_per_kg, c.expected.cost_per_kg, 1e-9, 'Costo por kg de masa (Masas!D43)');
    assertClose(result.raw_batch_cost, c.expected.cost_per_bollo_220g, 1e-9, 'Costo por bollo de 220g');
    assertClose(
      result.raw_batch_cost,
      result.cost_per_kg * 0.22,
      1e-9,
      'Costo por bollo = costo/kg × 0.220 kg'
    );

    // Verificar que si falta un precio del fixture NO usa fallbacks hardcodeados
    const engineWithoutYeastPrice = new CostEngine({
      ingredients: c.ingredients,
      purchase_prices: c.purchase_prices.filter((p) => p.ingredient_id !== 'levadura'),
      recipes: [recipe],
    });
    const incompleteRes = engineWithoutYeastPrice.calculateRecipeCost(recipe.id);
    assert.equal(incompleteRes.status, 'incomplete');
    assert.equal(incompleteRes.batch_cost, null);
    assert.ok(incompleteRes.missing_inputs.some((m) => m.ingredient_id === 'levadura'));
  });

  it('CE-002: Masa con poolish — fixture sintético (1000g harina, 3g levadura = ARS 15, rendimiento medido 1728g)', () => {
    const c = cases.CE_002;
    const recipe = {
      id: 'ce_002_masa_poolish',
      name: 'Masa con Poolish 30%',
      recipe_type: 'subrecipe',
      yield_quantity: c.dough_profile.measured_yield_g,
      yield_unit: 'g',
      currency: c.currency,
      bakers_dough: c.dough_profile,
    };

    const engine = new CostEngine({
      ingredients: c.ingredients,
      purchase_prices: c.purchase_prices,
      recipes: [recipe],
    });

    const result = engine.calculateRecipeCost(recipe.id);
    assert.equal(result.status, 'complete');

    // Verificar que 3 g de levadura a ARS 5.000/kg cuestan ARS 15.00 (no ARS 0.015)
    const yeastBreakdown = result.components.find((comp) => comp.id === 'levadura');
    assert.ok(yeastBreakdown, 'Debe existir el componente levadura');
    assertClose(yeastBreakdown.raw_total_cost, c.expected.yeast_cost, 1e-9, 'Costo levadura (3g a $5000/kg = $15)');

    // Verificar que harina total es 1000g (poolish no duplica harina)
    const flourBreakdown = result.components.find((comp) => comp.id === 'harina');
    assert.ok(flourBreakdown);
    assertClose(flourBreakdown.quantity, 1000, 1e-9, 'Harina total contada una sola vez');
    assertClose(flourBreakdown.raw_total_cost, c.expected.flour_cost, 1e-9, 'Costo harina');

    // Verificar batch cost y cost/kg con rendimiento medido 1.728 kg
    assertClose(result.raw_batch_cost, c.expected.batch_cost, c.tolerance, 'Batch cost CE-002');
    assertClose(result.cost_per_kg, c.expected.cost_per_kg, c.tolerance, 'Costo por kg CE-002');
    assert.equal(result.raw_yield_quantity, 1728);
  });

  it('CE-003: Fainá — fixture sintético (harina en g, aceite y agua en ml, rendimiento medido en kg)', () => {
    const c = cases.CE_003;
    const engine = new CostEngine({
      ingredients: c.ingredients,
      purchase_prices: c.purchase_prices,
      recipes: [c.recipe],
    });

    const result = engine.calculateRecipeCost(c.recipe.id);
    assert.equal(result.status, 'complete');
    assertClose(result.raw_batch_cost, c.expected.batch_cost, c.tolerance, 'Batch cost Fainá');
    assertClose(result.raw_unit_cost, c.expected.cost_per_kg, c.tolerance, 'Costo por kg Fainá');
    assertClose(result.cost_per_kg, c.expected.cost_per_kg, c.tolerance, 'cost_per_kg Fainá');

    // Verificar que no convierte ml de aceite a gramos si no tiene densidad declarada
    const oilIng = c.ingredients.find((i) => i.id === 'aceite');
    assert.throws(
      () => convertQuantity(50, 'ml', 'g', oilIng),
      (err) => err instanceof CostEngineValidationError && err.code === 'INCOMPATIBLE_UNITS_MISSING_DENSITY'
    );
  });

  it('CE-004: Receta final con unidades distintas y presentaciones de compra', () => {
    const c = cases.CE_004;
    const engine = new CostEngine({
      ingredients: c.ingredients,
      purchase_prices: c.purchase_prices,
      recipes: [c.recipe],
    });

    const result = engine.calculateRecipeCost(c.recipe.id);
    assert.equal(result.status, 'complete');
    assertClose(result.raw_batch_cost, c.expected.batch_cost, c.tolerance, 'Batch cost CE-004');
    assertClose(result.raw_unit_cost, c.expected.unit_cost, c.tolerance, 'Unit cost CE-004');
    assert.equal(result.batch_cost, '975.00');
    assert.equal(result.unit_cost, '975.00');

    // Si se introduce una unidad incompatible (ml de queso sin densidad), falla con error explícito
    const badRecipe = {
      ...c.recipe,
      id: 'rec_ce004_bad',
      components: [
        { component_type: 'ingredient', ingredient_id: 'harina', quantity: 250, unit: 'g' },
        { component_type: 'ingredient', ingredient_id: 'queso', quantity: 150, unit: 'ml' },
      ],
    };
    const badEngine = new CostEngine({
      ingredients: c.ingredients,
      purchase_prices: c.purchase_prices,
      recipes: [badRecipe],
    });
    assert.throws(
      () => badEngine.calculateRecipeCost(badRecipe.id),
      (err) => err instanceof CostEngineValidationError && err.code === 'INCOMPATIBLE_UNITS_MISSING_DENSITY'
    );
  });

  it('CE-005: Una subreceta utilizada en dos recetas finales, cache, recálculo, snapshots y detección de ciclos', () => {
    const c = cases.CE_005;
    const catalog = {
      ingredients: c.ingredients,
      purchase_prices: c.purchase_prices,
      recipes: c.recipes,
    };

    const engine = new CostEngine(catalog);
    const resA = engine.calculateRecipeCost('prod_a');
    const resB = engine.calculateRecipeCost('prod_b');
    const resSalsa = engine.calculateRecipeCost('sub_salsa');

    assert.equal(resSalsa.status, 'complete');
    assertClose(resSalsa.raw_batch_cost, c.expected.sub_salsa_batch_cost, c.tolerance);
    assertClose(resSalsa.cost_per_kg, c.expected.sub_salsa_cost_per_kg, c.tolerance);
    assertClose(resA.raw_unit_cost, c.expected.prod_a_cost, c.tolerance, 'Producto A = ARS 700');
    assertClose(resB.raw_unit_cost, c.expected.prod_b_cost, c.tolerance, 'Producto B = ARS 420');

    // La subreceta se calcula una sola vez por instancia/versión de inputs y se reutiliza
    assert.equal(
      engine.subrecipeEvaluationCount.get('sub_salsa'),
      1,
      'La subreceta salsa debe evaluarse una única vez y reutilizarse en caché'
    );

    // Guardar snapshot histórico antes de cambiar el precio del tomate
    const snapshotBefore = createCostSnapshot(catalog, 'prod_a');
    assert.equal(snapshotBefore.cost_result.unit_cost, '700.00');

    // Modificar el precio del tomate (de 1000 a 2000 ARS/kg) recalcula ambos productos actuales
    const updatedCatalog = {
      ...catalog,
      purchase_prices: catalog.purchase_prices.map((p) =>
        p.ingredient_id === 'tomate' ? { ...p, purchase_price: 2000 } : p
      ),
    };
    const updatedEngine = new CostEngine(updatedCatalog);
    const newResA = updatedEngine.calculateRecipeCost('prod_a');
    const newResB = updatedEngine.calculateRecipeCost('prod_b');

    // Salsa pasa de 1000 a 1800 ARS/kg -> 100g salsa = 180 (+80) -> Prod A = 780; 200g salsa = 360 (+160) -> Prod B = 580
    assertClose(newResA.raw_unit_cost, 780, c.tolerance);
    assertClose(newResB.raw_unit_cost, 580, c.tolerance);

    // El snapshot histórico anterior NO cambia
    assert.equal(snapshotBefore.cost_result.unit_cost, '700.00');
    assert.notEqual(snapshotBefore.input_snapshot_hash, newResA.input_snapshot_hash);

    // Un ciclo de subrecetas se rechaza con CostEngineValidationError, nunca devuelve costo cero
    const cyclicRecipes = [
      {
        id: 'sub_1',
        name: 'Sub 1',
        recipe_type: 'subrecipe',
        yield_quantity: 1,
        yield_unit: 'kg',
        currency: 'ARS',
        components: [{ component_type: 'subrecipe', recipe_id: 'sub_2', quantity: 1, unit: 'kg' }],
      },
      {
        id: 'sub_2',
        name: 'Sub 2',
        recipe_type: 'subrecipe',
        yield_quantity: 1,
        yield_unit: 'kg',
        currency: 'ARS',
        components: [{ component_type: 'subrecipe', recipe_id: 'sub_1', quantity: 1, unit: 'kg' }],
      },
    ];
    const cyclicEngine = new CostEngine({
      ingredients: c.ingredients,
      purchase_prices: c.purchase_prices,
      recipes: cyclicRecipes,
    });
    assert.throws(
      () => cyclicEngine.calculateRecipeCost('sub_1'),
      (err) => err instanceof CostEngineValidationError && err.code === 'SUBRECIPE_CYCLE_DETECTED'
    );
  });

  it('CE-006: Compra con 10% de merma (rendimiento utilizable 90%, aplicación única)', () => {
    const c = cases.CE_006;
    const engine = new CostEngine({
      ingredients: c.ingredients,
      purchase_prices: c.purchase_prices,
      recipes: [c.recipe],
    });

    const result = engine.calculateRecipeCost(c.recipe.id);
    assert.equal(result.status, 'complete');
    assertClose(result.raw_unit_cost, c.expected.recipe_cost, c.tolerance, 'Costo receta 180g pollo utilizable = ARS 200');
    assert.equal(result.unit_cost, '200.00');

    // Verificar costo utilizable por g = 1.111111... ARS/g (1111.111... ARS/kg)
    const comp = result.components[0];
    assertClose(comp.raw_unit_cost * 1000, c.expected.usable_cost_per_kg, 1e-6);

    // Rendimiento 0%, negativo o > 100% se rechaza
    for (const invalidYield of [0, -10, 105]) {
      const badEngine = new CostEngine({
        ingredients: c.ingredients,
        purchase_prices: [{ ...c.purchase_prices[0], yield_pct: invalidYield }],
        recipes: [c.recipe],
      });
      assert.throws(
        () => badEngine.calculateRecipeCost(c.recipe.id),
        (err) => err instanceof CostEngineValidationError && err.code === 'INVALID_YIELD_PCT'
      );
    }
  });

  it('CE-007: Ingrediente sin precio — estado incomplete, nunca cero silencioso ni precio sugerido falso', () => {
    const c = cases.CE_007;
    const engine = new CostEngine({
      ingredients: c.ingredients,
      purchase_prices: c.purchase_prices,
      recipes: [c.recipe],
    });

    const result = engine.calculateRecipeCost(c.recipe.id);
    assert.equal(result.status, 'incomplete');
    assert.equal(result.batch_cost, null);
    assert.equal(result.unit_cost, null);
    assert.equal(result.raw_batch_cost, null);
    assert.equal(result.raw_unit_cost, null);
    assertClose(result.raw_partial_batch_cost, c.expected.partial_batch_cost, 1e-6);
    assert.equal(result.partial_batch_cost, '300.00');
    assert.equal(result.missing_inputs.length, 1);
    assert.equal(result.missing_inputs[0].ingredient_id, 'mozzarella');
    assert.equal(result.missing_inputs[0].reason, 'missing_purchase_price');

    // No debe generar food cost ni precio sugerido definitivo cuando está incomplete
    const pricing = calculatePricingScenario({
      unit_cost: result.raw_unit_cost,
      status: result.status,
      target_food_cost_pct: 30,
      rounding_increment: 100,
    });
    assert.equal(pricing.status, 'incomplete');
    assert.equal(pricing.suggested_price, null);
    assert.equal(pricing.food_cost_pct, null);

    // Al cargar un precio válido para mozzarella (ej. ARS 10.000/kg -> 100g = ARS 1.000), pasa a complete (ARS 1.300)
    const completeEngine = new CostEngine({
      ingredients: c.ingredients,
      purchase_prices: [
        ...c.purchase_prices,
        { ingredient_id: 'mozzarella', purchase_price: 10000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      ],
      recipes: [c.recipe],
    });
    const completeResult = completeEngine.calculateRecipeCost(c.recipe.id);
    assert.equal(completeResult.status, 'complete');
    assert.equal(completeResult.batch_cost, '1300.00');
    assert.equal(completeResult.unit_cost, '1300.00');
    assert.equal(completeResult.missing_inputs.length, 0);
  });

  it('CE-008: Precio sugerido, food cost, margen bruto y markup con redondeo configurable', () => {
    const c = cases.CE_008;
    const res = calculatePricingScenario(c.inputs);

    assert.equal(res.status, 'complete');
    assertClose(res.raw_minimum_price, c.expected.minimum_price, 1e-6);
    assertClose(res.raw_suggested_price, c.expected.suggested_price, 1e-6);
    assertClose(res.raw_gross_profit, c.expected.gross_profit, 1e-6);
    assertClose(res.food_cost_pct, c.expected.food_cost_pct, 1e-6);
    assertClose(res.gross_margin_pct, c.expected.gross_margin_pct, 1e-6);
    assertClose(res.markup_pct, c.expected.markup_pct, 1e-6);

    // Cambiar incremento a ARS 1.000 mantiene precio sugerido ARS 4.000
    const res1000 = calculatePricingScenario({
      ...c.inputs,
      rounding_increment: 1000,
    });
    assertClose(res1000.raw_suggested_price, 4000, 1e-6);

    // Un target de food cost de 30% no se confunde con margen bruto de 30%
    assert.notEqual(res.food_cost_pct, res.gross_margin_pct);
    assertClose(res.food_cost_pct + res.gross_margin_pct, 100, 1e-9);

    // Costo, objetivo o incremento inválido se rechaza
    assert.throws(
      () => calculatePricingScenario({ ...c.inputs, unit_cost: 0 }),
      (err) => err instanceof CostEngineValidationError && err.code === 'INVALID_PRICING_PARAMETERS'
    );
    assert.throws(
      () => calculatePricingScenario({ ...c.inputs, target_food_cost_pct: 0 }),
      (err) => err instanceof CostEngineValidationError && err.code === 'INVALID_PRICING_PARAMETERS'
    );
    assert.throws(
      () => calculatePricingScenario({ ...c.inputs, target_food_cost_pct: 105 }),
      (err) => err instanceof CostEngineValidationError && err.code === 'INVALID_PRICING_PARAMETERS'
    );
    assert.throws(
      () => calculatePricingScenario({ ...c.inputs, rounding_increment: 0 }),
      (err) => err instanceof CostEngineValidationError && err.code === 'INVALID_PRICING_PARAMETERS'
    );
    assert.throws(
      () => calculatePricingScenario({ ...c.inputs, rounding_increment: -100 }),
      (err) => err instanceof CostEngineValidationError && err.code === 'INVALID_PRICING_PARAMETERS'
    );
  });

  it('Casos adicionales obligatorios: densidad kg↔L, unidades US customary, multimoneda, fecha efectiva y costos de canal', () => {
    // 1. Densidad explícita kg ↔ L (Aceite densidad 0.92 g/ml: 100 ml = 92 g)
    const oilWithDensity = {
      id: 'aceite_oliva',
      name: 'Aceite de Oliva',
      base_dimension: 'volume',
      base_unit: 'L',
      density_g_per_ml: 0.92,
      is_active: true,
    };
    const litersFrom92g = convertQuantity(92, 'g', 'L', oilWithDensity);
    assertClose(litersFrom92g, 0.1, 1e-9, '92g de aceite con densidad 0.92 g/ml equivalen a 0.1 L');

    // 2. Unidades US customary (lb, oz, fl_oz_us, gal_us)
    assertClose(convertQuantity(1, 'lb', 'g'), 453.59237, 1e-6);
    assertClose(convertQuantity(16, 'oz', 'lb'), 1, 1e-9);
    assertClose(convertQuantity(1, 'gal_us', 'fl_oz_us'), 128, 1e-6);

    // 3. Unidad desconocida se rechaza
    assert.throws(
      () => convertQuantity(1, 'pizca', 'g'),
      (err) => err instanceof CostEngineValidationError && err.code === 'UNKNOWN_UNIT'
    );

    // 4. Moneda distinta sin tipo de cambio se rechaza; con tipo de cambio explícito funciona
    const importedIng = { id: 'harina_caputo', name: 'Harina Caputo', base_dimension: 'mass', base_unit: 'kg', is_active: true };
    const usdPrice = { ingredient_id: 'harina_caputo', purchase_price: 50, currency: 'USD', pack_quantity: 25, pack_unit: 'kg', yield_pct: 100 };
    const recArs = {
      id: 'rec_caputo',
      name: 'Bollo Caputo',
      recipe_type: 'product',
      yield_quantity: 1,
      yield_unit: 'unit',
      currency: 'ARS',
      components: [{ component_type: 'ingredient', ingredient_id: 'harina_caputo', quantity: 200, unit: 'g' }],
    };

    const engineNoFx = new CostEngine({ ingredients: [importedIng], purchase_prices: [usdPrice], recipes: [recArs] });
    assert.throws(
      () => engineNoFx.calculateRecipeCost('rec_caputo'),
      (err) => err instanceof CostEngineValidationError && err.code === 'CURRENCY_MISMATCH'
    );

    const engineWithFx = new CostEngine({
      ingredients: [importedIng],
      purchase_prices: [usdPrice],
      recipes: [recArs],
      exchange_rates: [{ from_currency: 'USD', to_currency: 'ARS', rate: 1200, effective_date: '2026-11-01', source: 'Oficial' }],
    });
    const fxRes = engineWithFx.calculateRecipeCost('rec_caputo');
    // 50 USD / 25 kg = 2 USD/kg * 1200 = 2400 ARS/kg -> 200g = 480 ARS
    assert.equal(fxRes.status, 'complete');
    assertClose(fxRes.raw_unit_cost, 480, 1e-6);

    // 5. Costos variables de canal separados del food cost de ingredientes
    const channelScenario = calculatePricingScenario({
      unit_cost: 1200,
      target_food_cost_pct: 30,
      rounding_increment: 500,
      packaging_cost: 300,
      channel_fee_pct: 25,
    });
    // Precio sugerido = 4000; food_cost_pct sigue siendo 30% (1200 / 4000), pero net_contribution descuenta envase (300) y comisión 25% (1000) -> 2800 - 1300 = 1500
    assertClose(channelScenario.food_cost_pct, 30, 1e-6);
    assertClose(channelScenario.raw_gross_profit, 2800, 1e-6);
    assertClose(channelScenario.raw_net_contribution_after_channel, 1500, 1e-6);
  });
});
