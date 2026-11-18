import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CostEngine,
  CostEngineValidationError,
  computeUsableIngredientCost,
  generateProfitKitV2WorkbookBytes,
} from '../dist/index.js';

const TOLERANCE = 1e-9;

function assertClose(actual, expected, label, tol = TOLERANCE) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: expected ${expected}, got ${actual} (diff=${Math.abs(actual - expected)})`
  );
}

test('Tarea 1.4: Auditoría de rendimientos (yield_pct), desperdicios (mermas) y cantidades utilizables (usable_quantity)', async (t) => {
  await t.test('1. Aplicación única de merma en ingrediente directo (CE-006 y niveles 50%, 75%, 80%, 90%, 100%)', () => {
    const ing = { id: 'pollo', name: 'Pollo Fresco', base_dimension: 'mass', base_unit: 'g', is_active: true };
    for (const yieldPct of [50, 75, 80, 90, 100]) {
      const res = computeUsableIngredientCost(
        ing,
        {
          ingredient_id: 'pollo',
          purchase_price: 1000,
          currency: 'ARS',
          pack_quantity: 1,
          pack_unit: 'kg',
          yield_pct: yieldPct,
        },
        'ARS'
      );
      assert.equal(res.status, 'complete');
      assertClose(res.grossUnitCostInBase, 1.0, `grossUnitCost @ ${yieldPct}%`);
      assertClose(res.yieldFraction, yieldPct / 100, `yieldFraction @ ${yieldPct}%`);
      assertClose(res.usableUnitCostInBase, 1.0 / (yieldPct / 100), `usableUnitCost @ ${yieldPct}%`);
    }
  });

  await t.test('2. Equivalencia exacta entre yield_pct y usable_quantity', () => {
    const ing = { id: 'aceitunas', name: 'Aceitunas en Salmuera', base_dimension: 'mass', base_unit: 'g', is_active: true };
    const byPct = computeUsableIngredientCost(
      ing,
      {
        ingredient_id: 'aceitunas',
        purchase_price: 9000,
        currency: 'ARS',
        pack_quantity: 2,
        pack_unit: 'kg',
        yield_pct: 75,
      },
      'ARS'
    );
    const byUsableQty = computeUsableIngredientCost(
      ing,
      {
        ingredient_id: 'aceitunas',
        purchase_price: 9000,
        currency: 'ARS',
        pack_quantity: 2,
        pack_unit: 'kg',
        usable_quantity: 1.5,
      },
      'ARS'
    );

    assertClose(byPct.grossUnitCostInBase, 4.5, 'Costo bruto $4.50/g');
    assertClose(byUsableQty.grossUnitCostInBase, 4.5, 'Costo bruto $4.50/g');
    assertClose(byPct.yieldFraction, 0.75, 'yieldFraction por % = 0.75');
    assertClose(byUsableQty.yieldFraction, 0.75, 'yieldFraction por usable_quantity = 0.75');
    assertClose(byPct.usableUnitCostInBase, 6.0, 'Costo utilizable $6.00/g');
    assertClose(byUsableQty.usableUnitCostInBase, 6.0, 'Costo utilizable $6.00/g');
    assertClose(byPct.usableUnitCostInBase, byUsableQty.usableUnitCostInBase, 'Equivalencia exacta');
  });

  await t.test('3. No duplicación de merma al pasar de ingrediente -> subreceta -> producto final', () => {
    // Tomate: $2,000 por 1kg bruto con 80% de rendimiento limpio => 800g limpios => $2.50/g limpio
    // Subreceta Salsa: usa 800g de tomate limpio ($2,000) y rinde 800g de salsa => $2.50/g de salsa
    // Pizza: usa 100g de salsa => debe costar $250 (nunca $250 / 0.80 = $312.50)
    const catalog = {
      ingredients: [
        { id: 'tomate_fresco', name: 'Tomate Perita Fresco', base_dimension: 'mass', base_unit: 'g', is_active: true },
      ],
      purchase_prices: [
        { ingredient_id: 'tomate_fresco', purchase_price: 2000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 80 },
      ],
      recipes: [
        {
          id: 'sub_salsa',
          name: 'Salsa Tomate Fresco',
          recipe_type: 'subrecipe',
          yield_quantity: 800,
          yield_unit: 'g',
          currency: 'ARS',
          components: [{ component_type: 'ingredient', ingredient_id: 'tomate_fresco', quantity: 800, unit: 'g' }],
        },
        {
          id: 'prod_pizza',
          name: 'Pizza con Salsa',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          currency: 'ARS',
          components: [{ component_type: 'subrecipe', recipe_id: 'sub_salsa', quantity: 100, unit: 'g' }],
        },
      ],
    };

    const engine = new CostEngine(catalog);
    const subRes = engine.calculateRecipeCost('sub_salsa');
    const prodRes = engine.calculateRecipeCost('prod_pizza');

    assertClose(subRes.raw_batch_cost, 2000, 'Batch salsa = $2000');
    assertClose(subRes.raw_unit_cost, 2.5, 'Unit cost salsa = $2.50/g');
    assertClose(prodRes.raw_unit_cost, 250, '100g de salsa en pizza = $250 (merma aplicada una sola vez)');
  });

  await t.test('4. Combinación de merma de limpieza en insumo + reducción por cocción en subreceta', () => {
    // Hongos frescos: $4,000 por 1kg bruto con 80% rendimiento de limpieza => 800g limpios => $5.00/g limpio
    // Subreceta Duxelles: entra 500g de hongos limpios ($2,500) y tras reducción por cocción rinde 400g cocidos => $6.25/g cocido
    // Pizza Funghi: usa 80g de Duxelles cocida => 80 * 6.25 = $500
    const catalog = {
      ingredients: [
        { id: 'hongos', name: 'Champiñones Frescos', base_dimension: 'mass', base_unit: 'g', is_active: true },
      ],
      purchase_prices: [
        { ingredient_id: 'hongos', purchase_price: 4000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 80 },
      ],
      recipes: [
        {
          id: 'sub_duxelles',
          name: 'Hongos Salteados Reducidos',
          recipe_type: 'subrecipe',
          yield_quantity: 400,
          yield_unit: 'g',
          currency: 'ARS',
          components: [{ component_type: 'ingredient', ingredient_id: 'hongos', quantity: 500, unit: 'g' }],
        },
        {
          id: 'pizza_funghi',
          name: 'Pizza Funghi',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          currency: 'ARS',
          components: [{ component_type: 'subrecipe', recipe_id: 'sub_duxelles', quantity: 80, unit: 'g' }],
        },
      ],
    };

    const engine = new CostEngine(catalog);
    const subRes = engine.calculateRecipeCost('sub_duxelles');
    const prodRes = engine.calculateRecipeCost('pizza_funghi');

    assertClose(subRes.raw_batch_cost, 2500, '500g hongos limpios = $2500');
    assertClose(subRes.raw_unit_cost, 6.25, '400g rendimiento cocido = $6.25/g');
    assertClose(prodRes.raw_unit_cost, 500, '80g hongos cocidos en pizza = $500');
  });

  await t.test('5. Rechazo estricto de rendimientos y envases inválidos', () => {
    const ing = { id: 'carne', name: 'Carne', base_dimension: 'mass', base_unit: 'g', is_active: true };

    for (const badYield of [0, -10, 100.01, 150, Number.NaN]) {
      assert.throws(
        () =>
          computeUsableIngredientCost(
            ing,
            { ingredient_id: 'carne', purchase_price: 5000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: badYield },
            'ARS'
          ),
        (err) => err instanceof CostEngineValidationError && err.code === 'INVALID_YIELD_PCT',
        `yield_pct=${badYield} debe lanzar INVALID_YIELD_PCT`
      );
    }

    for (const badUsable of [0, -1, 2.5, Number.NaN]) {
      assert.throws(
        () =>
          computeUsableIngredientCost(
            ing,
            { ingredient_id: 'carne', purchase_price: 5000, currency: 'ARS', pack_quantity: 2, pack_unit: 'kg', usable_quantity: badUsable },
            'ARS'
          ),
        (err) => err instanceof CostEngineValidationError && err.code === 'INVALID_YIELD_PCT',
        `usable_quantity=${badUsable} sobre pack=2 debe lanzar INVALID_YIELD_PCT`
      );
    }

    for (const badPack of [0, -5, Number.NaN]) {
      assert.throws(
        () =>
          computeUsableIngredientCost(
            ing,
            { ingredient_id: 'carne', purchase_price: 5000, currency: 'ARS', pack_quantity: badPack, pack_unit: 'kg', yield_pct: 90 },
            'ARS'
          ),
        (err) => err instanceof CostEngineValidationError && err.code === 'INVALID_PACK_QUANTITY',
        `pack_quantity=${badPack} debe lanzar INVALID_PACK_QUANTITY`
      );
    }
  });

  await t.test('6. Excel v2 (Hoja 03) refleja correctamente usable_quantity convertido a % de rendimiento', () => {
    const bytes = generateProfitKitV2WorkbookBytes({
      businessName: 'Test Merma',
      currency: 'ARS',
      defaultTargetFoodCostPct: 30,
      defaultRoundingIncrement: 100,
      defaultPackagingCost: 0,
      defaultChannelFeePct: 0,
      catalog: {
        ingredients: [
          { id: 'ing_olives', name: 'Aceitunas con Salmuera', base_dimension: 'mass', base_unit: 'g', is_active: true },
        ],
        purchase_prices: [
          { ingredient_id: 'ing_olives', purchase_price: 9000, currency: 'ARS', pack_quantity: 2, pack_unit: 'kg', usable_quantity: 1.5 },
        ],
        recipes: [],
      },
    });
    const xmlText = new TextDecoder().decode(bytes);
    // En Hoja 03 fila 5: F5 = 75 (rendimiento %), G5 = 25 (merma %), H5 = 1500 (gramos limpios), J5 = 6 (costo utilizable $/g)
    assert.ok(xmlText.includes('<c r="F5" s="3"><v>75</v></c>'), 'Hoja 03 F5 debe tener rendimiento 75% derivado de usable_quantity 1.5/2');
    assert.ok(xmlText.includes('<c r="G5" s="6"><f>IF(A5=&quot;&quot;,&quot;&quot;,100-F5)</f><v>25</v></c>'), 'Hoja 03 G5 debe tener merma 25%');
    assert.ok(xmlText.includes('<c r="H5" s="4"><f>IF(A5=&quot;&quot;,&quot;&quot;,E5*(F5/100))</f><v>1500</v></c>'), 'Hoja 03 H5 debe tener cantidad utilizable 1500g');
    assert.ok(xmlText.includes('<v>6</v></c>'), 'Hoja 03 J5 debe tener costo utilizable $6/g');
  });
});
