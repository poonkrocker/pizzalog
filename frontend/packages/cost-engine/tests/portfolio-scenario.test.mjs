import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePortfolioScenario, CostEngineValidationError } from '../dist/index.js';

describe('Cost Engine — portfolio pricing scenario', () => {
  it('applies cost and price deltas through the shared pricing engine', () => {
    const result = calculatePortfolioScenario({
      items: [
        { id: 'pizza', name: 'Pizza', unit_cost: 1000, status: 'complete', selling_price: 4000 },
      ],
      cost_delta_pct: 10,
      price_delta_pct: 15,
      rounding_increment: 100,
      target_food_cost_pct: 30,
    });

    assert.equal(result.rows[0].current_cost, 1000);
    assert.equal(result.rows[0].simulated_cost, 1100);
    assert.equal(result.rows[0].current_price, 4000);
    assert.equal(result.rows[0].simulated_price, 4600);
    assert.equal(result.rows[0].simulated_margin, 3500);
    assert.equal(result.current_food_cost_pct, 25);
    assert.equal(result.simulated_food_cost_pct, 1100 / 4600 * 100);
  });

  it('keeps incomplete recipes out of simulated cost and margin totals', () => {
    const result = calculatePortfolioScenario({
      items: [
        { id: 'complete', name: 'Complete', unit_cost: 1000, status: 'complete', selling_price: 4000 },
        { id: 'incomplete', name: 'Incomplete', unit_cost: null, status: 'incomplete', selling_price: 5000 },
      ],
      cost_delta_pct: 20,
      price_delta_pct: 10,
    });

    assert.equal(result.incomplete_items, 1);
    assert.equal(result.rows[1].simulated_cost, null);
    assert.equal(result.rows[1].simulated_food_cost_pct, null);
    assert.equal(result.current_revenue, 4000);
    assert.equal(result.simulated_revenue, 4400);
  });

  it('rejects variations that would make cost or price negative', () => {
    assert.throws(
      () => calculatePortfolioScenario({
        items: [],
        cost_delta_pct: -100,
        price_delta_pct: 0,
      }),
      (error) => error instanceof CostEngineValidationError && error.code === 'INVALID_PRICING_PARAMETERS'
    );
  });
});
