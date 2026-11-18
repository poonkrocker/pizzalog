import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CostEngine,
  CostEngineValidationError,
  areUnitsCompatible,
  convertQuantity,
  expandBakersDoughSpec,
  getUnitDefinition,
} from '../dist/index.js';

const TOLERANCE = 1e-9;

function assertClose(actual, expected, label, tol = TOLERANCE) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: expected ${expected}, got ${actual} (diff=${Math.abs(actual - expected)})`
  );
}

test('Tarea 1.3: Conversiones de unidades (métricas, conteo, porcentajes panaderos y US Customary)', async (t) => {
  await t.test('1. Masa métrica: kg, g, mg (ida y vuelta)', () => {
    assertClose(convertQuantity(1, 'kg', 'g'), 1000, '1 kg -> 1000 g');
    assertClose(convertQuantity(2500, 'g', 'kg'), 2.5, '2500 g -> 2.5 kg');
    assertClose(convertQuantity(1, 'g', 'mg'), 1000, '1 g -> 1000 mg');
    assertClose(convertQuantity(500, 'mg', 'g'), 0.5, '500 mg -> 0.5 g');
    assertClose(convertQuantity(1, 'kg', 'mg'), 1_000_000, '1 kg -> 1,000,000 mg');
    assertClose(convertQuantity(250_000, 'mg', 'kg'), 0.25, '250,000 mg -> 0.25 kg');
  });

  await t.test('2. Volumen métrico: L, l, ml, cc (ida y vuelta)', () => {
    assertClose(convertQuantity(1, 'L', 'ml'), 1000, '1 L -> 1000 ml');
    assertClose(convertQuantity(1, 'l', 'ml'), 1000, '1 l -> 1000 ml');
    assertClose(convertQuantity(750, 'ml', 'L'), 0.75, '750 ml -> 0.75 L');
    assertClose(convertQuantity(250, 'cc', 'ml'), 250, '250 cc -> 250 ml');
    assertClose(convertQuantity(1.5, 'L', 'cc'), 1500, '1.5 L -> 1500 cc');
  });

  await t.test('3. Unidades y docenas: unit, u, dozen, docena', () => {
    assertClose(convertQuantity(1, 'dozen', 'unit'), 12, '1 dozen -> 12 unit');
    assertClose(convertQuantity(1, 'docena', 'u'), 12, '1 docena -> 12 u');
    assertClose(convertQuantity(36, 'unit', 'dozen'), 3, '36 unit -> 3 dozen');
    assertClose(convertQuantity(18, 'u', 'docena'), 1.5, '18 u -> 1.5 docena');
    assertClose(convertQuantity(5, 'unit', 'u'), 5, '5 unit -> 5 u');
    assertClose(convertQuantity(2, 'dozen', 'docena'), 2, '2 dozen -> 2 docena');
  });

  await t.test('4. Unidades estadounidenses de masa: lb y oz', () => {
    assertClose(convertQuantity(1, 'lb', 'g'), 453.59237, '1 lb -> 453.59237 g');
    assertClose(convertQuantity(1, 'oz', 'g'), 28.349523125, '1 oz -> 28.349523125 g');
    assertClose(convertQuantity(1, 'lb', 'oz'), 16, '1 lb -> 16 oz exactos');
    assertClose(convertQuantity(32, 'oz', 'lb'), 2, '32 oz -> 2 lb exactos');
    assertClose(convertQuantity(50, 'lb', 'kg'), 22.6796185, 'Bolsa 50 lb -> 22.6796185 kg');
    assertClose(convertQuantity(22.6796185, 'kg', 'lb'), 50, '22.6796185 kg -> 50 lb');
  });

  await t.test('5. Unidades estadounidenses de volumen: fl_oz_us y gal_us', () => {
    assertClose(convertQuantity(1, 'fl_oz_us', 'ml'), 29.5735295625, '1 fl_oz_us -> 29.5735295625 ml');
    assertClose(convertQuantity(1, 'gal_us', 'ml'), 3785.411784, '1 gal_us -> 3785.411784 ml');
    assertClose(convertQuantity(1, 'gal_us', 'fl_oz_us'), 128, '1 gal_us -> 128 fl_oz_us exactos');
    assertClose(convertQuantity(64, 'fl_oz_us', 'gal_us'), 0.5, '64 fl_oz_us -> 0.5 gal_us');
    assertClose(convertQuantity(1, 'gal_us', 'L'), 3.785411784, '1 gal_us -> 3.785411784 L');
  });

  await t.test('6. Porcentajes panaderos (Bakers percentages %) sobre harina total y prefermentos', () => {
    const expanded = expandBakersDoughSpec({
      total_flour_g: 2000,
      hydration_pct: 68,
      yield_basis: 'total_formula',
      flours: [
        { ingredient_id: 'f1', share_pct: 75 },
        { ingredient_id: 'f2', share_pct: 25 },
      ],
      biga: {
        flour_pct: 30, // 600g harina en biga
        water_pct: 45, // 270g agua en biga
        yeast_pct: 1.0, // 6g levadura en biga (0.3% sobre harina total)
        yeast_ingredient_id: 'y_biga',
      },
      poolish: {
        flour_pct: 20, // 400g harina en poolish
        water_pct: 100, // 400g agua en poolish
        yeast_pct: 0.5, // 2g levadura en poolish (0.1% sobre harina total)
        yeast_ingredient_id: 'y_pool',
      },
      direct_yeast_pct: 0.2, // 4g levadura directa
      yeast_ingredient_id: 'y_dir',
      salt_pct: 2.8, // 56g sal
      salt_ingredient_id: 'salt',
      sugar_pct: 1.5, // 30g azúcar
      sugar_ingredient_id: 'sugar',
      oil_pct: 2.0, // 40g aceite
      oil_ingredient_id: 'oil',
      water_ingredient_id: 'water',
    });

    assertClose(expanded.flourTotalG, 2000, 'Harina total 2000g');
    assertClose(expanded.waterTotalG, 1360, 'Agua total 68% = 1360g');
    assertClose(expanded.biga.flourG, 600, 'Harina biga 30% = 600g');
    assertClose(expanded.biga.waterG, 270, 'Agua biga 45% de 600g = 270g');
    assertClose(expanded.biga.yeastG, 6, 'Levadura biga 1% de 600g = 6g');
    assertClose(expanded.poolish.flourG, 400, 'Harina poolish 20% = 400g');
    assertClose(expanded.poolish.waterG, 400, 'Agua poolish 100% de 400g = 400g');
    assertClose(expanded.poolish.yeastG, 2, 'Levadura poolish 0.5% de 400g = 2g');
    assertClose(expanded.final.flourG, 1000, 'Harina restante en amasado final = 1000g');
    assertClose(expanded.final.waterG, 690, 'Agua restante en amasado final = 1360 - 270 - 400 = 690g');
    assertClose(expanded.direct.yeastG, 4, 'Levadura directa 0.2% de 2000g = 4g');
    assertClose(expanded.direct.saltG, 56, 'Sal 2.8% de 2000g = 56g');
    assertClose(expanded.direct.sugarG, 30, 'Azúcar 1.5% de 2000g = 30g');
    assertClose(expanded.direct.oilG, 40, 'Aceite 2.0% de 2000g = 40g');
    assertClose(
      expanded.yieldQuantityG,
      2000 + 1360 + 6 + 2 + 4 + 56 + 30 + 40,
      'Rendimiento total_formula = suma exacta de todos los gramos'
    );
  });

  await t.test('7. Conversión entre dimensiones Masa <-> Volumen con density_g_per_ml y bloqueo sin densidad', () => {
    const oliveOil = { name: 'Aceite de Oliva', density_g_per_ml: 0.92 };
    assertClose(convertQuantity(920, 'g', 'L', oliveOil), 1.0, '920g aceite (0.92 g/ml) -> 1 L');
    assertClose(convertQuantity(1, 'L', 'g', oliveOil), 920, '1 L aceite (0.92 g/ml) -> 920 g');
    assertClose(convertQuantity(1, 'gal_us', 'lb', oliveOil), (3785.411784 * 0.92) / 453.59237, '1 gal_us aceite -> lb');

    assert.throws(
      () => convertQuantity(100, 'g', 'ml', { name: 'Insumo Sin Densidad' }),
      (err) => err instanceof CostEngineValidationError && err.code === 'INCOMPATIBLE_UNITS_MISSING_DENSITY'
    );
    assert.throws(
      () => convertQuantity(100, 'ml', 'g', { name: 'Insumo Densidad Cero', density_g_per_ml: 0 }),
      (err) => err instanceof CostEngineValidationError && err.code === 'INCOMPATIBLE_UNITS_MISSING_DENSITY'
    );
  });

  await t.test('8. Conversión Conteo <-> Masa con unit_weight_g y Conteo <-> Volumen con ambos', () => {
    const egg = { name: 'Huevo Grande', unit_weight_g: 60 };
    assertClose(convertQuantity(1, 'dozen', 'g', egg), 720, '1 docena de huevos (60g/u) -> 720 g');
    assertClose(convertQuantity(1.44, 'kg', 'dozen', egg), 2, '1.44 kg de huevos (60g/u) -> 2 docenas');

    const liquidEgg = { name: 'Huevo Líquido', unit_weight_g: 51.5, density_g_per_ml: 1.03 };
    assertClose(convertQuantity(2, 'unit', 'ml', liquidEgg), 100, '2 huevos (51.5g, 1.03g/ml) -> 100 ml');
    assertClose(convertQuantity(0.5, 'L', 'unit', liquidEgg), 10, '0.5 L -> 10 huevos');

    assert.throws(
      () => convertQuantity(1, 'unit', 'g', { name: 'Insumo Sin Peso Unitario' }),
      (err) => err instanceof CostEngineValidationError && err.code === 'INCOMPATIBLE_UNITS'
    );
    assert.throws(
      () => convertQuantity(1, 'unit', 'ml', { name: 'Insumo Solo Con Peso', unit_weight_g: 50 }),
      (err) => err instanceof CostEngineValidationError && err.code === 'INCOMPATIBLE_UNITS'
    );
  });

  await t.test('9. Rechazo estricto de unidades desconocidas y cantidades negativas/NaN', () => {
    assert.throws(
      () => getUnitDefinition('pizca'),
      (err) => err instanceof CostEngineValidationError && err.code === 'UNKNOWN_UNIT'
    );
    assert.equal(areUnitsCompatible('pizca', 'pizca'), false, 'Unidad desconocida idéntica debe retornar false');
    assert.equal(areUnitsCompatible('', ''), false, 'Unidad vacía debe retornar false');
    assert.equal(areUnitsCompatible('kg', 'lb'), true, 'kg y lb son compatibles');
    assert.equal(areUnitsCompatible('kg', 'L'), false, 'kg y L sin densidad no son compatibles');
    assert.equal(areUnitsCompatible('kg', 'L', { name: 'Agua', density_g_per_ml: 1 }), true, 'kg y L con densidad son compatibles');

    assert.throws(
      () => convertQuantity(-5, 'g', 'kg'),
      (err) => err instanceof CostEngineValidationError && err.code === 'INCOMPATIBLE_UNITS'
    );
    assert.throws(
      () => convertQuantity(Number.NaN, 'g', 'kg'),
      (err) => err instanceof CostEngineValidationError && err.code === 'INCOMPATIBLE_UNITS'
    );
  });

  await t.test('10. Invarianza de costo en CostEngine al expresar la misma receta en Métrico vs US Customary', () => {
    const catalog = {
      ingredients: [
        { id: 'flour', name: 'Flour', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'cheese', name: 'Cheese', base_dimension: 'mass', base_unit: 'oz', is_active: true },
        { id: 'oil', name: 'Olive Oil', base_dimension: 'volume', base_unit: 'ml', density_g_per_ml: 0.92, is_active: true },
        { id: 'box', name: 'Pizza Box', base_dimension: 'count', base_unit: 'unit', is_active: true },
      ],
      purchase_prices: [
        { ingredient_id: 'flour', purchase_price: 45359.237, currency: 'ARS', pack_quantity: 50, pack_unit: 'lb', yield_pct: 100 }, // $2/g
        { ingredient_id: 'cheese', purchase_price: 16000, currency: 'ARS', pack_quantity: 1, pack_unit: 'lb', yield_pct: 100 }, // $1000/oz
        { ingredient_id: 'oil', purchase_price: 37854.11784, currency: 'ARS', pack_quantity: 1, pack_unit: 'gal_us', yield_pct: 100 }, // $10/ml
        { ingredient_id: 'box', purchase_price: 3600, currency: 'ARS', pack_quantity: 1, pack_unit: 'dozen', yield_pct: 100 }, // $300/unit
      ],
      recipes: [
        {
          id: 'pizza_metric',
          name: 'Pizza en Unidades Métricas',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          currency: 'ARS',
          components: [
            { component_type: 'ingredient', ingredient_id: 'flour', quantity: 0.45359237, unit: 'kg' }, // 1 lb = 453.59237g -> $907.18474
            { component_type: 'ingredient', ingredient_id: 'cheese', quantity: 113.3980925, unit: 'g' }, // 4 oz -> $4000
            { component_type: 'ingredient', ingredient_id: 'oil', quantity: 0.0295735295625, unit: 'L' }, // 1 fl_oz_us = 29.5735295625 ml -> $295.735295625
            { component_type: 'ingredient', ingredient_id: 'box', quantity: 1, unit: 'u' }, // 1 unit -> $300
          ],
        },
        {
          id: 'pizza_us',
          name: 'Pizza en Unidades US Customary',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          currency: 'ARS',
          components: [
            { component_type: 'ingredient', ingredient_id: 'flour', quantity: 1, unit: 'lb' }, // $907.18474
            { component_type: 'ingredient', ingredient_id: 'cheese', quantity: 0.25, unit: 'lb' }, // 4 oz -> $4000
            { component_type: 'ingredient', ingredient_id: 'oil', quantity: 1, unit: 'fl_oz_us' }, // $295.735295625
            { component_type: 'ingredient', ingredient_id: 'box', quantity: 1 / 12, unit: 'dozen' }, // 1 unit -> $300
          ],
        },
      ],
    };

    const engine = new CostEngine(catalog);
    const resMetric = engine.calculateRecipeCost('pizza_metric');
    const resUs = engine.calculateRecipeCost('pizza_us');

    assert.equal(resMetric.status, 'complete');
    assert.equal(resUs.status, 'complete');
    const expectedTotal = 907.18474 + 4000 + 295.735295625 + 300;
    assertClose(resMetric.raw_unit_cost, expectedTotal, 'Costo receta en unidades métricas');
    assertClose(resUs.raw_unit_cost, expectedTotal, 'Costo receta en unidades US Customary');
    assertClose(resMetric.raw_unit_cost, resUs.raw_unit_cost, 'Paridad exacta Métrico vs US Customary');
  });
});
