import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateProfitKitV2WorkbookBytes } from '../dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const demoInput = {
  businessName: 'Pizzería Demo — Il Forno',
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
      { id: 'ing_tomate', name: 'Tomate Triturado Italiano', base_dimension: 'mass', base_unit: 'g', is_active: true },
      { id: 'ing_aceite', name: 'Aceite de Oliva Virgen Extra', base_dimension: 'volume', base_unit: 'ml', density_g_per_ml: 0.92, is_active: true },
      { id: 'ing_mozzarella', name: 'Queso Mozzarella', base_dimension: 'mass', base_unit: 'g', is_active: true },
      { id: 'ing_pollo', name: 'Pollo Crudo (con merma de limpieza)', base_dimension: 'mass', base_unit: 'g', is_active: true },
      { id: 'ing_garbanzo', name: 'Harina de Garbanzo', base_dimension: 'mass', base_unit: 'g', is_active: true },
      { id: 'ing_trufa', name: 'Trufa Negra (Ejemplo sin precio cargado)', base_dimension: 'mass', base_unit: 'g', is_active: true },
    ],
    purchase_prices: [
      { ingredient_id: 'ing_harina', purchase_price: 25000, currency: 'ARS', pack_quantity: 25, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'ing_levadura', purchase_price: 5000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'ing_sal', purchase_price: 300, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'ing_tomate', purchase_price: 8000, currency: 'ARS', pack_quantity: 8, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'ing_aceite', purchase_price: 10000, currency: 'ARS', pack_quantity: 5, pack_unit: 'L', yield_pct: 100 },
      { ingredient_id: 'ing_mozzarella', purchase_price: 2000, currency: 'ARS', pack_quantity: 500, pack_unit: 'g', yield_pct: 100 },
      { ingredient_id: 'ing_pollo', purchase_price: 1000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 90 },
      { ingredient_id: 'ing_garbanzo', purchase_price: 3500, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'ing_trufa', purchase_price: null, currency: 'ARS', pack_quantity: 100, pack_unit: 'g', yield_pct: 100 },
    ],
    recipes: [
      {
        id: 'sub_masa_poolish',
        name: 'Masa con Poolish 70% (Subreceta Demo)',
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
          poolish: {
            flour_pct: 30,
            water_pct: 100,
            yeast_pct: 1.0,
            yeast_ingredient_id: 'ing_levadura',
          },
          salt_pct: 2.5,
          salt_ingredient_id: 'ing_sal',
          water_ingredient_id: 'ing_agua',
        },
      },
      {
        id: 'sub_salsa',
        name: 'Salsa Pomodoro Casa (Subreceta Demo)',
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
        name: 'Pizza Margherita Clásica (Demo)',
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
        name: 'Focaccia Rellena Producto A (CE-005 Demo)',
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
        id: 'prod_pollo_merma',
        name: 'Porción Pollo Grillado 180g con Merma 10% (CE-006 Demo)',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        target_food_cost_pct: 30,
        currency: 'ARS',
        components: [
          { component_type: 'ingredient', ingredient_id: 'ing_pollo', quantity: 180, unit: 'g' },
        ],
      },
      {
        id: 'prod_trufa_incompleta',
        name: 'Pizza Trufa Negra (Alerta Incompleta CE-007 Demo)',
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
    prod_pollo_merma: { monthlyUnitsSold: 310, sellingPrice: 2200 },
    prod_trufa_incompleta: { monthlyUnitsSold: 45, sellingPrice: null },
  },
  operatingExpenses: [
    { id: 'exp_1', name: 'Alquiler del Local (Demo)', category: 'rent', period: 'monthly', amount: 850000 },
    { id: 'exp_2', name: 'Equipo de Cocina y Salón (Demo)', category: 'payroll', period: 'monthly', amount: 1800000 },
    { id: 'exp_3', name: 'Energía Eléctrica, Gas y Agua (Demo)', category: 'utilities', period: 'monthly', amount: 320000 },
    { id: 'exp_4', name: 'Internet, Software y Contabilidad (Demo)', category: 'software', period: 'monthly', amount: 130000 },
  ],
};

export function generateProfitKitWorkbook(locale = 'es-AR') {
  return Buffer.from(generateProfitKitV2WorkbookBytes({ ...demoInput, locale }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const buf = generateProfitKitWorkbook('es-AR');
  const outRelease = path.resolve(__dirname, '../../../../docs/release/Restaurant_Profit_Kit_v1.xlsx');
  fs.mkdirSync(path.dirname(outRelease), { recursive: true });
  fs.writeFileSync(outRelease, buf);
  console.log(`Restaurant_Profit_Kit_v1.xlsx (v2 14 hojas) generado (${buf.length} bytes) en ${outRelease}`);

  const outToolsPublic = path.resolve(__dirname, '../../../apps/tools/public/Restaurant_Profit_Kit_v1.xlsx');
  fs.mkdirSync(path.dirname(outToolsPublic), { recursive: true });
  fs.writeFileSync(outToolsPublic, buf);
  console.log(`Copiado a ${outToolsPublic}`);
}
