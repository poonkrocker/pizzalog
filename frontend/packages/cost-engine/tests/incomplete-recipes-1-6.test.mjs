import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CostEngine,
  CostEngineValidationError,
  calculatePortfolioScenario,
  calculatePricingScenario,
  generateProfitKitV2WorkbookBytes,
} from '../dist/index.js';

function buildIncompleteTestCatalog() {
  return {
    as_of_date: '2026-11-15',
    ingredients: [
      { id: 'ing_ok', name: 'Harina OK', base_dimension: 'mass', base_unit: 'g', is_active: true },
      { id: 'ing_null_price', name: 'Trufa Sin Precio', base_dimension: 'mass', base_unit: 'g', is_active: true },
      { id: 'ing_zero_price', name: 'Queso Precio Cero', base_dimension: 'mass', base_unit: 'g', is_active: true },
      { id: 'ing_neg_price', name: 'Jamón Precio Negativo', base_dimension: 'mass', base_unit: 'g', is_active: true },
      { id: 'ing_future_price', name: 'Salmón Precio Futuro', base_dimension: 'mass', base_unit: 'g', is_active: true },
      { id: 'ing_inactive', name: 'Anchoa Inactiva', base_dimension: 'mass', base_unit: 'g', is_active: false },
      { id: 'ing_free', name: 'Agua de Red Gratis', base_dimension: 'volume', base_unit: 'ml', is_free: true, is_active: true },
    ],
    purchase_prices: [
      { ingredient_id: 'ing_ok', purchase_price: 1000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'ing_null_price', purchase_price: null, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'ing_zero_price', purchase_price: 0, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'ing_neg_price', purchase_price: -500, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'ing_future_price', purchase_price: 8000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100, purchase_date: '2026-12-31' },
      { ingredient_id: 'ing_inactive', purchase_price: 5000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
    ],
    recipes: [
      {
        id: 'rec_ok',
        name: 'Receta Completa Control',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [{ component_type: 'ingredient', ingredient_id: 'ing_ok', quantity: 500, unit: 'g' }],
      },
      {
        id: 'rec_null_price',
        name: 'Receta con Precio Null',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'ingredient', ingredient_id: 'ing_ok', quantity: 200, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'ing_null_price', quantity: 20, unit: 'g' },
        ],
      },
      {
        id: 'rec_zero_price',
        name: 'Receta con Precio Cero no gratis',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'ingredient', ingredient_id: 'ing_ok', quantity: 200, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'ing_zero_price', quantity: 100, unit: 'g' },
        ],
      },
      {
        id: 'rec_neg_price',
        name: 'Receta con Precio Negativo',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'ingredient', ingredient_id: 'ing_ok', quantity: 200, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'ing_neg_price', quantity: 100, unit: 'g' },
        ],
      },
      {
        id: 'rec_future_price',
        name: 'Receta con Precio sólo Futuro',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'ingredient', ingredient_id: 'ing_ok', quantity: 200, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'ing_future_price', quantity: 100, unit: 'g' },
        ],
      },
      {
        id: 'rec_missing_ing',
        name: 'Receta con Ingrediente Inexistente',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'ingredient', ingredient_id: 'ing_ok', quantity: 200, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'ing_fantasma', quantity: 50, unit: 'g' },
        ],
      },
      {
        id: 'rec_inactive_ing',
        name: 'Receta con Ingrediente Inactivo',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'ingredient', ingredient_id: 'ing_ok', quantity: 200, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'ing_inactive', quantity: 50, unit: 'g' },
        ],
      },
      {
        id: 'rec_zero_qty_ing',
        name: 'Receta con Cantidad Cero en Ingrediente',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'ingredient', ingredient_id: 'ing_ok', quantity: 200, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'ing_ok', quantity: 0, unit: 'g' },
        ],
      },
      {
        id: 'rec_zero_qty_sub',
        name: 'Receta con Cantidad Cero en Subreceta',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'subrecipe', recipe_id: 'rec_ok', quantity: 0, unit: 'unit' },
        ],
      },
      {
        id: 'rec_empty',
        name: 'Receta Vacía Sin Componentes',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [],
      },
      {
        id: 'rec_only_free',
        name: 'Receta Solo con Agua Gratis ($0)',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [{ component_type: 'ingredient', ingredient_id: 'ing_free', quantity: 500, unit: 'ml' }],
      },
    ],
  };
}

function assertStrictlyBlockedCostResult(res, expectedReason, expectedIngId) {
  assert.equal(res.status, 'incomplete', `${res.recipe_id} debe tener status incomplete`);
  assert.equal(res.batch_cost, null, `${res.recipe_id} batch_cost debe ser null`);
  assert.equal(res.raw_batch_cost, null, `${res.recipe_id} raw_batch_cost debe ser null`);
  assert.equal(res.unit_cost, null, `${res.recipe_id} unit_cost debe ser null`);
  assert.equal(res.raw_unit_cost, null, `${res.recipe_id} raw_unit_cost debe ser null`);
  assert.equal(res.cost_per_kg, null, `${res.recipe_id} cost_per_kg debe ser null`);
  if (expectedReason) {
    assert.ok(
      res.missing_inputs.some(
        (m) => m.reason === expectedReason && (!expectedIngId || m.ingredient_id === expectedIngId)
      ),
      `${res.recipe_id} debe reportar missing_input reason=${expectedReason} id=${expectedIngId}`
    );
  }
}

test('Tarea 1.6: Auditoría exhaustiva de recetas incompletas y bloqueo de resultados engañosos', async (t) => {
  const catalog = buildIncompleteTestCatalog();
  const engine = new CostEngine(catalog);

  await t.test('1. Bloqueo por falta de precio (null, 0 en insumo no gratis, negativo, o fecha futura)', () => {
    assertStrictlyBlockedCostResult(engine.calculateRecipeCost('rec_null_price'), 'missing_purchase_price', 'ing_null_price');
    assertStrictlyBlockedCostResult(engine.calculateRecipeCost('rec_zero_price'), 'missing_purchase_price', 'ing_zero_price');
    assertStrictlyBlockedCostResult(engine.calculateRecipeCost('rec_neg_price'), 'missing_purchase_price', 'ing_neg_price');
    assertStrictlyBlockedCostResult(engine.calculateRecipeCost('rec_future_price'), 'missing_purchase_price', 'ing_future_price');
  });

  await t.test('2. Bloqueo por ingrediente inexistente o inactivo (incluyendo línea en breakdowns)', () => {
    const resMissing = engine.calculateRecipeCost('rec_missing_ing');
    assertStrictlyBlockedCostResult(resMissing, 'missing_ingredient', 'ing_fantasma');
    assert.ok(resMissing.components.some((c) => c.id === 'ing_fantasma' && c.status === 'incomplete'));

    const resInactive = engine.calculateRecipeCost('rec_inactive_ing');
    assertStrictlyBlockedCostResult(resInactive, 'inactive_ingredient', 'ing_inactive');
    assert.ok(resInactive.components.some((c) => c.id === 'ing_inactive' && c.status === 'incomplete'));
  });

  await t.test('3. Bloqueo por cantidad cero en ingrediente o subreceta', () => {
    assertStrictlyBlockedCostResult(engine.calculateRecipeCost('rec_zero_qty_ing'), 'zero_quantity', 'ing_ok');
    assertStrictlyBlockedCostResult(engine.calculateRecipeCost('rec_zero_qty_sub'), 'zero_quantity', 'rec_ok');
  });

  await t.test('4. Bloqueo de receta vacía o receta con costo total $0', () => {
    assertStrictlyBlockedCostResult(engine.calculateRecipeCost('rec_empty'));
    assertStrictlyBlockedCostResult(engine.calculateRecipeCost('rec_only_free'));
  });

  await t.test('5. Rechazo estricto cuando falta o es inválido el rendimiento de la receta (yield_quantity <= 0)', () => {
    const badCatalog = {
      ingredients: [{ id: 'ing_ok', name: 'Harina', base_dimension: 'mass', base_unit: 'g', is_active: true }],
      purchase_prices: [{ ingredient_id: 'ing_ok', purchase_price: 1000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 }],
      recipes: [
        {
          id: 'rec_bad_yield',
          name: 'Receta con Rendimiento 0',
          recipe_type: 'product',
          yield_quantity: 0,
          yield_unit: 'unit',
          currency: 'ARS',
          components: [{ component_type: 'ingredient', ingredient_id: 'ing_ok', quantity: 100, unit: 'g' }],
        },
      ],
    };
    const badEngine = new CostEngine(badCatalog);
    assert.throws(
      () => badEngine.calculateRecipeCost('rec_bad_yield'),
      (err) => err instanceof CostEngineValidationError && err.code === 'INVALID_RECIPE_YIELD'
    );
  });

  await t.test('6. Bloqueo en calculatePricingScenario y calculatePortfolioScenario para todas las recetas incompletas', () => {
    const incompleteIds = [
      'rec_null_price',
      'rec_zero_price',
      'rec_neg_price',
      'rec_future_price',
      'rec_missing_ing',
      'rec_inactive_ing',
      'rec_zero_qty_ing',
      'rec_zero_qty_sub',
      'rec_empty',
      'rec_only_free',
    ];

    const portfolioItems = [];
    for (const id of incompleteIds) {
      const res = engine.calculateRecipeCost(id);
      const pricing = calculatePricingScenario({
        unit_cost: res.raw_unit_cost,
        status: res.status,
        currency: 'ARS',
        target_food_cost_pct: 30,
        rounding_increment: 100,
        selling_price: 5000,
      });

      assert.equal(pricing.status, 'incomplete');
      assert.equal(pricing.minimum_price, null);
      assert.equal(pricing.raw_minimum_price, null);
      assert.equal(pricing.suggested_price, null);
      assert.equal(pricing.raw_suggested_price, null);
      assert.equal(pricing.evaluated_price, null);
      assert.equal(pricing.gross_profit, null);
      assert.equal(pricing.food_cost_pct, null);
      assert.equal(pricing.gross_margin_pct, null);
      assert.equal(pricing.markup_pct, null);
      assert.equal(pricing.net_contribution_after_channel, null);

      portfolioItems.push({
        id,
        name: res.recipe_name,
        unit_cost: res.raw_unit_cost,
        status: res.status,
        selling_price: 5000,
      });
    }

    // Agregar la única receta completa (costo $500, precio $2000)
    const okRes = engine.calculateRecipeCost('rec_ok');
    portfolioItems.push({
      id: 'rec_ok',
      name: okRes.recipe_name,
      unit_cost: okRes.raw_unit_cost,
      status: okRes.status,
      selling_price: 2000,
    });

    const portfolio = calculatePortfolioScenario({
      items: portfolioItems,
      cost_delta_pct: 10,
      price_delta_pct: 10,
      rounding_increment: 100,
      target_food_cost_pct: 30,
    });

    assert.equal(portfolio.complete_items, 1);
    assert.equal(portfolio.incomplete_items, incompleteIds.length);
    assert.equal(portfolio.current_revenue, 2000, 'Solo la receta completa suma a facturación');
    assert.equal(portfolio.current_cost, 500, 'Solo la receta completa suma a costo');
    for (const row of portfolio.rows.filter((r) => r.id !== 'rec_ok')) {
      assert.equal(row.status, 'incomplete');
      assert.equal(row.current_cost, null);
      assert.equal(row.simulated_cost, null);
      assert.equal(row.simulated_price, null);
      assert.equal(row.current_food_cost_pct, null);
      assert.equal(row.simulated_food_cost_pct, null);
      assert.equal(row.current_margin, null);
      assert.equal(row.simulated_margin, null);
    }
  });
});
