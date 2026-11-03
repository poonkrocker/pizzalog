import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { selectEffectivePurchasePrice } from '../dist/index.js';

const price = (purchase_price, purchase_date, supplier) => ({
  ingredient_id: 'flour',
  purchase_price,
  purchase_date,
  currency: 'ARS',
  pack_quantity: 1,
  pack_unit: 'kg',
  supplier,
});

describe('Cost Engine — selección de precio de compra', () => {
  it('selecciona la fecha más reciente disponible a la fecha de corte', () => {
    const result = selectEffectivePurchasePrice('flour', [
      price(100, '2026-01-01', 'A'),
      price(120, '2026-02-01', 'B'),
      price(150, '2026-03-01', 'C'),
    ], '2026-02-15');
    assert.equal(result?.purchase_price, 120);
  });

  it('prefiere el último registro agregado cuando varias cotizaciones tienen la misma fecha', () => {
    const result = selectEffectivePurchasePrice('flour', [
      price(100, '2026-02-01', 'A'),
      price(125, '2026-02-01', 'B'),
    ], '2026-02-28');
    assert.equal(result?.purchase_price, 125);
    assert.equal(result?.supplier, 'B');
  });

  it('prefiere el último precio sin fecha cuando no hay historial fechado', () => {
    const result = selectEffectivePurchasePrice('flour', [
      price(100, undefined, 'A'),
      price(140, undefined, 'B'),
    ]);
    assert.equal(result?.purchase_price, 140);
  });

  it('ignora registros de otros ingredientes', () => {
    const result = selectEffectivePurchasePrice('flour', [
      { ...price(900, '2026-03-01', 'Other'), ingredient_id: 'tomato' },
      price(100, '2026-01-01', 'A'),
    ]);
    assert.equal(result?.purchase_price, 100);
  });
});
