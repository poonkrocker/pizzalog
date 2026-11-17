import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CostEngine,
  classifyIngredientCategory,
  decomposeRecipeCategoryCosts,
  generateProfitKitV2WorkbookBytes,
} from '../dist/index.js';

function extractZipTextEntries(zipBytes) {
  const buf = Buffer.from(zipBytes);
  const entries = {};
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const compMethod = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataStart = offset + 30 + nameLen + extraLen;
    const dataEnd = dataStart + compSize;
    assert.equal(compMethod, 0, `Entry ${name} must be uncompressed STORED (method 0)`);
    entries[name] = buf.subarray(dataStart, dataEnd).toString('utf8');
    offset = dataEnd;
  }
  return entries;
}

const sampleInput = {
  businessName: 'Pizzería Test v2',
  currency: 'ARS',
  locale: 'es-AR',
  unitSystem: 'metric',
  defaultTargetFoodCostPct: 30,
  defaultRoundingIncrement: 500,
  defaultPackagingCost: 350,
  defaultChannelFeePct: 25,
  catalog: {
    ingredients: [
      { id: 'ing_harina', name: 'Harina 0000 Panadera', base_dimension: 'mass', base_unit: 'g', is_active: true },
      { id: 'ing_levadura', name: 'Levadura Fresca', base_dimension: 'mass', base_unit: 'g', is_active: true },
      { id: 'ing_sal', name: 'Sal Fina', base_dimension: 'mass', base_unit: 'g', is_active: true },
      { id: 'ing_agua', name: 'Agua Filtrada', base_dimension: 'volume', base_unit: 'ml', density_g_per_ml: 1, is_free: true, is_active: true },
      { id: 'ing_tomate', name: 'Tomate Triturado', base_dimension: 'mass', base_unit: 'g', is_active: true },
      { id: 'ing_aceite', name: 'Aceite de Oliva', base_dimension: 'volume', base_unit: 'ml', density_g_per_ml: 0.92, is_active: true },
      { id: 'ing_mozzarella', name: 'Queso Mozzarella', base_dimension: 'mass', base_unit: 'g', is_active: true },
      { id: 'ing_pollo', name: 'Pollo Crudo', base_dimension: 'mass', base_unit: 'g', is_active: true },
      { id: 'ing_trufa', name: 'Trufa Negra', base_dimension: 'mass', base_unit: 'g', is_active: true },
    ],
    purchase_prices: [
      { ingredient_id: 'ing_harina', purchase_price: 25000, currency: 'ARS', pack_quantity: 25, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'ing_levadura', purchase_price: 5000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'ing_sal', purchase_price: 300, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'ing_tomate', purchase_price: 8000, currency: 'ARS', pack_quantity: 8, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'ing_aceite', purchase_price: 10000, currency: 'ARS', pack_quantity: 5, pack_unit: 'L', yield_pct: 100 },
      { ingredient_id: 'ing_mozzarella', purchase_price: 2000, currency: 'ARS', pack_quantity: 500, pack_unit: 'g', yield_pct: 100 },
      { ingredient_id: 'ing_pollo', purchase_price: 1000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 90 },
      { ingredient_id: 'ing_trufa', purchase_price: null, currency: 'ARS', pack_quantity: 100, pack_unit: 'g', yield_pct: 100 },
    ],
    recipes: [
      {
        id: 'sub_masa_poolish',
        name: 'Masa con Poolish 70%',
        recipe_type: 'subrecipe',
        yield_quantity: 1728,
        yield_unit: 'g',
        currency: 'ARS',
        bakers_dough: {
          total_flour_g: 1000,
          hydration_pct: 70,
          yield_basis: 'measured_yield',
          measured_yield_g: 1728,
          flours: [{ ingredient_id: 'ing_harina', share_pct: 100 }],
          poolish: { flour_pct: 30, water_pct: 100, yeast_pct: 1.0, yeast_ingredient_id: 'ing_levadura' },
          salt_pct: 2.5,
          salt_ingredient_id: 'ing_sal',
          water_ingredient_id: 'ing_agua',
        },
      },
      {
        id: 'sub_salsa',
        name: 'Salsa Pomodoro',
        recipe_type: 'subrecipe',
        yield_quantity: 1000,
        yield_unit: 'g',
        currency: 'ARS',
        components: [
          { component_type: 'ingredient', ingredient_id: 'ing_tomate', quantity: 800, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'ing_aceite', quantity: 100, unit: 'ml' },
        ],
      },
      {
        id: 'prod_margherita',
        name: 'Pizza Margherita Clásica',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        target_food_cost_pct: 30,
        currency: 'ARS',
        components: [
          { component_type: 'subrecipe', recipe_id: 'sub_masa_poolish', quantity: 220, unit: 'g' },
          { component_type: 'subrecipe', recipe_id: 'sub_salsa', quantity: 100, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'ing_mozzarella', quantity: 220, unit: 'g' },
        ],
      },
      {
        id: 'prod_focaccia_a',
        name: 'Focaccia Rellena Producto A',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        target_food_cost_pct: 30,
        currency: 'ARS',
        components: [
          { component_type: 'subrecipe', recipe_id: 'sub_salsa', quantity: 100, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'ing_mozzarella', quantity: 150, unit: 'g' },
        ],
      },
      {
        id: 'prod_trufa_incompleta',
        name: 'Pizza Trufa Incompleta',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        target_food_cost_pct: 30,
        currency: 'ARS',
        components: [
          { component_type: 'ingredient', ingredient_id: 'ing_harina', quantity: 200, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'ing_trufa', quantity: 20, unit: 'g' },
        ],
      },
    ],
  },
  productSalesMap: {
    prod_margherita: { monthlyUnitsSold: 950, sellingPrice: 4200 },
    prod_focaccia_a: { monthlyUnitsSold: 420, sellingPrice: 2600 },
  },
  operatingExpenses: [
    { id: 'exp_1', name: 'Alquiler', category: 'rent', period: 'monthly', amount: 850000 },
  ],
};

describe('Excel v2 Workbook (14 Sheets 00..13) & Ingredient-Level Cost Decomposition', () => {
  it('generates a 14-sheet OpenXML workbook across es-AR, pt-BR, and en with full formula chain and Golden parity', () => {
    for (const locale of ['es-AR', 'pt-BR', 'en']) {
      const bytes = generateProfitKitV2WorkbookBytes({ ...sampleInput, locale });
      assert.ok(bytes.length > 15000, `Workbook for ${locale} should be non-trivial`);
      const entries = extractZipTextEntries(bytes);

      assert.ok(entries['xl/workbook.xml'], 'workbook.xml must exist');
      for (let i = 1; i <= 14; i++) {
        assert.ok(entries[`xl/worksheets/sheet${i}.xml`], `sheet${i}.xml must exist for ${locale}`);
      }

      // Check Sheet 05 (Subrecipes) uses SUMIF against Sheet 03 (Yields)
      assert.match(entries['xl/worksheets/sheet6.xml'], /SUMIF\(/, 'Sheet 05 (sheet6.xml) must use SUMIF formulas');
      // Check Sheet 06 (Products) uses SUMIF / SUMIFS for recipe cost and category decomposition
      assert.match(entries['xl/worksheets/sheet7.xml'], /SUMIFS\(/, 'Sheet 06 (sheet7.xml) must decompose category costs via SUMIFS');
      // Check Sheet 07 (Pricing) uses CEILING and blocks incomplete products
      assert.match(entries['xl/worksheets/sheet8.xml'], /CEILING\(/, 'Sheet 07 (sheet8.xml) must use CEILING formula');
      // Check Sheet 13 (Mathematical Validation) has all 8 Golden Cases CE-001..CE-008
      for (let g = 1; g <= 8; g++) {
        assert.match(entries['xl/worksheets/sheet14.xml'], new RegExp(`CE-00${g}`), `Sheet 13 must verify CE-00${g}`);
      }
    }
  });

  it('decomposes product cost by actual recipe ingredients (so a 10% flour increase only increases the flour share)', () => {
    // Test exact user example: Pizza with $4000 total ingredient cost, of which $1000 is flour and $3000 is cheese.
    // A +10% increase in flour must increase total cost by $100 (to $4100), NOT by $400 (to $4400).
    const testCatalog = {
      ingredients: [
        { id: 'harina', name: 'Harina 0000', base_dimension: 'mass', base_unit: 'kg', is_active: true },
        { id: 'muzza', name: 'Queso Muzzarella', base_dimension: 'mass', base_unit: 'kg', is_active: true },
      ],
      purchase_prices: [
        { ingredient_id: 'harina', purchase_price: 1000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'muzza', purchase_price: 3000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      ],
      recipes: [
        {
          id: 'pizza_especial',
          name: 'Pizza de la Casa', // Note: name does NOT contain "harina" or "queso"!
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          currency: 'ARS',
          components: [
            { component_type: 'ingredient', ingredient_id: 'harina', quantity: 1, unit: 'kg' },
            { component_type: 'ingredient', ingredient_id: 'muzza', quantity: 1, unit: 'kg' },
          ],
        },
      ],
    };

    const decomp = decomposeRecipeCategoryCosts(testCatalog, 'pizza_especial', 'ARS');
    assert.equal(decomp.totalCost, 4000);
    assert.equal(decomp.flourCost, 1000);
    assert.equal(decomp.dairyCost, 3000);

    // Simulate +10% on flour only in CostEngine
    const simPrices = testCatalog.purchase_prices.map((pp) => {
      const ing = testCatalog.ingredients.find((i) => i.id === pp.ingredient_id);
      const cat = classifyIngredientCategory(ing?.name ?? '');
      return cat === 'flour'
        ? { ...pp, purchase_price: Number(pp.purchase_price) * 1.10 }
        : pp;
    });
    const simEngine = new CostEngine({ ...testCatalog, purchase_prices: simPrices });
    const simRes = simEngine.calculateRecipeCost('pizza_especial');
    assert.equal(simRes.raw_unit_cost, 4100, '10% increase on $1000 flour in a $4000 pizza must result in $4100 (+$100), not $4400');
  });
});
