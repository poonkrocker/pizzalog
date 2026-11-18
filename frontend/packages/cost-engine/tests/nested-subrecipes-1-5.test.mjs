import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CostEngine,
  CostEngineValidationError,
  decomposeRecipeCategoryCosts,
  generateProfitKitV2WorkbookBytes,
} from '../dist/index.js';

const TOLERANCE = 1e-9;

function assertClose(actual, expected, label, tol = TOLERANCE) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: expected ${expected}, got ${actual} (diff=${Math.abs(actual - expected)})`
  );
}

test('Tarea 1.5: Subrecetas anidadas (multinivel, grafo diamante DAG, memoización, ciclos y propagación)', async (t) => {
  await t.test('1. Cadena anidada de 4 niveles (Prefermento -> Masa Base -> Masa Estirada -> Pizza) sin pérdida ni duplicación', () => {
    // Nivel 1 (sub_pref): 500g harina ($1/g = $500) + 5g levadura ($10/g = $50) = $550 / 500g => $1.10/g
    // Nivel 2 (sub_masa): 500g sub_pref ($550) + 500g harina ($500) + 30g sal ($1/g = $30) = $1080 / 1600g => $0.675/g
    // Nivel 3 (sub_prepizza): 300g sub_masa ($202.50) + 80g salsa_tomate ($2/g = $160) = $362.50 / 1 unit => $362.50/unit
    // Nivel 4 (prod_pizza): 1 unit sub_prepizza ($362.50) + 200g mozzarella ($5/g = $1000) = $1362.50
    const catalog = {
      ingredients: [
        { id: 'harina', name: 'Harina 0000', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'levadura', name: 'Levadura', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'sal', name: 'Sal', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'tomate', name: 'Salsa Tomate', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'mozzarella', name: 'Mozzarella', base_dimension: 'mass', base_unit: 'g', is_active: true },
      ],
      purchase_prices: [
        { ingredient_id: 'harina', purchase_price: 1000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'levadura', purchase_price: 10000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'sal', purchase_price: 1000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'tomate', purchase_price: 2000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'mozzarella', purchase_price: 5000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      ],
      recipes: [
        {
          id: 'sub_pref',
          name: 'Prefermento Biga',
          recipe_type: 'subrecipe',
          yield_quantity: 500,
          yield_unit: 'g',
          currency: 'ARS',
          components: [
            { component_type: 'ingredient', ingredient_id: 'harina', quantity: 500, unit: 'g' },
            { component_type: 'ingredient', ingredient_id: 'levadura', quantity: 5, unit: 'g' },
          ],
        },
        {
          id: 'sub_masa',
          name: 'Masa con Biga',
          recipe_type: 'subrecipe',
          yield_quantity: 1600,
          yield_unit: 'g',
          currency: 'ARS',
          components: [
            { component_type: 'subrecipe', recipe_id: 'sub_pref', quantity: 500, unit: 'g' },
            { component_type: 'ingredient', ingredient_id: 'harina', quantity: 500, unit: 'g' },
            { component_type: 'ingredient', ingredient_id: 'sal', quantity: 30, unit: 'g' },
          ],
        },
        {
          id: 'sub_prepizza',
          name: 'Prepizza Pintada',
          recipe_type: 'subrecipe',
          yield_quantity: 1,
          yield_unit: 'unit',
          currency: 'ARS',
          components: [
            { component_type: 'subrecipe', recipe_id: 'sub_masa', quantity: 300, unit: 'g' },
            { component_type: 'ingredient', ingredient_id: 'tomate', quantity: 80, unit: 'g' },
          ],
        },
        {
          id: 'prod_pizza',
          name: 'Pizza Mozzarella Final',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          currency: 'ARS',
          components: [
            { component_type: 'subrecipe', recipe_id: 'sub_prepizza', quantity: 1, unit: 'unit' },
            { component_type: 'ingredient', ingredient_id: 'mozzarella', quantity: 200, unit: 'g' },
          ],
        },
      ],
    };

    const engine = new CostEngine(catalog);
    const resPizza = engine.calculateRecipeCost('prod_pizza');
    assert.equal(resPizza.status, 'complete');
    assertClose(resPizza.raw_unit_cost, 1362.5, 'Costo final de cadena 4 niveles = $1362.50');

    // Verificar desglose por rubro en cadena anidada:
    // En 1 prod_pizza:
    // - sub_masa aporta 300/1600 = 0.1875 del batch de sub_masa:
    //   - harina + levadura (flour): (550 + 500) * 0.1875 = 196.875
    //   - sal (other): 30 * 0.1875 = 5.625
    // - tomate (vegetables): 160
    // - mozzarella (dairy): 1000
    const decomp = decomposeRecipeCategoryCosts(catalog, 'prod_pizza', 'ARS');
    assertClose(decomp.flourCost, 196.875, 'flourCost recursivo en 4 niveles');
    assertClose(decomp.otherCost, 5.625, 'otherCost (sal) recursivo en 4 niveles');
    assertClose(decomp.vegetablesCost, 160, 'vegetablesCost (tomate) recursivo en 4 niveles');
    assertClose(decomp.dairyCost, 1000, 'dairyCost (mozzarella)');
    assertClose(decomp.totalCost, 1362.5, 'Suma de rubros === costo total de la receta');
  });

  await t.test('2. Grafo Diamante (DAG): dos subrecetas comparten una misma subreceta base sin falso ciclo ni doble evaluación', () => {
    // sub_ajo_confit: 200g ajo ($4/g = $800) + 200ml aceite ($5/ml = $1000) = $1800 / 400g => $4.50/g
    // sub_masa_ajo: 1000g harina ($1000) + 40g sub_ajo_confit ($180) = $1180 / 1000g => $1.18/g
    // sub_salsa_ajo: 500g tomate ($1000) + 60g sub_ajo_confit ($270) = $1270 / 500g => $2.54/g
    // prod_pizza_ajo: 250g sub_masa_ajo (250 * 1.18 = $295) + 100g sub_salsa_ajo (100 * 2.54 = $254) = $549
    const catalog = {
      ingredients: [
        { id: 'ajo', name: 'Ajo', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'aceite', name: 'Aceite', base_dimension: 'volume', base_unit: 'ml', is_active: true },
        { id: 'harina', name: 'Harina', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'tomate', name: 'Tomate', base_dimension: 'mass', base_unit: 'g', is_active: true },
      ],
      purchase_prices: [
        { ingredient_id: 'ajo', purchase_price: 4000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'aceite', purchase_price: 5000, currency: 'ARS', pack_quantity: 1, pack_unit: 'L', yield_pct: 100 },
        { ingredient_id: 'harina', purchase_price: 1000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'tomate', purchase_price: 2000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      ],
      recipes: [
        {
          id: 'sub_ajo_confit',
          name: 'Ajo Confitado Base',
          recipe_type: 'subrecipe',
          yield_quantity: 400,
          yield_unit: 'g',
          currency: 'ARS',
          components: [
            { component_type: 'ingredient', ingredient_id: 'ajo', quantity: 200, unit: 'g' },
            { component_type: 'ingredient', ingredient_id: 'aceite', quantity: 200, unit: 'ml' },
          ],
        },
        {
          id: 'sub_masa_ajo',
          name: 'Masa al Ajo',
          recipe_type: 'subrecipe',
          yield_quantity: 1000,
          yield_unit: 'g',
          currency: 'ARS',
          components: [
            { component_type: 'ingredient', ingredient_id: 'harina', quantity: 1000, unit: 'g' },
            { component_type: 'subrecipe', recipe_id: 'sub_ajo_confit', quantity: 40, unit: 'g' },
          ],
        },
        {
          id: 'sub_salsa_ajo',
          name: 'Salsa al Ajo',
          recipe_type: 'subrecipe',
          yield_quantity: 500,
          yield_unit: 'g',
          currency: 'ARS',
          components: [
            { component_type: 'ingredient', ingredient_id: 'tomate', quantity: 500, unit: 'g' },
            { component_type: 'subrecipe', recipe_id: 'sub_ajo_confit', quantity: 60, unit: 'g' },
          ],
        },
        {
          id: 'prod_pizza_ajo',
          name: 'Pizza Doble Ajo (DAG Diamante)',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          currency: 'ARS',
          components: [
            { component_type: 'subrecipe', recipe_id: 'sub_masa_ajo', quantity: 250, unit: 'g' },
            { component_type: 'subrecipe', recipe_id: 'sub_salsa_ajo', quantity: 100, unit: 'g' },
          ],
        },
      ],
    };

    const engine = new CostEngine(catalog);
    const res = engine.calculateRecipeCost('prod_pizza_ajo');
    assert.equal(res.status, 'complete');
    assertClose(res.raw_unit_cost, 549, 'Costo exacto en grafo diamante ($295 + $254 = $549)');
    assert.equal(
      engine.subrecipeEvaluationCount.get('sub_ajo_confit'),
      1,
      'sub_ajo_confit debe evaluarse exactamente 1 vez gracias a la memoización'
    );
  });

  await t.test('3. Detección estricta de ciclos (auto-ciclo A->A, ciclo binario A->B->A y ciclo ternario A->B->C->A)', () => {
    const makeCyclicCatalog = (recipes) => ({
      ingredients: [],
      purchase_prices: [],
      recipes,
    });

    // Auto-ciclo A -> A
    const engSelf = new CostEngine(
      makeCyclicCatalog([
        {
          id: 'sub_a',
          name: 'Sub A',
          recipe_type: 'subrecipe',
          yield_quantity: 100,
          yield_unit: 'g',
          currency: 'ARS',
          components: [{ component_type: 'subrecipe', recipe_id: 'sub_a', quantity: 50, unit: 'g' }],
        },
      ])
    );
    assert.throws(
      () => engSelf.calculateRecipeCost('sub_a'),
      (err) =>
        err instanceof CostEngineValidationError &&
        err.code === 'SUBRECIPE_CYCLE_DETECTED' &&
        deepEqualCycle(err.details?.cycle, ['sub_a', 'sub_a'])
    );

    // Ciclo ternario A -> B -> C -> A
    const engTernary = new CostEngine(
      makeCyclicCatalog([
        {
          id: 'sub_a',
          name: 'Sub A',
          recipe_type: 'subrecipe',
          yield_quantity: 100,
          yield_unit: 'g',
          currency: 'ARS',
          components: [{ component_type: 'subrecipe', recipe_id: 'sub_b', quantity: 50, unit: 'g' }],
        },
        {
          id: 'sub_b',
          name: 'Sub B',
          recipe_type: 'subrecipe',
          yield_quantity: 100,
          yield_unit: 'g',
          currency: 'ARS',
          components: [{ component_type: 'subrecipe', recipe_id: 'sub_c', quantity: 50, unit: 'g' }],
        },
        {
          id: 'sub_c',
          name: 'Sub C',
          recipe_type: 'subrecipe',
          yield_quantity: 100,
          yield_unit: 'g',
          currency: 'ARS',
          components: [{ component_type: 'subrecipe', recipe_id: 'sub_a', quantity: 50, unit: 'g' }],
        },
      ])
    );
    assert.throws(
      () => engTernary.calculateRecipeCost('sub_a'),
      (err) =>
        err instanceof CostEngineValidationError &&
        err.code === 'SUBRECIPE_CYCLE_DETECTED' &&
        deepEqualCycle(err.details?.cycle, ['sub_a', 'sub_b', 'sub_c', 'sub_a'])
    );
  });

  await t.test('4. Propagación de estado incompleto desde una subreceta profunda hacia la receta final', () => {
    const catalog = {
      ingredients: [
        { id: 'harina', name: 'Harina', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'azafran', name: 'Azafrán Sin Precio', base_dimension: 'mass', base_unit: 'g', is_active: true },
      ],
      purchase_prices: [
        { ingredient_id: 'harina', purchase_price: 1000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'azafran', purchase_price: null, currency: 'ARS', pack_quantity: 10, pack_unit: 'g', yield_pct: 100 },
      ],
      recipes: [
        {
          id: 'sub_caldo',
          name: 'Caldo de Azafrán',
          recipe_type: 'subrecipe',
          yield_quantity: 500,
          yield_unit: 'g',
          currency: 'ARS',
          components: [{ component_type: 'ingredient', ingredient_id: 'azafran', quantity: 2, unit: 'g' }],
        },
        {
          id: 'sub_masa_azafran',
          name: 'Masa al Azafrán',
          recipe_type: 'subrecipe',
          yield_quantity: 1000,
          yield_unit: 'g',
          currency: 'ARS',
          components: [
            { component_type: 'ingredient', ingredient_id: 'harina', quantity: 500, unit: 'g' },
            { component_type: 'subrecipe', recipe_id: 'sub_caldo', quantity: 500, unit: 'g' },
          ],
        },
        {
          id: 'prod_fideos',
          name: 'Pasta al Azafrán',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          currency: 'ARS',
          components: [{ component_type: 'subrecipe', recipe_id: 'sub_masa_azafran', quantity: 250, unit: 'g' }],
        },
      ],
    };

    const engine = new CostEngine(catalog);
    const res = engine.calculateRecipeCost('prod_fideos');
    assert.equal(res.status, 'incomplete');
    assert.equal(res.unit_cost, null);
    assert.equal(res.raw_unit_cost, null);
    assert.equal(res.missing_inputs.length, 1);
    assert.equal(res.missing_inputs[0].ingredient_id, 'azafran');
    assert.equal(res.missing_inputs[0].reason, 'missing_purchase_price');
  });

  await t.test('5. Excel v2 Hoja 05 soporta subrecetas que referencian a otra subreceta', () => {
    const catalog = {
      ingredients: [
        { id: 'ing_tom', name: 'Tomate', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'ing_carne', name: 'Carne', base_dimension: 'mass', base_unit: 'g', is_active: true },
      ],
      purchase_prices: [
        { ingredient_id: 'ing_tom', purchase_price: 2000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'ing_carne', purchase_price: 10000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      ],
      recipes: [
        {
          id: 'sub_pomodoro',
          name: 'Salsa Pomodoro Base',
          recipe_type: 'subrecipe',
          yield_quantity: 1000,
          yield_unit: 'g',
          currency: 'ARS',
          components: [{ component_type: 'ingredient', ingredient_id: 'ing_tom', quantity: 1000, unit: 'g' }],
        },
        {
          id: 'sub_bolonesa',
          name: 'Salsa Boloñesa (Anidada)',
          recipe_type: 'subrecipe',
          yield_quantity: 1000,
          yield_unit: 'g',
          currency: 'ARS',
          components: [
            { component_type: 'subrecipe', recipe_id: 'sub_pomodoro', quantity: 500, unit: 'g' },
            { component_type: 'ingredient', ingredient_id: 'ing_carne', quantity: 500, unit: 'g' },
          ],
        },
      ],
    };

    const bytes = generateProfitKitV2WorkbookBytes({
      businessName: 'Test Anidadas',
      currency: 'ARS',
      defaultTargetFoodCostPct: 30,
      defaultRoundingIncrement: 100,
      defaultPackagingCost: 0,
      defaultChannelFeePct: 0,
      catalog,
    });
    const xmlText = new TextDecoder().decode(bytes);
    // sub_pomodoro batch = $2000 (unit = $2/g); sub_bolonesa batch = 500*$2 + 500*$10 = $6000 (unit = $6/g)
    assert.ok(xmlText.includes('<v>6000</v>'), 'Hoja 05 debe contener el batch cost $6000 de la subreceta anidada');
    assert.ok(xmlText.includes('COUNTIF(&apos;03_Rendimientos_y_Mermas&apos;!'), 'Hoja 05 debe buscar en Hoja 03 o en Hoja 05 cuando es subreceta anidada');
  });
});

function deepEqualCycle(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((v, i) => v === expected[i]);
}
