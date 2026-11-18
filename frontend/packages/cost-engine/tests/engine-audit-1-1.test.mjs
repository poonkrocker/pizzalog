import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CostEngine,
  CostEngineValidationError,
  calculatePortfolioScenario,
  convertQuantity,
} from '../dist/index.js';

describe('Task 1.1 — Cost Engine Formula & Guardrail Audit', () => {
  it('marks a recipe incomplete with reason zero_quantity when a non-excluded component has quantity === 0', () => {
    const engine = new CostEngine({
      ingredients: [
        { id: 'harina', name: 'Harina 0000', base_dimension: 'mass', base_unit: 'kg', is_active: true },
        { id: 'muzza', name: 'Muzzarella', base_dimension: 'mass', base_unit: 'kg', is_active: true },
      ],
      purchase_prices: [
        { ingredient_id: 'harina', purchase_price: 1500, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'muzza', purchase_price: 10000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      ],
      recipes: [
        {
          id: 'pizza_pending_qty',
          name: 'Pizza con gramaje pendiente',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          currency: 'ARS',
          components: [
            { component_type: 'ingredient', ingredient_id: 'harina', quantity: 200, unit: 'g' },
            { component_type: 'ingredient', ingredient_id: 'muzza', quantity: 0, unit: 'g' },
          ],
        },
      ],
    });

    const res = engine.calculateRecipeCost('pizza_pending_qty');
    assert.equal(res.status, 'incomplete', 'Recipe with a 0-quantity unexcluded ingredient must be incomplete');
    assert.equal(res.raw_batch_cost, null);
    assert.equal(res.raw_unit_cost, null);
    assert.equal(res.raw_partial_batch_cost, 300);
    assert.ok(
      res.missing_inputs.some((m) => m.ingredient_id === 'muzza' && m.reason === 'zero_quantity'),
      'missing_inputs must record zero_quantity for muzza'
    );
  });

  it('expands recipe.faina automatically inside calculateRecipeCost when faina spec is provided on a recipe', () => {
    const engine = new CostEngine({
      ingredients: [
        { id: 'garbanzo', name: 'Harina de Garbanzo', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'sal', name: 'Sal', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'aceite', name: 'Aceite', base_dimension: 'volume', base_unit: 'ml', is_active: true },
        { id: 'agua', name: 'Agua', base_dimension: 'mass', base_unit: 'g', is_free: true, is_active: true },
      ],
      purchase_prices: [
        { ingredient_id: 'garbanzo', purchase_price: 3500, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'sal', purchase_price: 650, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'aceite', purchase_price: 22500, currency: 'ARS', pack_quantity: 1, pack_unit: 'L', yield_pct: 100 },
      ],
      recipes: [
        {
          id: 'sub_faina_molde',
          name: 'Fainá 1 molde',
          recipe_type: 'subrecipe',
          yield_quantity: 0,
          yield_unit: 'g',
          currency: 'ARS',
          faina: {
            units_count: 1,
            chickpea_flour_ingredient_id: 'garbanzo',
            salt_ingredient_id: 'sal',
            oil_ingredient_id: 'aceite',
            water_ingredient_id: 'agua',
          },
        },
      ],
    });

    const res = engine.calculateRecipeCost('sub_faina_molde');
    assert.equal(res.status, 'complete');
    // 185g * 3.5 + 9.25g * 0.65 + 12ml * 22.5 = 647.5 + 6.0125 + 270 = 923.5125
    assert.ok(Math.abs((res.raw_batch_cost ?? 0) - 923.5125) < 1e-6);
    // totalWeightG = 185 + 185*2.25 = 601.25 g
    assert.ok(Math.abs(res.raw_yield_quantity - 601.25) < 1e-6);
  });

  it('converts count <-> volume when both unit_weight_g and density_g_per_ml are defined, and throws otherwise', () => {
    const bottleIng = {
      name: 'Tomate en botella',
      unit_weight_g: 920,
      density_g_per_ml: 0.92,
    };
    // 1 unit = 920g -> at 0.92 g/ml = 1000 ml = 1 L
    const liters = convertQuantity(1, 'unit', 'L', bottleIng);
    assert.ok(Math.abs(liters - 1) < 1e-9);
    const unitsBack = convertQuantity(2, 'L', 'unit', bottleIng);
    assert.ok(Math.abs(unitsBack - 2) < 1e-9);

    assert.throws(
      () => convertQuantity(1, 'unit', 'L', { name: 'Sin densidad', unit_weight_g: 920 }),
      (err) => err instanceof CostEngineValidationError && err.code === 'INCOMPATIBLE_UNITS'
    );
  });

  it('validates target_food_cost_pct boundaries in calculatePortfolioScenario', () => {
    assert.throws(
      () =>
        calculatePortfolioScenario({
          items: [],
          cost_delta_pct: 0,
          price_delta_pct: 0,
          target_food_cost_pct: 0,
        }),
      (err) => err instanceof CostEngineValidationError && err.code === 'INVALID_PRICING_PARAMETERS'
    );
    assert.throws(
      () =>
        calculatePortfolioScenario({
          items: [],
          cost_delta_pct: 0,
          price_delta_pct: 0,
          target_food_cost_pct: 100,
        }),
      (err) => err instanceof CostEngineValidationError && err.code === 'INVALID_PRICING_PARAMETERS'
    );
  });
});
