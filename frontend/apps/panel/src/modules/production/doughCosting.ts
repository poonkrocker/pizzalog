import {
  CostEngine,
  expandBakersDoughSpec,
  expandFainaSpec,
  type CostCatalog,
  type Ingredient,
  type PurchasePrice,
  type Recipe,
  type RecipeComponent,
  type UnitCode,
} from '@pizzalog/cost-engine';
import type { DoughCalculation, DoughProfile, SupplyItem } from '@pizzalog/shared';

const UNIT_ALIASES: Record<string, UnitCode> = {
  kilo: 'kg', kilos: 'kg', gr: 'g', gramo: 'g', gramos: 'g',
  lt: 'L', litro: 'L', litros: 'L', u: 'unit', un: 'unit',
  unidad: 'unit', unidades: 'unit', docena: 'dozen',
};

function toEngineUnit(value: string): UnitCode | null {
  const normalized = value.trim().toLowerCase();
  if (UNIT_ALIASES[normalized]) return UNIT_ALIASES[normalized]!;
  const known: UnitCode[] = ['kg', 'g', 'mg', 'lb', 'oz', 'L', 'l', 'ml', 'cc', 'fl_oz_us', 'gal_us', 'unit', 'u', 'dozen', 'docena'];
  return known.includes(value.trim() as UnitCode) ? value.trim() as UnitCode : null;
}

function dimensionForUnit(unit: UnitCode): Ingredient['base_dimension'] {
  if (['kg', 'g', 'mg', 'lb', 'oz'].includes(unit)) return 'mass';
  if (['L', 'l', 'ml', 'cc', 'fl_oz_us', 'gal_us'].includes(unit)) return 'volume';
  return 'count';
}

function buildCatalog(supplies: SupplyItem[]): CostCatalog {
  const ingredients: Ingredient[] = [];
  const purchase_prices: PurchasePrice[] = [];
  for (const supply of supplies) {
    const unit = toEngineUnit(supply.unit);
    if (!unit) continue;
    const id = `supply_${supply.id}`;
    ingredients.push({
      id,
      name: supply.name,
      base_dimension: dimensionForUnit(unit),
      base_unit: unit,
      is_active: true,
    });
    if (supply.cost !== null && Number.isFinite(supply.cost) && supply.cost > 0) {
      purchase_prices.push({
        ingredient_id: id,
        purchase_price: supply.cost,
        currency: 'ARS',
        pack_quantity: 1,
        pack_unit: unit,
        yield_pct: 100,
      });
    }
  }
  return { ingredients, purchase_prices, recipes: [] };
}

function supplyRef(
  profile: DoughProfile,
  key: keyof NonNullable<DoughProfile['ingredient_map']>,
  supplies: SupplyItem[],
  requiredDimension: Ingredient['base_dimension'],
): string {
  const id = profile.ingredient_map?.[key];
  if (typeof id !== 'number' || id <= 0) return `missing_${key}`;
  const supply = supplies.find((item) => item.id === id);
  const unit = supply ? toEngineUnit(supply.unit) : null;
  return unit && dimensionForUnit(unit) === requiredDimension ? `supply_${id}` : `missing_${key}`;
}

function makeCostEngineResult(
  profile: DoughProfile,
  supplies: SupplyItem[],
  components: RecipeComponent[],
  yieldQuantity: number,
  yieldUnit: UnitCode,
): ReturnType<CostEngine['calculateRecipeCost']> {
  const catalog = buildCatalog(supplies);
  const recipe: Recipe = {
    id: `dough_profile_${profile.id}`,
    name: profile.name,
    recipe_type: 'product',
    yield_quantity: yieldQuantity,
    yield_unit: yieldUnit,
    currency: 'ARS',
    components,
  };
  return new CostEngine({ ...catalog, recipes: [recipe] }).calculateRecipeCost(recipe.id);
}

export function calculateDoughWithCostEngine(
  profile: DoughProfile,
  units: number,
  batches: number,
  supplies: SupplyItem[],
): DoughCalculation {
  const safeUnits = Math.max(1, Math.floor(units));
  const safeBatches = Math.max(1, Math.floor(batches));
  const perBatch = (value: number) => value / safeBatches;
  const isFaina = /fain[aá]/i.test(profile.name);

  if (isFaina) {
    const waterId = profile.ingredient_map?.water_id;
    const waterSupply = supplies.find((item) => item.id === waterId);
    const waterUnit = waterSupply ? toEngineUnit(waterSupply.unit) : null;
    const fainaSpec = {
      units_count: safeUnits,
      chickpea_flour_ingredient_id: supplyRef(profile, 'chickpea_flour_id', supplies, 'mass'),
      salt_ingredient_id: supplyRef(profile, 'salt_id', supplies, 'mass'),
      oil_ingredient_id: supplyRef(profile, 'oil_id', supplies, 'volume'),
      ...(waterUnit && dimensionForUnit(waterUnit) === 'mass' && typeof waterId === 'number'
        ? { water_ingredient_id: `supply_${waterId}` }
        : {}),
    };
    const expanded = expandFainaSpec(fainaSpec);
    const result = makeCostEngineResult(profile, supplies, expanded.components, safeUnits, 'unit');
    const flourKg = expanded.chickpeaFlourG / 1000;
    const waterLiters = expanded.waterG / 1000;
    const saltGrams = expanded.saltG;
    const oilLiters = expanded.oilMl / 1000;
    const totalWeightKg = expanded.totalWeightG / 1000;
    const totalCost = result.raw_batch_cost;
    const whatsapp = [
      `🥣 *RECETA FAINÁ - ${safeUnits} MOLDES*`,
      '──────────────────',
      `• Harina de garbanzo: ${flourKg.toFixed(3)} kg`,
      `• Agua: ${waterLiters.toFixed(3)} L`,
      `• Sal fina: ${saltGrams.toFixed(1)} g`,
      `• Aceite de oliva: ${expanded.oilMl.toFixed(0)} ml`,
      '──────────────────',
      'Batir enérgicamente sin grumos y reposar mínimo 4 horas.',
    ].join('\n');
    return {
      type: 'faina',
      total_weight_kg: totalWeightKg,
      weight_per_unit_g: expanded.chickpeaFlourG / safeUnits,
      units: safeUnits,
      batches: safeBatches,
      total: {
        chickpea_flour_kg: flourKg,
        water_liters: waterLiters,
        salt_grams: saltGrams,
        oil_liters: oilLiters,
      },
      per_batch: {
        batches: safeBatches,
        chickpea_flour_kg: perBatch(flourKg),
        water_liters: perBatch(waterLiters),
        salt_grams: perBatch(saltGrams),
        oil_liters: perBatch(oilLiters),
      },
      cost: {
        total: totalCost,
        per_unit: result.raw_unit_cost,
        per_kg: totalCost !== null && totalWeightKg > 0 ? totalCost / totalWeightKg : null,
        status: result.status,
      },
      whatsapp_text: whatsapp,
    };
  }

  const spec = {
    unit_weight_g: profile.unit_weight_grams,
    units_count: safeUnits,
    hydration_pct: profile.hydration_pct,
    yield_basis: 'flour_plus_water' as const,
    flours: [
      { ingredient_id: supplyRef(profile, 'flour_white_id', supplies, 'mass'), share_pct: profile.flour_white_pct },
      { ingredient_id: supplyRef(profile, 'flour_integral_id', supplies, 'mass'), share_pct: profile.flour_integral_pct },
      { ingredient_id: supplyRef(profile, 'flour_semola_id', supplies, 'mass'), share_pct: profile.flour_semola_pct },
    ],
    ...(profile.biga_pct > 0 ? {
      biga: {
        flour_pct: profile.biga_pct,
        water_pct: profile.biga_water_pct,
        yeast_pct: profile.biga_yeast_pct,
        yeast_ingredient_id: supplyRef(profile, 'biga_yeast_id', supplies, 'mass'),
      },
    } : {}),
    ...(profile.poolish_pct > 0 ? {
      poolish: {
        flour_pct: profile.poolish_pct,
        water_pct: profile.poolish_water_pct,
        yeast_pct: profile.poolish_yeast_pct,
        yeast_ingredient_id: supplyRef(profile, 'poolish_yeast_id', supplies, 'mass'),
      },
    } : {}),
    direct_yeast_pct: profile.direct_yeast_pct,
    yeast_ingredient_id: supplyRef(profile, 'direct_yeast_id', supplies, 'mass'),
    salt_pct: profile.salt_pct,
    salt_ingredient_id: supplyRef(profile, 'salt_id', supplies, 'mass'),
    sugar_pct: profile.sugar_pct,
    sugar_ingredient_id: supplyRef(profile, 'sugar_id', supplies, 'mass'),
    oil_pct: profile.oil_pct,
    oil_ingredient_id: supplyRef(profile, 'oil_id', supplies, 'mass'),
  };
  const expanded = expandBakersDoughSpec(spec);
  const engineRecipe: Recipe = {
    id: `dough_profile_${profile.id}`,
    name: profile.name,
    recipe_type: 'product',
    yield_quantity: expanded.yieldQuantityG,
    yield_unit: 'g',
    currency: 'ARS',
    bakers_dough: spec,
  };
  const engineResult = new CostEngine({
    ...buildCatalog(supplies),
    recipes: [engineRecipe],
  }).calculateRecipeCost(engineRecipe.id);

  const flourWhiteKg = (expanded.flourBreakdown.find((item) => item.index === 0)?.quantityG ?? 0) / 1000;
  const flourIntegralKg = (expanded.flourBreakdown.find((item) => item.index === 1)?.quantityG ?? 0) / 1000;
  const flourSemolaKg = (expanded.flourBreakdown.find((item) => item.index === 2)?.quantityG ?? 0) / 1000;
  const flourKg = expanded.flourTotalG / 1000;
  const waterKg = expanded.waterTotalG / 1000;
  const bigaFlourKg = expanded.biga.flourG / 1000;
  const bigaWaterKg = expanded.biga.waterG / 1000;
  const bigaYeastKg = expanded.biga.yeastG / 1000;
  const poolishFlourKg = expanded.poolish.flourG / 1000;
  const poolishWaterKg = expanded.poolish.waterG / 1000;
  const poolishYeastKg = expanded.poolish.yeastG / 1000;
  const saltG = expanded.direct.saltG;
  const directYeastG = expanded.direct.yeastG;
  const sugarG = expanded.direct.sugarG;
  const oilG = expanded.direct.oilG;
  const finalFlourKg = expanded.final.flourG / 1000;
  const finalWaterKg = expanded.final.waterG / 1000;
  const totalWeightKg = expanded.yieldQuantityG / 1000;
  const totalCost = engineResult.raw_batch_cost;

  const whatsapp = [
    `🍕 *AMASADO — ${safeUnits} BOLLOS (${profile.unit_weight_grams}g)*`,
    `Perfil: *${profile.name}* (Hidr: ${profile.hydration_pct}%)`,
    '──────────────────',
    ...(bigaFlourKg > 0 ? [
      `🥣 *BIGA (${profile.biga_pct}%)*`,
      `• Harina: ${bigaFlourKg.toFixed(3)} kg`,
      `• Agua: ${bigaWaterKg.toFixed(3)} L`,
      `• Levadura: ${(bigaYeastKg * 1000).toFixed(1)} g`,
    ] : []),
    ...(poolishFlourKg > 0 ? [
      `🥣 *POOLISH (${profile.poolish_pct}%)*`,
      `• Harina: ${poolishFlourKg.toFixed(3)} kg`,
      `• Agua: ${poolishWaterKg.toFixed(3)} L`,
      `• Levadura: ${(poolishYeastKg * 1000).toFixed(1)} g`,
    ] : []),
    '──────────────────',
    `• Harina blanca: ${flourWhiteKg.toFixed(3)} kg`,
    `• Sémola: ${flourSemolaKg.toFixed(3)} kg`,
    `• Harina integral: ${flourIntegralKg.toFixed(3)} kg`,
    `• Agua restante: ${finalWaterKg.toFixed(3)} L`,
    `• Sal: ${saltG.toFixed(1)} g`,
    ...(directYeastG > 0 ? [`• Levadura directa: ${directYeastG.toFixed(1)} g`] : []),
    ...(sugarG > 0 ? [`• Azúcar: ${sugarG.toFixed(1)} g`] : []),
    ...(oilG > 0 ? [`• Aceite: ${oilG.toFixed(1)} g`] : []),
  ].join('\n');

  return {
    type: 'pizza',
    total_weight_kg: totalWeightKg,
    total_flour_kg: flourKg,
    total_water_kg: waterKg,
    weight_per_unit_g: profile.unit_weight_grams,
    units: safeUnits,
    batches: safeBatches,
    flour_blend: { white_kg: flourWhiteKg, semola_kg: flourSemolaKg, integral_kg: flourIntegralKg },
    ...(bigaFlourKg > 0 ? {
      biga: {
        active: true, pct: profile.biga_pct, flour_kg: bigaFlourKg,
        water_kg: bigaWaterKg, yeast_g: bigaYeastKg * 1000,
        total_kg: expanded.biga.totalG / 1000,
      },
    } : {}),
    ...(poolishFlourKg > 0 ? {
      poolish: {
        active: true, pct: profile.poolish_pct, flour_kg: poolishFlourKg,
        water_kg: poolishWaterKg, yeast_g: poolishYeastKg * 1000,
        total_kg: expanded.poolish.totalG / 1000,
      },
    } : {}),
    empaste: {
      flour_kg: finalFlourKg, water_kg: finalWaterKg, salt_g: saltG,
      direct_yeast_g: directYeastG, sugar_g: sugarG, oil_g: oilG,
    },
    per_batch: {
      batches: safeBatches,
      flour_kg: perBatch(flourKg),
      water_kg: perBatch(waterKg),
      ...(bigaFlourKg > 0 ? { biga_kg: perBatch(expanded.biga.totalG / 1000) } : {}),
      salt_g: perBatch(saltG),
    },
    cost: {
      total: totalCost,
      per_unit: totalCost !== null ? totalCost / safeUnits : null,
      per_kg: totalCost !== null && totalWeightKg > 0 ? totalCost / totalWeightKg : null,
      status: engineResult.status,
    },
    whatsapp_text: whatsapp,
  };
}
