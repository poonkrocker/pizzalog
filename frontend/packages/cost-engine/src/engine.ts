import {
  CostEngineValidationError,
  type BakersDoughSpec,
  type ComponentCostBreakdown,
  type CostCatalog,
  type CostResult,
  type CostSnapshot,
  type ExchangeRate,
  type Ingredient,
  type MissingInput,
  type PricingScenarioInput,
  type PricingScenarioResult,
  type PortfolioScenarioInput,
  type PortfolioScenarioResult,
  type PortfolioScenarioRow,
  type PurchasePrice,
  type Recipe,
  type RecipeComponent,
  type UnitCode,
} from './types.js';
import { convertQuantity, getUnitDefinition } from './units.js';

export const ENGINE_VERSION = '1.0.0';

export function formatDecimal(value: number, decimals = 2): string {
  // Evitar artefactos de punto flotante tipo 200.00000000000003 antes de redondear para salida
  const epsilon = Math.sign(value) * 1e-12;
  return (value + epsilon).toFixed(decimals);
}

/**
 * Hash determinístico FNV-1a 64-bit en hex para identificar de forma reproducible el snapshot de inputs
 * sin depender de módulos nativos de Node (funciona idéntico en navegador, TPV, worker y Node).
 */
export function computeSnapshotHash(payload: unknown): string {
  const str = JSON.stringify(payload);
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

function resolveCurrencyMultiplier(
  fromCurrency: string,
  toCurrency: string,
  exchangeRates?: ExchangeRate[],
  asOfDate?: string
): number {
  const from = (fromCurrency ?? '').trim().toUpperCase();
  const to = (toCurrency ?? '').trim().toUpperCase();
  if (!from || !to) {
    throw new CostEngineValidationError('CURRENCY_MISMATCH', 'La moneda debe estar definida explícitamente.');
  }
  if (from === to) return 1;

  const candidates = (exchangeRates ?? []).filter(
    (r) =>
      r.from_currency.toUpperCase() === from &&
      r.to_currency.toUpperCase() === to &&
      (!asOfDate || r.effective_date <= asOfDate)
  );

  if (candidates.length === 0) {
    throw new CostEngineValidationError(
      'CURRENCY_MISMATCH',
      `No se pueden mezclar monedas distintas (${from} -> ${to}) sin un tipo de cambio explícito.`,
      { fromCurrency: from, toCurrency: to }
    );
  }

  candidates.sort((a, b) => b.effective_date.localeCompare(a.effective_date));
  const best = candidates[0]!;
  if (!Number.isFinite(best.rate) || best.rate <= 0) {
    throw new CostEngineValidationError(
      'CURRENCY_MISMATCH',
      `Tipo de cambio inválido para ${from} -> ${to}: ${best.rate}`,
      { rate: best.rate }
    );
  }
  return best.rate;
}

export function selectEffectivePurchasePrice(
  ingredientId: string,
  purchasePrices: PurchasePrice[],
  asOfDate?: string
): PurchasePrice | undefined {
  let selected: PurchasePrice | undefined;
  let selectedDate = '';
  let selectedIndex = -1;

  purchasePrices.forEach((price, index) => {
    if (
      price.ingredient_id !== ingredientId ||
      (asOfDate && price.purchase_date && price.purchase_date > asOfDate)
    ) {
      return;
    }

    const date = price.purchase_date ?? '';
    if (date > selectedDate || (date === selectedDate && index > selectedIndex)) {
      selected = price;
      selectedDate = date;
      selectedIndex = index;
    }
  });

  return selected;
}

export interface UsableUnitCostResult {
  status: 'complete' | 'missing';
  grossUnitCostInBase: number | null;
  usableUnitCostInBase: number | null;
  baseUnit: UnitCode;
  yieldFraction: number;
}

/**
 * Calcula el costo bruto y el costo utilizable por unidad base del ingrediente.
 * Aplica merma/rendimiento una única vez: usable_unit_cost = gross_unit_cost / yield_fraction.
 */
export function computeUsableIngredientCost(
  ingredient: Ingredient,
  priceRecord: PurchasePrice | undefined,
  targetCurrency: string,
  exchangeRates?: ExchangeRate[],
  asOfDate?: string
): UsableUnitCostResult {
  getUnitDefinition(ingredient.base_unit);

  if (ingredient.is_free === true) {
    return {
      status: 'complete',
      grossUnitCostInBase: 0,
      usableUnitCostInBase: 0,
      baseUnit: ingredient.base_unit,
      yieldFraction: 1,
    };
  }

  if (!priceRecord || priceRecord.purchase_price === null || priceRecord.purchase_price === undefined || priceRecord.purchase_price === '') {
    return {
      status: 'missing',
      grossUnitCostInBase: null,
      usableUnitCostInBase: null,
      baseUnit: ingredient.base_unit,
      yieldFraction: 1,
    };
  }

  const numericPrice = typeof priceRecord.purchase_price === 'string'
    ? Number(priceRecord.purchase_price)
    : priceRecord.purchase_price;

  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    // Un precio 0 o negativo en un ingrediente que NO es is_free no puede tratarse como gratis silencioso
    return {
      status: 'missing',
      grossUnitCostInBase: null,
      usableUnitCostInBase: null,
      baseUnit: ingredient.base_unit,
      yieldFraction: 1,
    };
  }

  if (!Number.isFinite(priceRecord.pack_quantity) || priceRecord.pack_quantity <= 0) {
    throw new CostEngineValidationError(
      'INVALID_PACK_QUANTITY',
      `La cantidad por envase (pack_quantity) para "${ingredient.name}" debe ser mayor a cero.`,
      { ingredient_id: ingredient.id, pack_quantity: priceRecord.pack_quantity }
    );
  }

  let yieldFraction = 1;
  if (priceRecord.usable_quantity !== undefined && priceRecord.usable_quantity !== null) {
    if (
      !Number.isFinite(priceRecord.usable_quantity) ||
      priceRecord.usable_quantity <= 0 ||
      priceRecord.usable_quantity > priceRecord.pack_quantity
    ) {
      throw new CostEngineValidationError(
        'INVALID_YIELD_PCT',
        `La cantidad utilizable (${priceRecord.usable_quantity}) de "${ingredient.name}" debe ser > 0 y <= pack_quantity (${priceRecord.pack_quantity}).`,
        { ingredient_id: ingredient.id, usable_quantity: priceRecord.usable_quantity }
      );
    }
    yieldFraction = priceRecord.usable_quantity / priceRecord.pack_quantity;
  } else if (priceRecord.yield_pct !== undefined && priceRecord.yield_pct !== null) {
    if (!Number.isFinite(priceRecord.yield_pct) || priceRecord.yield_pct <= 0 || priceRecord.yield_pct > 100) {
      throw new CostEngineValidationError(
        'INVALID_YIELD_PCT',
        `El porcentaje de rendimiento (${priceRecord.yield_pct}%) para "${ingredient.name}" debe ser > 0 y <= 100.`,
        { ingredient_id: ingredient.id, yield_pct: priceRecord.yield_pct }
      );
    }
    yieldFraction = priceRecord.yield_pct / 100;
  }

  const fxRate = resolveCurrencyMultiplier(priceRecord.currency, targetCurrency, exchangeRates, asOfDate);
  const priceInTargetCurrency = numericPrice * fxRate;

  const packQtyInBaseUnit = convertQuantity(
    priceRecord.pack_quantity,
    priceRecord.pack_unit,
    ingredient.base_unit,
    ingredient
  );

  const grossUnitCostInBase = priceInTargetCurrency / packQtyInBaseUnit;
  const usableUnitCostInBase = grossUnitCostInBase / yieldFraction;

  return {
    status: 'complete',
    grossUnitCostInBase,
    usableUnitCostInBase,
    baseUnit: ingredient.base_unit,
    yieldFraction,
  };
}

/**
 * Expande una especificación de masa panadera (Biga / Poolish / Directo) en componentes de receta
 * sin duplicar agua ni harina de los prefermentos.
 */
export function expandBakersDoughSpec(spec: BakersDoughSpec): {
  components: RecipeComponent[];
  yieldQuantityG: number;
  flourTotalG: number;
  waterTotalG: number;
} {
  if (!Number.isFinite(spec.hydration_pct) || spec.hydration_pct < 0) {
    throw new CostEngineValidationError('INVALID_DOUGH_SPEC', 'La hidratación debe ser un porcentaje válido >= 0.');
  }
  if (!spec.flours || spec.flours.length === 0) {
    throw new CostEngineValidationError('INVALID_DOUGH_SPEC', 'El perfil de masa debe declarar al menos una harina.');
  }

  const percentageInputs: Array<[string, number]> = [
    ['biga.flour_pct', spec.biga?.flour_pct ?? 0],
    ['biga.water_pct', spec.biga?.water_pct ?? 0],
    ['biga.yeast_pct', spec.biga?.yeast_pct ?? 0],
    ['poolish.flour_pct', spec.poolish?.flour_pct ?? 0],
    ['poolish.water_pct', spec.poolish?.water_pct ?? 0],
    ['poolish.yeast_pct', spec.poolish?.yeast_pct ?? 0],
    ['direct_yeast_pct', spec.direct_yeast_pct ?? 0],
    ['salt_pct', spec.salt_pct ?? 0],
    ['sugar_pct', spec.sugar_pct ?? 0],
    ['oil_pct', spec.oil_pct ?? 0],
  ];
  for (const [field, value] of percentageInputs) {
    if (!Number.isFinite(value) || value < 0) {
      throw new CostEngineValidationError(
        'INVALID_DOUGH_SPEC',
        `El porcentaje "${field}" debe ser un número finito no negativo.`,
        { field, value }
      );
    }
  }

  if (spec.total_flour_g !== undefined && (!Number.isFinite(spec.total_flour_g) || spec.total_flour_g <= 0)) {
    throw new CostEngineValidationError('INVALID_DOUGH_SPEC', 'total_flour_g debe ser un número finito mayor a cero.');
  }

  const bigaFlourPct = spec.biga?.flour_pct ?? 0;
  const bigaWaterPct = spec.biga?.water_pct ?? 0;
  const bigaYeastPct = spec.biga?.yeast_pct ?? 0;

  const poolishFlourPct = spec.poolish?.flour_pct ?? 0;
  const poolishWaterPct = spec.poolish?.water_pct ?? 0;
  const poolishYeastPct = spec.poolish?.yeast_pct ?? 0;

  if (bigaFlourPct < 0 || poolishFlourPct < 0 || bigaFlourPct + poolishFlourPct > 100) {
    throw new CostEngineValidationError(
      'INVALID_DOUGH_SPEC',
      'La suma de harina en biga y poolish no puede superar el 100% de la harina total.'
    );
  }

  const directYeastPct = spec.direct_yeast_pct ?? 0;
  const saltPct = spec.salt_pct ?? 0;
  const sugarPct = spec.sugar_pct ?? 0;
  const oilPct = spec.oil_pct ?? 0;

  // Levadura total expresada como % sobre la harina total:
  // (biga_flour_fraction * biga_yeast_pct) + (poolish_flour_fraction * poolish_yeast_pct) + direct_yeast_pct
  const totalYeastPctOnTotalFlour =
    (bigaFlourPct / 100) * bigaYeastPct + (poolishFlourPct / 100) * poolishYeastPct + directYeastPct;

  let flourTotalG: number;
  let yieldQuantityG: number;

  if (spec.total_flour_g !== undefined && spec.total_flour_g > 0) {
    flourTotalG = spec.total_flour_g;
    if (spec.yield_basis === 'measured_yield') {
      if (!spec.measured_yield_g || spec.measured_yield_g <= 0) {
        throw new CostEngineValidationError(
          'INVALID_DOUGH_SPEC',
          'Cuando yield_basis es "measured_yield", debe especificarse measured_yield_g > 0.'
        );
      }
      yieldQuantityG = spec.measured_yield_g;
    } else if (spec.yield_basis === 'flour_plus_water') {
      yieldQuantityG = flourTotalG * (1 + spec.hydration_pct / 100);
    } else {
      const totalFormulaFactor =
        1 + (spec.hydration_pct + totalYeastPctOnTotalFlour + saltPct + sugarPct + oilPct) / 100;
      yieldQuantityG = flourTotalG * totalFormulaFactor;
    }
  } else {
    const units = spec.units_count ?? 1;
    const unitWeightG = spec.unit_weight_g ?? 0;
    if (units <= 0 || unitWeightG <= 0) {
      throw new CostEngineValidationError(
        'INVALID_DOUGH_SPEC',
        'Debe indicarse total_flour_g > 0 o bien unit_weight_g > 0 y units_count > 0.'
      );
    }
    const targetDoughG = units * unitWeightG;
    if (spec.yield_basis === 'flour_plus_water') {
      // Convención histórica hoja Masas (CE-001): peso bollo = harina + agua
      flourTotalG = targetDoughG / (1 + spec.hydration_pct / 100);
      yieldQuantityG = targetDoughG;
    } else if (spec.yield_basis === 'measured_yield') {
      if (!spec.measured_yield_g || spec.measured_yield_g <= 0) {
        throw new CostEngineValidationError(
          'INVALID_DOUGH_SPEC',
          'Cuando yield_basis es "measured_yield", debe especificarse measured_yield_g > 0.'
        );
      }
      flourTotalG = targetDoughG / (1 + spec.hydration_pct / 100);
      yieldQuantityG = spec.measured_yield_g;
    } else {
      const totalFormulaFactor =
        1 + (spec.hydration_pct + totalYeastPctOnTotalFlour + saltPct + sugarPct + oilPct) / 100;
      flourTotalG = targetDoughG / totalFormulaFactor;
      yieldQuantityG = targetDoughG;
    }
  }

  const waterTotalG = flourTotalG * (spec.hydration_pct / 100);

  // Resolver proporción de cada harina (por peso de referencia o por share_pct)
  const hasAnyWeight = spec.flours.some((f) => f.weight_kg !== undefined);
  const usesWeights = spec.flours.every(
    (f) => f.weight_kg !== undefined && Number.isFinite(f.weight_kg) && f.weight_kg >= 0
  );
  if (hasAnyWeight && !usesWeights) {
    throw new CostEngineValidationError(
      'INVALID_DOUGH_SPEC',
      'Si se usan pesos de harina, todos los componentes deben declarar un weight_kg válido.'
    );
  }

  const weightSum = usesWeights ? spec.flours.reduce((acc, f) => acc + (f.weight_kg ?? 0), 0) : 0;
  if (usesWeights && (!Number.isFinite(weightSum) || weightSum <= 0)) {
    throw new CostEngineValidationError(
      'INVALID_DOUGH_SPEC',
      'La suma de los pesos de harina debe ser mayor a cero.'
    );
  }

  const shareValues = spec.flours.map((f) => f.share_pct);
  if (!usesWeights) {
    if (shareValues.some((value) => value === undefined || !Number.isFinite(value) || value < 0)) {
      throw new CostEngineValidationError(
        'INVALID_DOUGH_SPEC',
        'Cada harina debe declarar un share_pct finito no negativo o todas deben declarar weight_kg.'
      );
    }
    const shareSum = shareValues.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    if (Math.abs(shareSum - 100) > 0.01) {
      throw new CostEngineValidationError(
        'INVALID_DOUGH_SPEC',
        'La suma de share_pct de las harinas debe ser 100%.',
        { share_sum: shareSum }
      );
    }
  }

  if (spec.flours.some((f) => !f.ingredient_id || !f.ingredient_id.trim())) {
    throw new CostEngineValidationError('INVALID_DOUGH_SPEC', 'Cada harina debe tener un ingredient_id.');
  }

  const components: RecipeComponent[] = [];

  for (const f of spec.flours) {
    const fraction = usesWeights
      ? (f.weight_kg ?? 0) / weightSum
      : (f.share_pct ?? 0) / 100;
    const grams = flourTotalG * fraction;
    if (grams > 0) {
      components.push({
        component_type: 'ingredient',
        ingredient_id: f.ingredient_id,
        quantity: grams,
        unit: 'g',
      });
    }
  }

  if (waterTotalG > 0 && spec.water_ingredient_id) {
    components.push({
      component_type: 'ingredient',
      ingredient_id: spec.water_ingredient_id,
      quantity: waterTotalG,
      unit: 'g',
    });
  }

  // Cada prefermento conserva su propio insumo de levadura: no mezclar costos
  // cuando biga, poolish y levadura directa usan productos diferentes.
  const yeastComponents: Array<{ ingredientId: string | undefined; quantityG: number; source: string }> = [
    {
      ingredientId: spec.biga?.yeast_ingredient_id,
      quantityG: flourTotalG * (bigaFlourPct / 100) * (bigaYeastPct / 100),
      source: 'biga',
    },
    {
      ingredientId: spec.poolish?.yeast_ingredient_id,
      quantityG: flourTotalG * (poolishFlourPct / 100) * (poolishYeastPct / 100),
      source: 'poolish',
    },
    {
      ingredientId: spec.yeast_ingredient_id,
      quantityG: flourTotalG * (directYeastPct / 100),
      source: 'direct_yeast',
    },
  ];

  for (const yeast of yeastComponents) {
    if (yeast.quantityG <= 0) continue;
    if (!yeast.ingredientId || !yeast.ingredientId.trim()) {
      throw new CostEngineValidationError(
        'INVALID_DOUGH_SPEC',
        `Falta el ingrediente de levadura para "${yeast.source}" aunque su porcentaje es mayor a cero.`,
        { source: yeast.source, quantity_g: yeast.quantityG }
      );
    }
    components.push({
      component_type: 'ingredient',
      ingredient_id: yeast.ingredientId,
      quantity: yeast.quantityG,
      unit: 'g',
    });
  }

  // Los porcentajes positivos deben tener un insumo asignado; nunca omitir un costo silenciosamente.
  if (saltPct > 0 && !spec.salt_ingredient_id?.trim()) {
    throw new CostEngineValidationError('INVALID_DOUGH_SPEC', 'Falta asignar el insumo de sal.');
  }
  if (sugarPct > 0 && !spec.sugar_ingredient_id?.trim()) {
    throw new CostEngineValidationError('INVALID_DOUGH_SPEC', 'Falta asignar el insumo de azúcar.');
  }
  if (oilPct > 0 && !spec.oil_ingredient_id?.trim()) {
    throw new CostEngineValidationError('INVALID_DOUGH_SPEC', 'Falta asignar el insumo de aceite.');
  }

  // Sal
  const saltG = flourTotalG * (saltPct / 100);
  if (saltG > 0 && spec.salt_ingredient_id) {
    components.push({
      component_type: 'ingredient',
      ingredient_id: spec.salt_ingredient_id,
      quantity: saltG,
      unit: 'g',
    });
  }

  // Azúcar
  const sugarG = flourTotalG * (sugarPct / 100);
  if (sugarG > 0 && spec.sugar_ingredient_id) {
    components.push({
      component_type: 'ingredient',
      ingredient_id: spec.sugar_ingredient_id,
      quantity: sugarG,
      unit: 'g',
    });
  }

  // Aceite
  const oilG = flourTotalG * (oilPct / 100);
  if (oilG > 0 && spec.oil_ingredient_id) {
    components.push({
      component_type: 'ingredient',
      ingredient_id: spec.oil_ingredient_id,
      quantity: oilG,
      unit: 'g',
    });
  }

  return {
    components,
    yieldQuantityG,
    flourTotalG,
    waterTotalG,
  };
}

export class CostEngine {
  private readonly ingredientsById = new Map<string, Ingredient>();
  private readonly recipesById = new Map<string, Recipe>();
  private readonly purchasePrices: PurchasePrice[];
  private readonly exchangeRates: ExchangeRate[];
  private readonly asOfDate?: string;
  private readonly resultCache = new Map<string, CostResult>();
  public subrecipeEvaluationCount = new Map<string, number>();

  constructor(private readonly catalog: CostCatalog) {
    for (const ing of catalog.ingredients) {
      this.ingredientsById.set(ing.id, ing);
    }
    for (const rec of catalog.recipes) {
      this.recipesById.set(rec.id, rec);
    }
    this.purchasePrices = catalog.purchase_prices ?? [];
    this.exchangeRates = catalog.exchange_rates ?? [];
    this.asOfDate = catalog.as_of_date;
  }

  public calculateRecipeCost(recipeId: string, activePath: string[] = []): CostResult {
    if (activePath.includes(recipeId)) {
      throw new CostEngineValidationError(
        'SUBRECIPE_CYCLE_DETECTED',
        `Ciclo detectado entre subrecetas: ${[...activePath, recipeId].join(' -> ')}`,
        { cycle: [...activePath, recipeId] }
      );
    }

    const cached = this.resultCache.get(recipeId);
    if (cached) {
      return cached;
    }

    const recipe = this.recipesById.get(recipeId);
    if (!recipe) {
      throw new CostEngineValidationError(
        'SUBRECIPE_NOT_FOUND',
        `No se encontró la receta o subreceta con id "${recipeId}".`,
        { recipeId }
      );
    }

    this.subrecipeEvaluationCount.set(recipeId, (this.subrecipeEvaluationCount.get(recipeId) ?? 0) + 1);

    let effectiveComponents: RecipeComponent[] = recipe.components ?? [];
    let effectiveYieldQty = recipe.yield_quantity;
    let effectiveYieldUnit: UnitCode = recipe.yield_unit;

    if (recipe.bakers_dough) {
      const expanded = expandBakersDoughSpec(recipe.bakers_dough);
      effectiveComponents = expanded.components;
      if (!effectiveYieldQty || effectiveYieldQty <= 0) {
        effectiveYieldQty = expanded.yieldQuantityG;
        effectiveYieldUnit = 'g';
      }
    }

    if (!Number.isFinite(effectiveYieldQty) || effectiveYieldQty <= 0) {
      throw new CostEngineValidationError(
        'INVALID_RECIPE_YIELD',
        `El rendimiento (yield_quantity) de la receta "${recipe.name}" debe ser mayor a cero.`,
        { recipeId: recipe.id, yield_quantity: effectiveYieldQty }
      );
    }
    getUnitDefinition(effectiveYieldUnit);

    const nextPath = [...activePath, recipeId];
    const breakdowns: ComponentCostBreakdown[] = [];
    const missingInputs: MissingInput[] = [];
    const warnings: string[] = [];
    let rawPartialBatchCost = 0;
    let isComplete = true;

    for (const comp of effectiveComponents) {
      if (comp.exclude_from_cost) {
        const excludedLabel = comp.ingredient_id ?? comp.recipe_id ?? 'unknown';
        warnings.push(`Componente "${excludedLabel}" excluido deliberadamente del costo.`);
        breakdowns.push({
          component_type: comp.component_type,
          id: excludedLabel,
          name: excludedLabel,
          quantity: comp.quantity,
          unit: comp.unit,
          normalized_quantity: comp.quantity,
          cost_unit: comp.unit,
          raw_unit_cost: 0,
          raw_total_cost: 0,
          total_cost: '0.00',
          status: 'excluded',
        });
        continue;
      }

      if (comp.component_type === 'ingredient') {
        const ingId = comp.ingredient_id ?? '';
        const ingredient = this.ingredientsById.get(ingId);
        if (!ingredient) {
          isComplete = false;
          missingInputs.push({
            ingredient_id: ingId,
            ingredient_name: ingId,
            reason: 'missing_ingredient',
          });
          continue;
        }
        if (!ingredient.is_active) {
          isComplete = false;
          missingInputs.push({
            ingredient_id: ingredient.id,
            ingredient_name: ingredient.name,
            reason: 'inactive_ingredient',
          });
          continue;
        }

        const normalizedQty = convertQuantity(
          comp.quantity,
          comp.unit,
          ingredient.base_unit,
          ingredient
        );

        const priceRecord = selectEffectivePurchasePrice(ingredient.id, this.purchasePrices, this.asOfDate);
        const unitCostInfo = computeUsableIngredientCost(
          ingredient,
          priceRecord,
          recipe.currency,
          this.exchangeRates,
          this.asOfDate
        );

        if (unitCostInfo.status === 'missing' || unitCostInfo.usableUnitCostInBase === null) {
          isComplete = false;
          missingInputs.push({
            ingredient_id: ingredient.id,
            ingredient_name: ingredient.name,
            reason: 'missing_purchase_price',
          });
          warnings.push(
            `Falta precio de compra válido para el ingrediente "${ingredient.name}". No se puede presentar un costo ni precio sugerido definitivo.`
          );
          breakdowns.push({
            component_type: 'ingredient',
            id: ingredient.id,
            name: ingredient.name,
            quantity: comp.quantity,
            unit: comp.unit,
            normalized_quantity: normalizedQty,
            cost_unit: ingredient.base_unit,
            raw_unit_cost: null,
            raw_total_cost: null,
            total_cost: null,
            status: 'incomplete',
          });
        } else {
          const compTotal = normalizedQty * unitCostInfo.usableUnitCostInBase;
          rawPartialBatchCost += compTotal;
          breakdowns.push({
            component_type: 'ingredient',
            id: ingredient.id,
            name: ingredient.name,
            quantity: comp.quantity,
            unit: comp.unit,
            normalized_quantity: normalizedQty,
            cost_unit: ingredient.base_unit,
            raw_unit_cost: unitCostInfo.usableUnitCostInBase,
            raw_total_cost: compTotal,
            total_cost: formatDecimal(compTotal, 2),
            status: 'complete',
          });
        }
      } else {
        const subId = comp.recipe_id ?? '';
        const subResult = this.calculateRecipeCost(subId, nextPath);
        const subRecipe = this.recipesById.get(subId)!;

        if (subRecipe.currency.toUpperCase() !== recipe.currency.toUpperCase()) {
          resolveCurrencyMultiplier(subRecipe.currency, recipe.currency, this.exchangeRates, this.asOfDate);
        }

        const normalizedQty = convertQuantity(
          comp.quantity,
          comp.unit,
          subResult.yield_unit
        );

        if (subResult.status === 'incomplete' || subResult.raw_unit_cost === null) {
          isComplete = false;
          for (const mi of subResult.missing_inputs) {
            if (!missingInputs.some((x) => x.ingredient_id === mi.ingredient_id && x.reason === mi.reason)) {
              missingInputs.push(mi);
            }
          }
          warnings.push(`La subreceta "${subRecipe.name}" tiene costos incompletos.`);
          breakdowns.push({
            component_type: 'subrecipe',
            id: subRecipe.id,
            name: subRecipe.name,
            quantity: comp.quantity,
            unit: comp.unit,
            normalized_quantity: normalizedQty,
            cost_unit: subResult.yield_unit,
            raw_unit_cost: null,
            raw_total_cost: null,
            total_cost: null,
            status: 'incomplete',
          });
        } else {
          const fx = resolveCurrencyMultiplier(subRecipe.currency, recipe.currency, this.exchangeRates, this.asOfDate);
          const subUnitCostInRecipeCurrency = subResult.raw_unit_cost * fx;
          const compTotal = normalizedQty * subUnitCostInRecipeCurrency;
          rawPartialBatchCost += compTotal;
          breakdowns.push({
            component_type: 'subrecipe',
            id: subRecipe.id,
            name: subRecipe.name,
            quantity: comp.quantity,
            unit: comp.unit,
            normalized_quantity: normalizedQty,
            cost_unit: subResult.yield_unit,
            raw_unit_cost: subUnitCostInRecipeCurrency,
            raw_total_cost: compTotal,
            total_cost: formatDecimal(compTotal, 2),
            status: 'complete',
          });
        }
      }
    }

    const rawBatchCost = isComplete ? rawPartialBatchCost : null;
    const rawUnitCost = isComplete && rawBatchCost !== null ? rawBatchCost / effectiveYieldQty : null;

    // Calcular cost_per_kg si la unidad de rendimiento es de masa
    let costPerKg: number | null = null;
    if (isComplete && rawBatchCost !== null) {
      const yieldDef = getUnitDefinition(effectiveYieldUnit);
      if (yieldDef.dimension === 'mass') {
        const yieldInKg = convertQuantity(effectiveYieldQty, effectiveYieldUnit, 'kg');
        costPerKg = yieldInKg > 0 ? rawBatchCost / yieldInKg : null;
      }
    }

    const snapshotHash = computeSnapshotHash({
      engine_version: ENGINE_VERSION,
      recipe,
      as_of_date: this.asOfDate ?? null,
      purchase_prices: this.purchasePrices,
      exchange_rates: this.exchangeRates,
      breakdowns: breakdowns.map((b) => ({
        id: b.id,
        qty: b.normalized_quantity,
        unit: b.cost_unit,
        unit_cost: b.raw_unit_cost,
        status: b.status,
      })),
    });

    const result: CostResult = {
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      status: isComplete ? 'complete' : 'incomplete',
      currency: recipe.currency,
      batch_cost: rawBatchCost !== null ? formatDecimal(rawBatchCost, 2) : null,
      raw_batch_cost: rawBatchCost,
      partial_batch_cost: formatDecimal(rawPartialBatchCost, 2),
      raw_partial_batch_cost: rawPartialBatchCost,
      yield_quantity: String(effectiveYieldQty),
      raw_yield_quantity: effectiveYieldQty,
      yield_unit: effectiveYieldUnit,
      unit_cost: rawUnitCost !== null ? formatDecimal(rawUnitCost, 2) : null,
      raw_unit_cost: rawUnitCost,
      cost_per_kg: costPerKg,
      components: breakdowns,
      missing_inputs: missingInputs,
      warnings,
      calculated_at: new Date().toISOString(),
      input_snapshot_hash: snapshotHash,
      engine_version: ENGINE_VERSION,
    };

    this.resultCache.set(recipeId, result);
    return result;
  }
}

/**
 * Calcula el escenario de precios, food cost %, gross profit, gross margin % y markup %.
 * Mantiene diferenciados:
 * - food_cost_pct = (ingredient_cost / price) * 100
 * - gross_margin_pct = ((price - ingredient_cost) / price) * 100
 * - markup_pct = ((price - ingredient_cost) / ingredient_cost) * 100
 */
export function calculatePricingScenario(input: PricingScenarioInput): PricingScenarioResult {
  const currency = input.currency ?? 'ARS';
  const roundingMode = input.rounding_mode ?? 'ceil';
  const packagingCost = input.packaging_cost ?? 0;
  const channelFeePct = input.channel_fee_pct ?? 0;

  if (
    !Number.isFinite(input.target_food_cost_pct) ||
    input.target_food_cost_pct <= 0 ||
    input.target_food_cost_pct >= 100
  ) {
    throw new CostEngineValidationError(
      'INVALID_PRICING_PARAMETERS',
      `El food cost objetivo (${input.target_food_cost_pct}%) debe ser > 0 y < 100.`,
      { target_food_cost_pct: input.target_food_cost_pct }
    );
  }

  if (roundingMode !== 'none' && (!Number.isFinite(input.rounding_increment) || input.rounding_increment <= 0)) {
    throw new CostEngineValidationError(
      'INVALID_PRICING_PARAMETERS',
      `El incremento de redondeo (${input.rounding_increment}) debe ser mayor a cero.`,
      { rounding_increment: input.rounding_increment }
    );
  }

  if (packagingCost < 0 || channelFeePct < 0 || channelFeePct >= 100) {
    throw new CostEngineValidationError(
      'INVALID_PRICING_PARAMETERS',
      'Los costos variables de canal (packaging_cost, channel_fee_pct) deben ser válidos.',
      { packagingCost, channelFeePct }
    );
  }

  if (input.status === 'incomplete' || input.unit_cost === null || input.unit_cost === undefined) {
    return {
      status: 'incomplete',
      currency,
      target_food_cost_pct: input.target_food_cost_pct,
      rounding_increment: input.rounding_increment,
      rounding_mode: roundingMode,
      minimum_price: null,
      raw_minimum_price: null,
      suggested_price: null,
      raw_suggested_price: null,
      evaluated_price: null,
      raw_evaluated_price: null,
      gross_profit: null,
      raw_gross_profit: null,
      food_cost_pct: null,
      gross_margin_pct: null,
      markup_pct: null,
      packaging_cost: formatDecimal(packagingCost, 2),
      channel_fee_pct: channelFeePct,
      net_contribution_after_channel: null,
      raw_net_contribution_after_channel: null,
      warnings: ['No se puede calcular food cost ni precio sugerido definitivo para una receta incompleta.'],
    };
  }

  if (!Number.isFinite(input.unit_cost) || input.unit_cost <= 0) {
    throw new CostEngineValidationError(
      'INVALID_PRICING_PARAMETERS',
      `El costo unitario de ingredientes (${input.unit_cost}) debe ser un número positivo.`,
      { unit_cost: input.unit_cost }
    );
  }

  if (input.selling_price !== undefined && (!Number.isFinite(input.selling_price) || input.selling_price <= 0)) {
    throw new CostEngineValidationError(
      'INVALID_PRICING_PARAMETERS',
      `El precio de venta evaluado (${input.selling_price}) debe ser mayor a cero.`,
      { selling_price: input.selling_price }
    );
  }

  const targetFraction = input.target_food_cost_pct / 100;
  const rawMinimumPrice = input.unit_cost / targetFraction;

  let rawSuggestedPrice = rawMinimumPrice;
  if (roundingMode !== 'none') {
    const inc = input.rounding_increment;
    const ratio = rawMinimumPrice / inc;
    // Evitar que 4000 / 500 = 8.000000000000002 salte al siguiente escalón por imprecisión IEEE-754
    const cleanRatio = Math.abs(ratio - Math.round(ratio)) < 1e-12 ? Math.round(ratio) : ratio;
    if (roundingMode === 'ceil') {
      rawSuggestedPrice = Math.ceil(cleanRatio) * inc;
    } else if (roundingMode === 'floor') {
      rawSuggestedPrice = Math.floor(cleanRatio) * inc;
    } else {
      rawSuggestedPrice = Math.round(cleanRatio) * inc;
    }
  }

  const rawEvaluatedPrice = input.selling_price ?? rawSuggestedPrice;
  const rawGrossProfit = rawEvaluatedPrice - input.unit_cost;
  const foodCostPct = (input.unit_cost / rawEvaluatedPrice) * 100;
  const grossMarginPct = (rawGrossProfit / rawEvaluatedPrice) * 100;
  const markupPct = (rawGrossProfit / input.unit_cost) * 100;

  const channelFeeAmount = rawEvaluatedPrice * (channelFeePct / 100);
  const rawNetContribution = rawGrossProfit - packagingCost - channelFeeAmount;

  return {
    status: 'complete',
    currency,
    target_food_cost_pct: input.target_food_cost_pct,
    rounding_increment: input.rounding_increment,
    rounding_mode: roundingMode,
    minimum_price: formatDecimal(rawMinimumPrice, 2),
    raw_minimum_price: rawMinimumPrice,
    suggested_price: formatDecimal(rawSuggestedPrice, 2),
    raw_suggested_price: rawSuggestedPrice,
    evaluated_price: formatDecimal(rawEvaluatedPrice, 2),
    raw_evaluated_price: rawEvaluatedPrice,
    gross_profit: formatDecimal(rawGrossProfit, 2),
    raw_gross_profit: rawGrossProfit,
    food_cost_pct: foodCostPct,
    gross_margin_pct: grossMarginPct,
    markup_pct: markupPct,
    packaging_cost: formatDecimal(packagingCost, 2),
    channel_fee_pct: channelFeePct,
    net_contribution_after_channel: formatDecimal(rawNetContribution, 2),
    raw_net_contribution_after_channel: rawNetContribution,
    warnings: [],
  };
}

/**
 * Crea un snapshot inmutable del resultado de costo y de todos sus inputs asociados.
 * Cualquier cambio futuro en el catálogo no altera este snapshot.
 */
export function createCostSnapshot(
  catalog: CostCatalog,
  recipeId: string,
  pricingOptions?: Omit<PricingScenarioInput, 'unit_cost' | 'status' | 'currency'>
): CostSnapshot {
  const engine = new CostEngine(catalog);
  const costResult = engine.calculateRecipeCost(recipeId);
  const recipe = catalog.recipes.find((r) => r.id === recipeId)!;

  const pricingScenario = pricingOptions
    ? calculatePricingScenario({
        unit_cost: costResult.raw_unit_cost,
        status: costResult.status,
        currency: costResult.currency,
        ...pricingOptions,
      })
    : undefined;

  const snapshot: CostSnapshot = JSON.parse(
    JSON.stringify({
      snapshot_id: `snap_${recipeId}_${computeSnapshotHash({ cost_input_hash: costResult.input_snapshot_hash, pricing_options: pricingOptions ?? null })}`,
      input_snapshot_hash: computeSnapshotHash({ cost_input_hash: costResult.input_snapshot_hash, pricing_options: pricingOptions ?? null }),
      created_at: costResult.calculated_at,
      engine_version: ENGINE_VERSION,
      recipe_id: recipeId,
      cost_result: costResult,
      pricing_scenario: pricingScenario,
      frozen_inputs: {
        recipe,
        ingredients: catalog.ingredients,
        purchase_prices: catalog.purchase_prices,
        exchange_rates: catalog.exchange_rates ?? [],
        as_of_date: catalog.as_of_date ?? null,
        pricing_options: pricingOptions ?? null,
      },
    })
  );

  return Object.freeze(snapshot);
}

/**
 * Simula cambios porcentuales de costos y precios sobre un conjunto de recetas.
 * Los productos incompletos permanecen incompletos: nunca se sustituyen costos faltantes por cero.
 */
export function calculatePortfolioScenario(input: PortfolioScenarioInput): PortfolioScenarioResult {
  const roundingIncrement = input.rounding_increment ?? 100;
  const targetFoodCostPct = input.target_food_cost_pct ?? 30;
  if (
    !Number.isFinite(input.cost_delta_pct) ||
    !Number.isFinite(input.price_delta_pct) ||
    input.cost_delta_pct <= -100 ||
    input.price_delta_pct <= -100 ||
    !Number.isFinite(roundingIncrement) ||
    roundingIncrement <= 0
  ) {
    throw new CostEngineValidationError(
      'INVALID_PRICING_PARAMETERS',
      'Las variaciones deben ser finitas y mayores a -100%; el redondeo debe ser positivo.'
    );
  }

  const rows: PortfolioScenarioRow[] = input.items.map((item) => {
    if (item.status !== 'complete' || item.unit_cost === null || !Number.isFinite(item.unit_cost) || item.unit_cost <= 0) {
      return {
        id: item.id,
        name: item.name,
        status: 'incomplete',
        current_cost: null,
        simulated_cost: null,
        current_price: item.selling_price !== null && item.selling_price > 0 ? item.selling_price : null,
        simulated_price: null,
        current_food_cost_pct: null,
        simulated_food_cost_pct: null,
        current_margin: null,
        simulated_margin: null,
      };
    }

    const currentPrice = item.selling_price !== null && Number.isFinite(item.selling_price) && item.selling_price > 0
      ? item.selling_price
      : null;
    const simulatedCost = item.unit_cost * (1 + input.cost_delta_pct / 100);
    const simulatedPrice = currentPrice === null
      ? null
      : Math.round((currentPrice * (1 + input.price_delta_pct / 100)) / roundingIncrement) * roundingIncrement;

    const currentScenario = calculatePricingScenario({
      unit_cost: item.unit_cost,
      status: 'complete',
      currency: 'ARS',
      target_food_cost_pct: targetFoodCostPct,
      rounding_increment: roundingIncrement,
      rounding_mode: 'nearest',
      ...(currentPrice !== null ? { selling_price: currentPrice } : {}),
    });
    const simulatedScenario = calculatePricingScenario({
      unit_cost: simulatedCost,
      status: 'complete',
      currency: 'ARS',
      target_food_cost_pct: targetFoodCostPct,
      rounding_increment: roundingIncrement,
      rounding_mode: 'nearest',
      ...(simulatedPrice !== null ? { selling_price: simulatedPrice } : {}),
    });

    return {
      id: item.id,
      name: item.name,
      status: 'complete',
      current_cost: item.unit_cost,
      simulated_cost: simulatedCost,
      current_price: currentPrice,
      simulated_price: simulatedPrice,
      current_food_cost_pct: currentScenario.food_cost_pct,
      simulated_food_cost_pct: simulatedScenario.food_cost_pct,
      current_margin: currentScenario.gross_profit === null ? null : Number(currentScenario.gross_profit),
      simulated_margin: simulatedScenario.gross_profit === null ? null : Number(simulatedScenario.gross_profit),
    };
  });

  const pricedRows = rows.filter((row) => row.status === 'complete' && row.current_price !== null && row.simulated_price !== null);
  const currentRevenue = pricedRows.reduce((sum, row) => sum + (row.current_price ?? 0), 0);
  const simulatedRevenue = pricedRows.reduce((sum, row) => sum + (row.simulated_price ?? 0), 0);
  const currentCost = pricedRows.reduce((sum, row) => sum + (row.current_cost ?? 0), 0);
  const simulatedCost = pricedRows.reduce((sum, row) => sum + (row.simulated_cost ?? 0), 0);

  return {
    rows,
    complete_items: rows.filter((row) => row.status === 'complete').length,
    incomplete_items: rows.filter((row) => row.status === 'incomplete').length,
    current_revenue: currentRevenue,
    simulated_revenue: simulatedRevenue,
    current_cost: currentCost,
    simulated_cost: simulatedCost,
    current_food_cost_pct: currentRevenue > 0 ? (currentCost / currentRevenue) * 100 : null,
    simulated_food_cost_pct: simulatedRevenue > 0 ? (simulatedCost / simulatedRevenue) * 100 : null,
    current_margin: currentRevenue > 0 ? ((currentRevenue - currentCost) / currentRevenue) * 100 : null,
    simulated_margin: simulatedRevenue > 0 ? ((simulatedRevenue - simulatedCost) / simulatedRevenue) * 100 : null,
  };
}
