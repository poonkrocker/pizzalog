import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { expandFainaSpec, CostEngineValidationError } from '../dist/index.js';

describe('Cost Engine — Fainá formula expansion', () => {
  it('expands mold count into flour, water, salt and oil quantities', () => {
    const result = expandFainaSpec({
      units_count: 10,
      chickpea_flour_ingredient_id: 'chickpea',
      salt_ingredient_id: 'salt',
      oil_ingredient_id: 'oil',
    });

    assert.equal(result.chickpeaFlourG, 1850);
    assert.equal(result.waterG, 4162.5);
    assert.equal(result.saltG, 92.5);
    assert.equal(result.oilMl, 120);
    assert.equal(result.totalWeightG, 6012.5);
    assert.equal(result.components.length, 3);
  });

  it('includes water in the recipe cost only when explicitly mapped', () => {
    const result = expandFainaSpec({
      units_count: 1,
      chickpea_flour_ingredient_id: 'chickpea',
      salt_ingredient_id: 'salt',
      oil_ingredient_id: 'oil',
      water_ingredient_id: 'water',
    });
    assert.equal(result.components.length, 4);
    assert.equal(result.components[3].ingredient_id, 'water');
  });

  it('rejects missing ingredient mappings instead of silently omitting them', () => {
    assert.throws(
      () => expandFainaSpec({
        units_count: 1,
        chickpea_flour_ingredient_id: '',
        salt_ingredient_id: 'salt',
        oil_ingredient_id: 'oil',
      }),
      (error) => error instanceof CostEngineValidationError && error.code === 'INVALID_DOUGH_SPEC'
    );
  });
});
