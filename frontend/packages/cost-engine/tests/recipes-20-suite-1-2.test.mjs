import test from 'node:test';
import assert from 'node:assert/strict';
import { CostEngine, calculatePricingScenario } from '../dist/index.js';

const TOLERANCE = 1e-6;

function assertClose(actual, expected, label, tol = TOLERANCE) {
  assert.notEqual(actual, null, `${label}: expected number ${expected}, got null`);
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: expected ${expected}, got ${actual} (diff=${Math.abs(actual - expected)})`
  );
}

/**
 * Catálogo maestro independiente para las 22 recetas de prueba (Tarea 1.2)
 * Todos los valores esperados están calculados analíticamente de forma independiente.
 */
function buildMasterTestCatalog() {
  return {
    as_of_date: '2026-11-15',
    exchange_rates: [
      { from_currency: 'USD', to_currency: 'ARS', rate: 1000, effective_date: '2026-11-01' },
    ],
    ingredients: [
      // Harinas y panadería
      { id: 'harina_0000', name: 'Harina 0000', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $20,000 / 25kg = $0.80/g
      { id: 'harina_fuerza', name: 'Harina Fuerza W380', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $30,000 / 25kg = $1.20/g
      { id: 'semola', name: 'Sémola Rimacinata', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $10,000 / 5kg = $2.00/g
      { id: 'harina_centeno', name: 'Harina de Centeno', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $6,000 / 5kg = $1.20/g
      { id: 'harina_garbanzo', name: 'Harina de Garbanzo', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $3,500 / 1kg = $3.50/g
      { id: 'levadura_fresca', name: 'Levadura Fresca', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $5,000 / 500g = $10.00/g
      { id: 'sal_fina', name: 'Sal Fina', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $1,000 / 1kg = $1.00/g
      { id: 'sal_marina', name: 'Sal Marina Gruesa', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $2,000 / 1kg = $2.00/g
      { id: 'agua_filtrada', name: 'Agua Filtrada', base_dimension: 'volume', base_unit: 'ml', density_g_per_ml: 1.0, is_free: true, is_active: true }, // $0

      // Aceites, vegetales y especias
      { id: 'aceite_oliva', name: 'Aceite de Oliva Extra Virgen', base_dimension: 'volume', base_unit: 'ml', density_g_per_ml: 0.92, is_active: true }, // $25,000 / 5L = $5.00/ml
      { id: 'tomate_san_marzano', name: 'Tomate San Marzano Lata', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $4,750 / 2.5kg @ 95% yield => 2375g usable => $2.00/g
      { id: 'ajo_fresco', name: 'Ajo Fresco Pelado', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $3,400 / 1kg @ 85% yield => 850g usable => $4.00/g
      { id: 'albahaca', name: 'Albahaca Fresca', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $1,500 / 200g @ 75% yield => 150g usable => $10.00/g
      { id: 'cebolla', name: 'Cebolla Blanca', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $8,000 / 10kg @ 80% yield => 8000g usable => $1.00/g
      { id: 'cebolla_morada', name: 'Cebolla Morada', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $1,700 / 1kg @ 85% yield => 850g usable => $2.00/g
      { id: 'oregano', name: 'Orégano Seco', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $4,000 / 500g = $8.00/g
      { id: 'pimienta', name: 'Pimienta Negra Molida', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $6,000 / 500g = $12.00/g
      { id: 'romero', name: 'Romero Fresco', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $700 / 100g @ 70% yield => 70g usable => $10.00/g
      { id: 'aceitunas_negras', name: 'Aceitunas Negras Descarozadas', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $9,000 / 2kg con usable_quantity 1.5kg = $6.00/g
      { id: 'lechuga_romana', name: 'Lechuga Romana', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $1,400 / 1kg @ 70% yield => 700g usable => $2.00/g

      // Lácteos y quesos
      { id: 'mozzarella', name: 'Queso Mozzarella', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $25,000 / 5kg = $5.00/g
      { id: 'fior_di_latte', name: 'Fior di Latte', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $9,200 / 1kg @ 92% yield => 920g usable => $10.00/g
      { id: 'gorgonzola', name: 'Queso Gorgonzola', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $11,400 / 1kg @ 95% yield => 950g usable => $12.00/g
      { id: 'fontina', name: 'Queso Fontina', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $9,000 / 1kg = $9.00/g
      { id: 'parmesano', name: 'Queso Parmesano Reggiano', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $13,500 / 1kg @ 90% yield => 900g usable => $15.00/g
      { id: 'ricota', name: 'Ricota Entera', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $4,000 / 1kg = $4.00/g
      { id: 'mascarpone', name: 'Queso Mascarpone', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $12,000 / 1kg = $12.00/g
      { id: 'leche_entera', name: 'Leche Entera', base_dimension: 'volume', base_unit: 'ml', density_g_per_ml: 1.03, is_active: true }, // $1,500 / 1L = $1.50/ml
      { id: 'manteca', name: 'Manteca', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $8,000 / 1kg = $8.00/g

      // Carnes y fiambres
      { id: 'jamon_cocido', name: 'Jamón Cocido Natural', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $9,600 / 1kg @ 96% yield => 960g usable => $10.00/g
      { id: 'salame_milan', name: 'Salame Milán', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $11,000 / 1kg = $11.00/g
      { id: 'pollo_pechuga', name: 'Pechuga de Pollo', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $6,400 / 1kg @ 80% yield => 800g usable => $8.00/g
      { id: 'carne_vacuna', name: 'Carne Vacuna Roosbeef', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $8,500 / 1kg @ 85% yield => 850g usable => $10.00/g

      // Otros, huevos, salsas, postres y bebidas
      { id: 'salsa_bbq', name: 'Salsa BBQ Ahumada', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $4,000 / 1kg = $4.00/g
      { id: 'huevo', name: 'Huevo de Campo', base_dimension: 'count', base_unit: 'unit', unit_weight_g: 50, is_active: true }, // $2,400 / 1 dozen (12u) = $200.00/unit ($4.00/g)
      { id: 'tapa_empanada', name: 'Tapa de Empanada Criolla', base_dimension: 'count', base_unit: 'unit', is_active: true }, // $1,200 / 1 dozen (12u) = $100.00/unit
      { id: 'pasta_lasana', name: 'Láminas Pasta Seca Lasaña', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $3,000 / 500g = $6.00/g
      { id: 'vino_tinto', name: 'Vino Tinto Cocina', base_dimension: 'volume', base_unit: 'ml', is_active: true }, // $3,000 / 750ml = $4.00/ml
      { id: 'croutons', name: 'Croutons Tostados', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $5,000 / 1kg = $5.00/g
      { id: 'aderezo_caesar', name: 'Aderezo Caesar', base_dimension: 'volume', base_unit: 'ml', density_g_per_ml: 1.0, is_active: true }, // $6,000 / 1L = $6.00/ml
      { id: 'azucar', name: 'Azúcar Blanca', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $1,500 / 1kg = $1.50/g
      { id: 'cafe_espresso', name: 'Café Espresso Líquido', base_dimension: 'volume', base_unit: 'ml', is_active: true }, // $3,000 / 1L = $3.00/ml
      { id: 'vainillas', name: 'Galletas Vainillas', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $4,000 / 500g = $8.00/g
      { id: 'cacao_amargo', name: 'Cacao Amargo Puro', base_dimension: 'mass', base_unit: 'g', is_active: true }, // $15,000 / 1kg = $15.00/g
      { id: 'queso_caju_usd', name: 'Queso Vegano de Cajú Importado', base_dimension: 'mass', base_unit: 'g', is_active: true }, // USD 12 / 1kg @ FX 1000 = ARS 12,000 / 1000g = $12.00/g
      { id: 'gaseosa_lata', name: 'Gaseosa Lata 354ml', base_dimension: 'count', base_unit: 'unit', is_active: true }, // $12,000 / 12u = $1,000/unit
      { id: 'ficha_impresa', name: 'Ficha Impresa de Receta', base_dimension: 'count', base_unit: 'unit', is_active: true }, // $500/unit (pero excluded_from_cost en REC-20)
      { id: 'trufa_sin_precio', name: 'Trufa Blanca Sin Precio', base_dimension: 'mass', base_unit: 'g', is_active: true }, // purchase_price: null
    ],
    purchase_prices: [
      { ingredient_id: 'harina_0000', purchase_price: 20000, currency: 'ARS', pack_quantity: 25, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'harina_fuerza', purchase_price: 30000, currency: 'ARS', pack_quantity: 25, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'semola', purchase_price: 10000, currency: 'ARS', pack_quantity: 5, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'harina_centeno', purchase_price: 6000, currency: 'ARS', pack_quantity: 5, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'harina_garbanzo', purchase_price: 3500, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'levadura_fresca', purchase_price: 5000, currency: 'ARS', pack_quantity: 500, pack_unit: 'g', yield_pct: 100 },
      { ingredient_id: 'sal_fina', purchase_price: 1000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'sal_marina', purchase_price: 2000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'aceite_oliva', purchase_price: 25000, currency: 'ARS', pack_quantity: 5, pack_unit: 'L', yield_pct: 100 },
      { ingredient_id: 'tomate_san_marzano', purchase_price: 4750, currency: 'ARS', pack_quantity: 2.5, pack_unit: 'kg', yield_pct: 95 },
      { ingredient_id: 'ajo_fresco', purchase_price: 3400, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 85 },
      { ingredient_id: 'albahaca', purchase_price: 1500, currency: 'ARS', pack_quantity: 200, pack_unit: 'g', yield_pct: 75 },
      { ingredient_id: 'cebolla', purchase_price: 8000, currency: 'ARS', pack_quantity: 10, pack_unit: 'kg', yield_pct: 80 },
      { ingredient_id: 'cebolla_morada', purchase_price: 1700, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 85 },
      { ingredient_id: 'oregano', purchase_price: 4000, currency: 'ARS', pack_quantity: 500, pack_unit: 'g', yield_pct: 100 },
      { ingredient_id: 'pimienta', purchase_price: 6000, currency: 'ARS', pack_quantity: 500, pack_unit: 'g', yield_pct: 100 },
      { ingredient_id: 'romero', purchase_price: 700, currency: 'ARS', pack_quantity: 100, pack_unit: 'g', yield_pct: 70 },
      { ingredient_id: 'aceitunas_negras', purchase_price: 9000, currency: 'ARS', pack_quantity: 2, pack_unit: 'kg', usable_quantity: 1.5 },
      { ingredient_id: 'lechuga_romana', purchase_price: 1400, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 70 },
      { ingredient_id: 'mozzarella', purchase_price: 25000, currency: 'ARS', pack_quantity: 5, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'fior_di_latte', purchase_price: 9200, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 92 },
      { ingredient_id: 'gorgonzola', purchase_price: 11400, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 95 },
      { ingredient_id: 'fontina', purchase_price: 9000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'parmesano', purchase_price: 13500, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 90 },
      { ingredient_id: 'ricota', purchase_price: 4000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'mascarpone', purchase_price: 12000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'leche_entera', purchase_price: 1500, currency: 'ARS', pack_quantity: 1, pack_unit: 'L', yield_pct: 100 },
      { ingredient_id: 'manteca', purchase_price: 8000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'jamon_cocido', purchase_price: 9600, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 96 },
      { ingredient_id: 'salame_milan', purchase_price: 11000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'pollo_pechuga', purchase_price: 6400, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 80 },
      { ingredient_id: 'carne_vacuna', purchase_price: 8500, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 85 },
      { ingredient_id: 'salsa_bbq', purchase_price: 4000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'huevo', purchase_price: 2400, currency: 'ARS', pack_quantity: 1, pack_unit: 'dozen', yield_pct: 100 },
      { ingredient_id: 'tapa_empanada', purchase_price: 1200, currency: 'ARS', pack_quantity: 1, pack_unit: 'dozen', yield_pct: 100 },
      { ingredient_id: 'pasta_lasana', purchase_price: 3000, currency: 'ARS', pack_quantity: 500, pack_unit: 'g', yield_pct: 100 },
      { ingredient_id: 'vino_tinto', purchase_price: 3000, currency: 'ARS', pack_quantity: 750, pack_unit: 'ml', yield_pct: 100 },
      { ingredient_id: 'croutons', purchase_price: 5000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'aderezo_caesar', purchase_price: 6000, currency: 'ARS', pack_quantity: 1, pack_unit: 'L', yield_pct: 100 },
      { ingredient_id: 'azucar', purchase_price: 1500, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'cafe_espresso', purchase_price: 3000, currency: 'ARS', pack_quantity: 1, pack_unit: 'L', yield_pct: 100 },
      { ingredient_id: 'vainillas', purchase_price: 4000, currency: 'ARS', pack_quantity: 500, pack_unit: 'g', yield_pct: 100 },
      { ingredient_id: 'cacao_amargo', purchase_price: 15000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'queso_caju_usd', purchase_price: 12, currency: 'USD', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'gaseosa_lata', purchase_price: 12000, currency: 'ARS', pack_quantity: 1, pack_unit: 'dozen', yield_pct: 100 },
      { ingredient_id: 'ficha_impresa', purchase_price: 500, currency: 'ARS', pack_quantity: 1, pack_unit: 'unit', yield_pct: 100 },
      { ingredient_id: 'trufa_sin_precio', purchase_price: null, currency: 'ARS', pack_quantity: 100, pack_unit: 'g', yield_pct: 100 },
    ],
    recipes: [
      // REC-01: Masa Napolitana Directa (bakers_dough, flour_plus_water)
      // 1000g harina_0000 ($800) + 650g agua ($0) + 30g sal ($30) + 2g levadura ($20) = $850
      // Yield (flour_plus_water) = 1650g => unit_cost = 850 / 1650 = 0.5151515151515151 $/g
      {
        id: 'REC-01',
        name: 'Masa Napolitana Directa 65%',
        recipe_type: 'subrecipe',
        yield_quantity: 1650,
        yield_unit: 'g',
        currency: 'ARS',
        bakers_dough: {
          total_flour_g: 1000,
          hydration_pct: 65,
          yield_basis: 'flour_plus_water',
          flours: [{ ingredient_id: 'harina_0000', share_pct: 100 }],
          salt_pct: 3,
          salt_ingredient_id: 'sal_fina',
          direct_yeast_pct: 0.2,
          yeast_ingredient_id: 'levadura_fresca',
          water_ingredient_id: 'agua_filtrada',
        },
      },

      // REC-02: Masa Romana con Biga 40% y Blend de 3 Harinas (measured_yield = 1700g)
      // Total flour = 1000g: 500g 0000 ($400) + 300g Fuerza ($360) + 200g Sémola ($400) = $1160
      // Biga: 40% flour (400g), 1% yeast sobre biga_flour = 4g levadura ($40)
      // Sal: 2.5% = 25g ($25). Agua gratis ($0).
      // Batch cost = 1160 + 40 + 25 = $1225. Yield = 1700g => unit_cost = 1225 / 1700 = 0.7205882352941176 $/g
      {
        id: 'REC-02',
        name: 'Masa Romana con Biga 40% (Blend 3 Harinas)',
        recipe_type: 'subrecipe',
        yield_quantity: 1700,
        yield_unit: 'g',
        currency: 'ARS',
        bakers_dough: {
          total_flour_g: 1000,
          hydration_pct: 70,
          yield_basis: 'measured_yield',
          measured_yield_g: 1700,
          flours: [
            { ingredient_id: 'harina_0000', share_pct: 50 },
            { ingredient_id: 'harina_fuerza', share_pct: 30 },
            { ingredient_id: 'semola', share_pct: 20 },
          ],
          biga: {
            flour_pct: 40,
            water_pct: 45,
            yeast_pct: 1,
            yeast_ingredient_id: 'levadura_fresca',
          },
          salt_pct: 2.5,
          salt_ingredient_id: 'sal_fina',
          water_ingredient_id: 'agua_filtrada',
        },
      },

      // REC-03: Masa NY Style con Poolish 30% y Aceite (total_formula)
      // 1000g harina_fuerza ($1200) + 620g agua ($0) + Poolish yeast: 300g * 0.5% = 1.5g levadura ($15)
      // + 25g sal ($25) + 23g aceite_oliva (23g / 0.92g/ml = 25ml @ $5/ml = $125)
      // Batch cost = 1200 + 15 + 25 + 125 = $1365
      // Yield (total_formula) = 1000 + 620 + 1.5 + 25 + 23 = 1669.5g
      {
        id: 'REC-03',
        name: 'Masa NY Style con Poolish 30%',
        recipe_type: 'subrecipe',
        yield_quantity: 1669.5,
        yield_unit: 'g',
        currency: 'ARS',
        bakers_dough: {
          total_flour_g: 1000,
          hydration_pct: 62,
          yield_basis: 'total_formula',
          flours: [{ ingredient_id: 'harina_fuerza', share_pct: 100 }],
          poolish: {
            flour_pct: 30,
            water_pct: 100,
            yeast_pct: 0.5,
            yeast_ingredient_id: 'levadura_fresca',
          },
          salt_pct: 2.5,
          salt_ingredient_id: 'sal_fina',
          oil_pct: 2.3,
          oil_ingredient_id: 'aceite_oliva',
          water_ingredient_id: 'agua_filtrada',
        },
      },

      // REC-04: Masa de Campo por Pesos en kg (flours con weight_kg: 4.5kg 0000 + 0.5kg centeno = 5000g)
      // 4500g 0000 ($3600) + 500g centeno ($600) + 100g sal (2% = $100) + 15g levadura (0.3% = $150) = $4450
      // Yield (flour_plus_water, 68% hydration) = 5000 + 3400 = 8400g
      {
        id: 'REC-04',
        name: 'Masa de Campo 5kg Harina con Centeno',
        recipe_type: 'subrecipe',
        yield_quantity: 8400,
        yield_unit: 'g',
        currency: 'ARS',
        bakers_dough: {
          total_flour_g: 5000,
          hydration_pct: 68,
          yield_basis: 'flour_plus_water',
          flours: [
            { ingredient_id: 'harina_0000', weight_kg: 4.5 },
            { ingredient_id: 'harina_centeno', weight_kg: 0.5 },
          ],
          salt_pct: 2,
          salt_ingredient_id: 'sal_fina',
          direct_yeast_pct: 0.3,
          yeast_ingredient_id: 'levadura_fresca',
          water_ingredient_id: 'agua_filtrada',
        },
      },

      // REC-05: Fainá Clásico Genovés (usando spec `faina` en Recipe, units_count = 2 moldes)
      // 2 moldes: 370g garbanzo ($3.50/g = $1295) + 832.5g agua ($0) + 18.5g sal ($18.50) + 24ml aceite_oliva ($120) = $1433.50
      // Yield = 1202.5g => unit_cost = 1433.50 / 1202.5 $/g
      {
        id: 'REC-05',
        name: 'Fainá Clásico Genovés (2 Moldes 1202.5g)',
        recipe_type: 'subrecipe',
        yield_quantity: 1202.5,
        yield_unit: 'g',
        currency: 'ARS',
        faina: {
          units_count: 2,
          chickpea_flour_ingredient_id: 'harina_garbanzo',
          salt_ingredient_id: 'sal_fina',
          oil_ingredient_id: 'aceite_oliva',
          water_ingredient_id: 'agua_filtrada',
        },
      },

      // REC-06: Salsa Pomodoro San Marzano (subrecipe, yield 2000g)
      // 1800g tomate ($2/g = $3600) + 40ml aceite_oliva ($5/ml = $200) + 15g ajo ($4/g = $60) + 10g albahaca ($10/g = $100) + 20g sal ($1/g = $20)
      // Batch cost = $3980. Yield = 2000g => unit_cost = 1.99 $/g ($1990/kg)
      {
        id: 'REC-06',
        name: 'Salsa Pomodoro San Marzano',
        recipe_type: 'subrecipe',
        yield_quantity: 2000,
        yield_unit: 'g',
        currency: 'ARS',
        components: [
          { component_type: 'ingredient', ingredient_id: 'tomate_san_marzano', quantity: 1800, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'aceite_oliva', quantity: 40, unit: 'ml' },
          { component_type: 'ingredient', ingredient_id: 'ajo_fresco', quantity: 15, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'albahaca', quantity: 10, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'sal_fina', quantity: 20, unit: 'g' },
        ],
      },

      // REC-07: Pizza Margherita Verace
      // 250g REC-01 (250 * 850/1650 = 128.78787878787878) + 90g REC-06 (90 * 1.99 = 179.10)
      // + 110g fior_di_latte (110 * 10 = 1100) + 5g albahaca (5 * 10 = 50) + 10ml aceite_oliva (10 * 5 = 50)
      // Total = 1507.8878787878789
      {
        id: 'REC-07',
        name: 'Pizza Margherita Verace',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'subrecipe', recipe_id: 'REC-01', quantity: 250, unit: 'g' },
          { component_type: 'subrecipe', recipe_id: 'REC-06', quantity: 90, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'fior_di_latte', quantity: 110, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'albahaca', quantity: 5, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'aceite_oliva', quantity: 10, unit: 'ml' },
        ],
      },

      // REC-08: Pizza Fugazzeta Rellena
      // 460g REC-01 (460 * 850/1650 = 236.96969696969697) + 350g cebolla ($350) + 300g mozzarella ($1500)
      // + 120g jamon_cocido ($1200) + 3g oregano ($24) + 15ml aceite_oliva ($75)
      // Total = 3385.969696969697
      {
        id: 'REC-08',
        name: 'Pizza Fugazzeta Rellena con Jamón',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'subrecipe', recipe_id: 'REC-01', quantity: 460, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'cebolla', quantity: 350, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'mozzarella', quantity: 300, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'jamon_cocido', quantity: 120, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'oregano', quantity: 3, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'aceite_oliva', quantity: 15, unit: 'ml' },
        ],
      },

      // REC-09: Pizza Pepperoni con Unidades Estadounidenses (oz, lb, fl_oz_us)
      // 10 oz harina_0000 (10 * 28.349523125 * 0.8 = 226.796185)
      // + 0.5 lb mozzarella (0.5 * 453.59237 * 5 = 1133.980925)
      // + 3 oz salame_milan (3 * 28.349523125 * 11 = 935.534263125)
      // + 0.5 fl_oz_us aceite_oliva (0.5 * 29.5735295625 * 5 = 73.93382390625)
      // Total = 2370.24519703125
      {
        id: 'REC-09',
        name: 'Pizza Pepperoni US Customary Units',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'ingredient', ingredient_id: 'harina_0000', quantity: 10, unit: 'oz' },
          { component_type: 'ingredient', ingredient_id: 'mozzarella', quantity: 0.5, unit: 'lb' },
          { component_type: 'ingredient', ingredient_id: 'salame_milan', quantity: 3, unit: 'oz' },
          { component_type: 'ingredient', ingredient_id: 'aceite_oliva', quantity: 0.5, unit: 'fl_oz_us' },
        ],
      },

      // REC-10: Pizza Cuatro Quesos sobre Masa Romana (REC-02)
      // 255g REC-02 (255 * 1225/1700 = 183.75) + 140g mozzarella ($700) + 45g gorgonzola ($540)
      // + 45g fontina ($405) + 25g parmesano ($375) = 2203.75
      {
        id: 'REC-10',
        name: 'Pizza Quattro Formaggi Romana',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'subrecipe', recipe_id: 'REC-02', quantity: 255, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'mozzarella', quantity: 140, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'gorgonzola', quantity: 45, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'fontina', quantity: 45, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'parmesano', quantity: 25, unit: 'g' },
        ],
      },

      // REC-11: Pizza Pollo BBQ sobre Masa de Campo (REC-04)
      // 280g REC-04 (280 * 4450/8400 = 148.33333333333334) + 160g pollo_pechuga ($1280)
      // + 60g salsa_bbq ($240) + 40g cebolla_morada ($80) + 150g mozzarella ($750) = 2498.3333333333335
      {
        id: 'REC-11',
        name: 'Pizza Pollo BBQ sobre Masa de Campo',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'subrecipe', recipe_id: 'REC-04', quantity: 280, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'pollo_pechuga', quantity: 160, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'salsa_bbq', quantity: 60, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'cebolla_morada', quantity: 40, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'mozzarella', quantity: 150, unit: 'g' },
        ],
      },

      // REC-12: Empanadas de Carne Cortada a Cuchillo (Batch de 12 unidades, yield_quantity = 12)
      // 600g carne_vacuna ($6000) + 400g cebolla ($400) + 3 huevos ($600) + 60g aceitunas_negras ($360)
      // + 1 dozen tapa_empanada (12 * $100 = $1200) + 5g sal ($5) + 2g pimienta ($24)
      // Batch cost = 8589. Unit cost (por empanada) = 8589 / 12 = 715.75
      {
        id: 'REC-12',
        name: 'Empanadas de Carne Cortada a Cuchillo (Docena)',
        recipe_type: 'product',
        yield_quantity: 12,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'ingredient', ingredient_id: 'carne_vacuna', quantity: 600, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'cebolla', quantity: 400, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'huevo', quantity: 3, unit: 'unit' },
          { component_type: 'ingredient', ingredient_id: 'aceitunas_negras', quantity: 60, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'tapa_empanada', quantity: 1, unit: 'dozen' },
          { component_type: 'ingredient', ingredient_id: 'sal_fina', quantity: 5, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'pimienta', quantity: 2, unit: 'g' },
        ],
      },

      // REC-13: Calzone Napolitano Relleno
      // 330g REC-01 (330 * 850/1650 = 170) + 120g ricota ($480) + 100g mozzarella ($500)
      // + 70g salame_milan ($770) + 50g REC-06 (50 * 1.99 = 99.5) + 1g pimienta ($12) = 2031.5
      {
        id: 'REC-13',
        name: 'Calzone Napolitano Relleno',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'subrecipe', recipe_id: 'REC-01', quantity: 330, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'ricota', quantity: 120, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'mozzarella', quantity: 100, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'salame_milan', quantity: 70, unit: 'g' },
          { component_type: 'subrecipe', recipe_id: 'REC-06', quantity: 50, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'pimienta', quantity: 1, unit: 'g' },
        ],
      },

      // REC-14: Focaccia de Romero y Aceitunas (Batch de 4 porciones)
      // 825g REC-01 (825 * 850/1650 = 425) + 120g aceitunas_negras ($720) + 45ml aceite_oliva ($225)
      // + 8g romero ($80) + 10g sal_marina ($20) = Batch $1470 => Unit cost (por porción) = 1470 / 4 = 367.50
      {
        id: 'REC-14',
        name: 'Focaccia de Romero y Aceitunas (4 porciones)',
        recipe_type: 'product',
        yield_quantity: 4,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'subrecipe', recipe_id: 'REC-01', quantity: 825, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'aceitunas_negras', quantity: 120, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'aceite_oliva', quantity: 45, unit: 'ml' },
          { component_type: 'ingredient', ingredient_id: 'romero', quantity: 8, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'sal_marina', quantity: 10, unit: 'g' },
        ],
      },

      // Subrecetas auxiliares para REC-15 (Lasaña con subrecetas anidadas)
      // SUB-BOLONESA: usa 1000g REC-06 ($1990) + 800g carne_vacuna ($8000) + 200g cebolla ($200) + 150ml vino_tinto ($600) = $10,790 / 2000g = 5.395 $/g
      {
        id: 'SUB-BOLONESA',
        name: 'Ragú Boloñesa Tradicional',
        recipe_type: 'subrecipe',
        yield_quantity: 2000,
        yield_unit: 'g',
        currency: 'ARS',
        components: [
          { component_type: 'subrecipe', recipe_id: 'REC-06', quantity: 1000, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'carne_vacuna', quantity: 800, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'cebolla', quantity: 200, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'vino_tinto', quantity: 150, unit: 'ml' },
        ],
      },
      // SUB-BECHAMEL: 1000ml leche_entera ($1500) + 80g manteca ($640) + 80g harina_0000 ($64) + 10g sal ($10) = $2214 / 1000g = 2.214 $/g
      {
        id: 'SUB-BECHAMEL',
        name: 'Salsa Bechamel Clásica',
        recipe_type: 'subrecipe',
        yield_quantity: 1000,
        yield_unit: 'g',
        currency: 'ARS',
        components: [
          { component_type: 'ingredient', ingredient_id: 'leche_entera', quantity: 1000, unit: 'ml' },
          { component_type: 'ingredient', ingredient_id: 'manteca', quantity: 80, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'harina_0000', quantity: 80, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'sal_fina', quantity: 10, unit: 'g' },
        ],
      },

      // REC-15: Lasaña Boloñesa al Horno (Fuente de 6 porciones)
      // 1200g SUB-BOLONESA (1200 * 5.395 = 6474) + 600g SUB-BECHAMEL (600 * 2.214 = 1328.4)
      // + 400g pasta_lasana (400 * 6 = 2400) + 300g mozzarella (300 * 5 = 1500) + 80g parmesano (80 * 15 = 1200)
      // Batch = 12902.4 => Unit cost (por porción) = 12902.4 / 6 = 2150.4
      {
        id: 'REC-15',
        name: 'Lasaña Boloñesa al Horno (6 porciones)',
        recipe_type: 'product',
        yield_quantity: 6,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'subrecipe', recipe_id: 'SUB-BOLONESA', quantity: 1200, unit: 'g' },
          { component_type: 'subrecipe', recipe_id: 'SUB-BECHAMEL', quantity: 600, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'pasta_lasana', quantity: 400, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'mozzarella', quantity: 300, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'parmesano', quantity: 80, unit: 'g' },
        ],
      },

      // REC-16: Ensalada Caesar con Pollo y Aderezo convertido de g a ml por densidad
      // 150g lechuga_romana ($300) + 120g pollo_pechuga ($960) + 40g croutons ($200)
      // + 50g aderezo_caesar (50g / 1.0 g/ml = 50ml @ $6/ml = $300) + 20g parmesano ($300) = $2060
      {
        id: 'REC-16',
        name: 'Ensalada Caesar con Pollo Grillado',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'ingredient', ingredient_id: 'lechuga_romana', quantity: 150, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'pollo_pechuga', quantity: 120, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'croutons', quantity: 40, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'aderezo_caesar', quantity: 50, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'parmesano', quantity: 20, unit: 'g' },
        ],
      },

      // REC-17: Tiramisú Artesanal (Batch de 8 porciones, huevos medidos en gramos via unit_weight_g=50g)
      // 500g mascarpone ($6000) + 200g huevo (200g / 50g/u = 4u @ $200/u = $800) + 120g azucar ($180)
      // + 250ml cafe_espresso ($750) + 200g vainillas ($1600) + 30g cacao_amargo ($450)
      // Batch = $9780 => Unit cost = 9780 / 8 = 1222.5
      {
        id: 'REC-17',
        name: 'Tiramisú Artesanal Italiano (8 porciones)',
        recipe_type: 'product',
        yield_quantity: 8,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'ingredient', ingredient_id: 'mascarpone', quantity: 500, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'huevo', quantity: 200, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'azucar', quantity: 120, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'cafe_espresso', quantity: 250, unit: 'ml' },
          { component_type: 'ingredient', ingredient_id: 'vainillas', quantity: 200, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'cacao_amargo', quantity: 30, unit: 'g' },
        ],
      },

      // REC-18: Pizza Vegana con Insumo Cotizado en USD (FX 1 USD = 1000 ARS)
      // 247.5g REC-01 (247.5 * 850/1650 = 127.5) + 100g REC-06 (199) + 120g queso_caju_usd (120 * $12 = $1440)
      // + 30g aceitunas_negras ($180) + 10g albahaca ($100) = 2046.5
      {
        id: 'REC-18',
        name: 'Pizza Vegana con Queso de Cajú (Multi-moneda USD->ARS)',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'subrecipe', recipe_id: 'REC-01', quantity: 247.5, unit: 'g' },
          { component_type: 'subrecipe', recipe_id: 'REC-06', quantity: 100, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'queso_caju_usd', quantity: 120, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'aceitunas_negras', quantity: 30, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'albahaca', quantity: 10, unit: 'g' },
        ],
      },

      // REC-19: Combo Familiar (1 Pizza Quattro Formaggi REC-10 + 1 molde Fainá 601.25g REC-05 + 2 Gaseosas)
      // 1 unit REC-10 (2203.75) + 601.25g REC-05 (1433.50 / 2 = 716.75) + 2 gaseosa_lata (2000) = 4920.50
      {
        id: 'REC-19',
        name: 'Combo Pizza Quattro Formaggi + Fainá + 2 Latas',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'subrecipe', recipe_id: 'REC-10', quantity: 1, unit: 'unit' },
          { component_type: 'subrecipe', recipe_id: 'REC-05', quantity: 601.25, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'gaseosa_lata', quantity: 2, unit: 'unit' },
        ],
      },

      // REC-20: Pizza con Componente Excluido del Costo (exclude_from_cost: true) e Insumo Gratis (is_free: true)
      // 330g REC-01 ($170) + 100g REC-06 ($199) + 150g mozzarella ($750) + 1 ficha_impresa (excluded: $0) + 50ml agua_filtrada (free: $0) = $1119
      {
        id: 'REC-20',
        name: 'Pizza Clásica con Ficha Excluida y Agua Gratis',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'subrecipe', recipe_id: 'REC-01', quantity: 330, unit: 'g' },
          { component_type: 'subrecipe', recipe_id: 'REC-06', quantity: 100, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'mozzarella', quantity: 150, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'ficha_impresa', quantity: 1, unit: 'unit', exclude_from_cost: true },
          { component_type: 'ingredient', ingredient_id: 'agua_filtrada', quantity: 50, unit: 'ml' },
        ],
      },

      // REC-21: Pizza Incompleta por Ingrediente Sin Precio (trufa_sin_precio)
      {
        id: 'REC-21',
        name: 'Pizza Tartufata Incompleta (Sin Precio)',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'subrecipe', recipe_id: 'REC-01', quantity: 250, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'mozzarella', quantity: 150, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'trufa_sin_precio', quantity: 15, unit: 'g' },
        ],
      },

      // REC-22: Pizza Incompleta por Componente con Cantidad Cero (zero_quantity)
      {
        id: 'REC-22',
        name: 'Pizza con Cantidad Cero (Incompleta)',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [
          { component_type: 'subrecipe', recipe_id: 'REC-01', quantity: 250, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: 'mozzarella', quantity: 0, unit: 'g' },
        ],
      },
    ],
  };
}

const EXPECTED_COMPLETE_RECIPES = [
  { id: 'REC-01', batch: 850, unit: 850 / 1650, perKg: (850 / 1650) * 1000 },
  { id: 'REC-02', batch: 1225, unit: 1225 / 1700, perKg: (1225 / 1700) * 1000 },
  { id: 'REC-03', batch: 1365, unit: 1365 / 1669.5, perKg: (1365 / 1669.5) * 1000 },
  { id: 'REC-04', batch: 4450, unit: 4450 / 8400, perKg: (4450 / 8400) * 1000 },
  { id: 'REC-05', batch: 1433.5, unit: 1433.5 / 1202.5, perKg: (1433.5 / 1202.5) * 1000 },
  { id: 'REC-06', batch: 3980, unit: 1.99, perKg: 1990 },
  { id: 'REC-07', batch: 128.78787878787878 + 179.1 + 1100 + 50 + 50, unit: 1507.8878787878788, perKg: null },
  { id: 'REC-08', batch: 236.96969696969697 + 350 + 1500 + 1200 + 24 + 75, unit: 3385.969696969697, perKg: null },
  { id: 'REC-09', batch: 2370.24519703125, unit: 2370.24519703125, perKg: null },
  { id: 'REC-10', batch: 2203.75, unit: 2203.75, perKg: null },
  { id: 'REC-11', batch: 2498.3333333333335, unit: 2498.3333333333335, perKg: null },
  { id: 'REC-12', batch: 8589, unit: 715.75, perKg: null },
  { id: 'REC-13', batch: 2031.5, unit: 2031.5, perKg: null },
  { id: 'REC-14', batch: 1470, unit: 367.5, perKg: null },
  { id: 'REC-15', batch: 12902.4, unit: 2150.4, perKg: null },
  { id: 'REC-16', batch: 2060, unit: 2060, perKg: null },
  { id: 'REC-17', batch: 9780, unit: 1222.5, perKg: null },
  { id: 'REC-18', batch: 2046.5, unit: 2046.5, perKg: null },
  { id: 'REC-19', batch: 4920.5, unit: 4920.5, perKg: null },
  { id: 'REC-20', batch: 1119, unit: 1119, perKg: null },
];

test('Tarea 1.2: Set de 22 recetas calculadas independientemente (20 completas + 2 incompletas)', async (t) => {
  const catalog = buildMasterTestCatalog();
  const engine = new CostEngine(catalog);

  for (const exp of EXPECTED_COMPLETE_RECIPES) {
    await t.test(`${exp.id}: cálculo exacto de batch_cost, unit_cost y pricing`, () => {
      const res = engine.calculateRecipeCost(exp.id);
      assert.equal(res.status, 'complete', `${exp.id} debe estar completa`);
      assert.equal(res.missing_inputs.length, 0);
      assertClose(res.raw_batch_cost, exp.batch, `${exp.id} raw_batch_cost`);
      assertClose(res.raw_unit_cost, exp.unit, `${exp.id} raw_unit_cost`);
      if (exp.perKg !== null) {
        assertClose(res.cost_per_kg, exp.perKg, `${exp.id} cost_per_kg`, 1e-2);
      }

      // Verificar también precio sugerido y márgenes para cada receta completa
      const pricing = calculatePricingScenario({
        unit_cost: res.raw_unit_cost,
        status: res.status,
        currency: 'ARS',
        target_food_cost_pct: 30,
        rounding_increment: 100,
        rounding_mode: 'ceil',
        packaging_cost: 200,
        channel_fee_pct: 20,
      });
      assert.equal(pricing.status, 'complete');
      const expectedMinPrice = exp.unit / 0.3;
      const expectedSuggested = Math.ceil(expectedMinPrice / 100) * 100;
      assertClose(pricing.raw_minimum_price, expectedMinPrice, `${exp.id} raw_minimum_price`);
      assertClose(pricing.raw_suggested_price, expectedSuggested, `${exp.id} raw_suggested_price`);
      assertClose(
        pricing.food_cost_pct,
        Number(((exp.unit / expectedSuggested) * 100).toFixed(2)),
        `${exp.id} food_cost_pct`,
        1e-2
      );
      assertClose(
        pricing.gross_margin_pct + pricing.food_cost_pct,
        100,
        `${exp.id} margin + food_cost = 100%`,
        1e-2
      );
    });
  }

  await t.test('REC-21: receta con ingrediente sin precio retorna incomplete y bloquea costos', () => {
    const res = engine.calculateRecipeCost('REC-21');
    assert.equal(res.status, 'incomplete');
    assert.equal(res.batch_cost, null);
    assert.equal(res.unit_cost, null);
    assert.equal(res.raw_batch_cost, null);
    assert.equal(res.raw_unit_cost, null);
    assert.ok(res.missing_inputs.some((m) => m.ingredient_id === 'trufa_sin_precio' && m.reason === 'missing_purchase_price'));
  });

  await t.test('REC-22: receta con cantidad cero retorna incomplete con zero_quantity', () => {
    const res = engine.calculateRecipeCost('REC-22');
    assert.equal(res.status, 'incomplete');
    assert.equal(res.batch_cost, null);
    assert.equal(res.unit_cost, null);
    assert.ok(res.missing_inputs.some((m) => m.ingredient_id === 'mozzarella' && m.reason === 'zero_quantity'));
  });
});
