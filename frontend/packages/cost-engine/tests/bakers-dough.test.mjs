import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CostEngineValidationError,
  expandBakersDoughSpec,
} from '../dist/index.js';

const baseSpec = {
  total_flour_g: 1000,
  hydration_pct: 65,
  yield_basis: 'measured_yield',
  measured_yield_g: 1650,
  flours: [{ ingredient_id: 'flour', share_pct: 100 }],
  biga: {
    flour_pct: 30,
    water_pct: 50,
    yeast_pct: 1,
    yeast_ingredient_id: 'yeast_biga',
  },
  poolish: {
    flour_pct: 20,
    water_pct: 100,
    yeast_pct: 2,
    yeast_ingredient_id: 'yeast_poolish',
  },
  direct_yeast_pct: 0.5,
  yeast_ingredient_id: 'yeast_direct',
};

describe('Cost Engine — validación y expansión de masas', () => {
  it('mantiene separados los ingredientes de levadura de biga, poolish y amasado directo', () => {
    const result = expandBakersDoughSpec(baseSpec);
    const yeast = result.components.filter((component) =>
      ['yeast_biga', 'yeast_poolish', 'yeast_direct'].includes(component.ingredient_id)
    );

    assert.deepEqual(
      yeast.map(({ ingredient_id, quantity }) => ({ ingredient_id, quantity })),
      [
        { ingredient_id: 'yeast_biga', quantity: 3 },
        { ingredient_id: 'yeast_poolish', quantity: 4 },
        { ingredient_id: 'yeast_direct', quantity: 5 },
      ]
    );
  });

  it('rechaza mezclas con pesos de harina cuya suma sea cero', () => {
    assert.throws(
      () => expandBakersDoughSpec({
        ...baseSpec,
        flours: [
          { ingredient_id: 'flour_a', weight_kg: 0 },
          { ingredient_id: 'flour_b', weight_kg: 0 },
        ],
      }),
      (error) => error instanceof CostEngineValidationError && error.code === 'INVALID_DOUGH_SPEC'
    );
  });

  it('rechaza porcentajes de harina que no suman 100%', () => {
    assert.throws(
      () => expandBakersDoughSpec({
        ...baseSpec,
        flours: [
          { ingredient_id: 'flour_a', share_pct: 60 },
          { ingredient_id: 'flour_b', share_pct: 20 },
        ],
      }),
      (error) => error instanceof CostEngineValidationError && error.code === 'INVALID_DOUGH_SPEC'
    );
  });

  it('rechaza mezclas que combinan pesos parciales con porcentajes sin una base completa', () => {
    assert.throws(
      () => expandBakersDoughSpec({
        ...baseSpec,
        flours: [
          { ingredient_id: 'flour_a', weight_kg: 1 },
          { ingredient_id: 'flour_b', share_pct: 20 },
        ],
      }),
      (error) => error instanceof CostEngineValidationError && error.code === 'INVALID_DOUGH_SPEC'
    );
  });

  it('rechaza levadura directa sin ingrediente asignado', () => {
    assert.throws(
      () => expandBakersDoughSpec({
        ...baseSpec,
        yeast_ingredient_id: undefined,
      }),
      (error) => error instanceof CostEngineValidationError && error.code === 'INVALID_DOUGH_SPEC'
    );
  });

  it('rechaza porcentajes negativos o no finitos', () => {
    for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(
        () => expandBakersDoughSpec({
          ...baseSpec,
          poolish: { ...baseSpec.poolish, yeast_pct: invalid },
        }),
        (error) => error instanceof CostEngineValidationError && error.code === 'INVALID_DOUGH_SPEC'
      );
    }
  });
});
