import { areUnitsCompatible, type Ingredient, type PurchasePrice, type Recipe, type UnitCode } from '@pizzalog/cost-engine';
import type { ParsedImportSheet } from './importFileParser';
import type { ToolsWorkspaceState, OperatingExpenseItem } from './demoData';

export interface ImportSheetMapping {
  sheet_index: number;
  name: string;
  kind: 'ingredients' | 'purchase_prices' | 'recipes' | 'operating_expenses' | 'unknown';
  header_row_index: number;
  headers: string[];
  columns: Record<string, number | null>;
  confidence: number;
  warnings: string[];
  row_count: number;
}

export interface AppliedImport {
  workspace: ToolsWorkspaceState;
  counts: { ingredients: number; prices: number; recipes: number; expenses: number };
  warnings: string[];
}

const UNITS: UnitCode[] = ['kg', 'g', 'mg', 'lb', 'oz', 'L', 'l', 'ml', 'cc', 'fl_oz_us', 'gal_us', 'unit', 'u', 'dozen', 'docena'];

function cell(row: string[], mapping: ImportSheetMapping, ...fields: string[]): string {
  for (const field of fields) {
    const index = mapping.columns[field];
    if (index !== null && index !== undefined) return (row[index] ?? '').trim();
  }
  return '';
}

function parseNumber(raw: string): number | null {
  let value = raw.trim().replace(/[^0-9,.-]/g, '');
  if (!value || !/[0-9]/.test(value)) return null;
  const comma = value.lastIndexOf(',');
  const dot = value.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    const thousands = decimal === ',' ? /\./g : /,/g;
    value = value.replace(thousands, '').replace(decimal, '.');
  } else if (comma >= 0) {
    const decimals = value.length - comma - 1;
    value = decimals > 0 && decimals <= 2 ? value.replace(',', '.') : value.replace(/,/g, '');
  } else if (dot >= 0) {
    const decimals = value.length - dot - 1;
    if (decimals > 2) value = value.replace(/\./g, '');
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dimensionForUnit(unit: string): Ingredient['base_dimension'] | null {
  if (['kg', 'g', 'mg', 'lb', 'oz'].includes(unit)) return 'mass';
  if (['L', 'l', 'ml', 'cc', 'fl_oz_us', 'gal_us'].includes(unit)) return 'volume';
  if (['unit', 'u', 'dozen', 'docena'].includes(unit)) return 'count';
  return null;
}

function dimensionValue(raw: string): Ingredient['base_dimension'] | null {
  const value = raw.toLowerCase().trim();
  if (['mass', 'peso', 'masa'].includes(value)) return 'mass';
  if (['volume', 'volumen'].includes(value)) return 'volume';
  if (['count', 'countable', 'unidad', 'unidades', 'conteo'].includes(value)) return 'count';
  return null;
}

function normalizedName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function makeId(prefix: string, name: string, used: Set<string>): string {
  const base = `${prefix}_${normalizedName(name).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32) || 'item'}`;
  let id = base;
  let suffix = 2;
  while (used.has(id)) id = `${base}_${suffix++}`;
  used.add(id);
  return id;
}

function parseCategory(raw: string): OperatingExpenseItem['category'] | null {
  const value = normalizedName(raw);
  if (/rent|alquiler|renta|locacion/.test(value)) return 'rent';
  if (/payroll|salary|sueld|nomina|personal/.test(value)) return 'payroll';
  if (/electric|electricidad|luz|gas|agua|water|energy|energia|utility|utilities/.test(value)) return 'utilities';
  if (/software|subscription|suscripcion/.test(value)) return 'software';
  if (/tax|impuesto|tribut/.test(value)) return 'taxes';
  if (/other|otro|vario|maintenance|mantenimiento|service|servicio|professional|profesional/.test(value)) return 'other';
  return null;
}

function parsePeriod(raw: string): OperatingExpenseItem['period'] | null {
  const value = normalizedName(raw);
  if (/month|mensual|mes/.test(value)) return 'monthly';
  if (/week|semanal|semana/.test(value)) return 'weekly';
  if (/year|anual|ano|año/.test(value)) return 'yearly';
  return null;
}

function parseRecipeType(raw: string): Recipe['recipe_type'] | null {
  const value = normalizedName(raw);
  if (/sub.?recipe|subreceta|preparacion|preparado/.test(value)) return 'subrecipe';
  if (/product|producto|menu|carta|final/.test(value)) return 'product';
  return null;
}

function unitValue(raw: string): UnitCode | null {
  const value = raw.trim();
  return UNITS.includes(value as UnitCode) ? (value as UnitCode) : null;
}

function currencyValue(raw: string): string | null {
  const value = raw.trim().toUpperCase();
  if (!value) return null;
  return /^[A-Z]{3}$/.test(value) ? value : null;
}

function purchaseDateValue(raw: string): string | null | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  let iso = value;
  const local = value.match(/^(\\d{1,2})[\\/.\\-](\\d{1,2})[\\/.\\-](\\d{4})$/);
  if (local) iso = `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(iso)) return null;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

function hasCurrencyRate(
  source: string,
  target: string,
  rates: ToolsWorkspaceState['catalog']['exchange_rates'],
  asOfDate?: string
): boolean {
  const from = source.toUpperCase();
  const to = target.toUpperCase();
  if (from === to) return true;
  return (rates ?? []).some((rate) =>
    rate.from_currency.toUpperCase() === from &&
    rate.to_currency.toUpperCase() === to &&
    (!asOfDate || rate.effective_date <= asOfDate) &&
    Number.isFinite(rate.rate) &&
    rate.rate > 0
  );
}

export function applyImportMappings(
  current: ToolsWorkspaceState,
  sheets: ParsedImportSheet[],
  mappings: ImportSheetMapping[]
): AppliedImport {
  const ingredients = [...current.catalog.ingredients];
  const purchasePrices = [...current.catalog.purchase_prices];
  const recipes = [...current.catalog.recipes];
  const expenses = [...current.operatingExpenses];
  const usedIngredientIds = new Set(ingredients.map((item) => item.id));
  const usedRecipeIds = new Set(recipes.map((item) => item.id));
  const knownIngredients = new Map(ingredients.map((item) => [normalizedName(item.name), item]));
  const warnings: string[] = [];
  const counts = { ingredients: 0, prices: 0, recipes: 0, expenses: 0 };
  const pendingPrices: Array<{ name: string; price: PurchasePrice }> = [];
  const recipeRows = new Map<string, { name: string; type: Recipe['recipe_type']; yieldQuantity: number; yieldUnit: UnitCode; components: NonNullable<Recipe['components']> }>();
  const invalidRecipeKeys = new Set<string>();

  const orderedMappings = [...mappings].sort((a, b) => {
    const order = { ingredients: 0, purchase_prices: 1, recipes: 2, operating_expenses: 3, unknown: 4 };
    return order[a.kind] - order[b.kind];
  });

  for (const mapping of orderedMappings) {
    const sheet = sheets[mapping.sheet_index];
    if (!sheet) continue;
    if (mapping.kind === 'unknown') {
      warnings.push(`${mapping.name}: tipo de hoja no reconocido; no se importó.`);
      continue;
    }
    if (mapping.warnings.length) warnings.push(...mapping.warnings.map((warning) => `${mapping.name}: ${warning}`));

    const rows = sheet.rows.slice(mapping.header_row_index + 1);
    rows.forEach((row, rowOffset) => {
      const sourceRow = mapping.header_row_index + rowOffset + 2;

      if (mapping.kind === 'ingredients') {
        const name = cell(row, mapping, 'name', 'ingredient_name');
        if (!name) return;
        const baseUnit = unitValue(cell(row, mapping, 'base_unit'));
        const inferredDimension = baseUnit ? dimensionForUnit(baseUnit) : null;
        const declaredDimension = dimensionValue(cell(row, mapping, 'base_dimension'));
        if (!baseUnit || !inferredDimension || (declaredDimension && declaredDimension !== inferredDimension)) {
          warnings.push(`${mapping.name}, fila ${sourceRow}: la unidad base falta o no coincide con la dimensión indicada; se omitió el insumo.`);
          return;
        }
        const dimension = inferredDimension;

        let ingredient = knownIngredients.get(normalizedName(name));
        let allowPriceForIngredient = true;
        if (!ingredient) {
          const next: Ingredient = {
            id: makeId('imp_ing', name, usedIngredientIds),
            name,
            base_dimension: dimension,
            base_unit: baseUnit,
            is_active: true,
          };
          const density = parseNumber(cell(row, mapping, 'density_g_per_ml'));
          const unitWeight = parseNumber(cell(row, mapping, 'unit_weight_g'));
          if (density !== null && density > 0) next.density_g_per_ml = density;
          if (unitWeight !== null && unitWeight > 0) next.unit_weight_g = unitWeight;
          ingredients.push(next);
          knownIngredients.set(normalizedName(name), next);
          ingredient = next;
          counts.ingredients += 1;
        } else if (ingredient.base_unit !== baseUnit || ingredient.base_dimension !== dimension) {
          warnings.push(`${mapping.name}, fila ${sourceRow}: ${name} ya existe con otra unidad base; no se incorporó su precio.`);
          allowPriceForIngredient = false;
        }

        const price = parseNumber(cell(row, mapping, 'purchase_price'));
        const packQuantity = parseNumber(cell(row, mapping, 'pack_quantity'));
        const packUnit = unitValue(cell(row, mapping, 'pack_unit'));
        const currency = currencyValue(cell(row, mapping, 'currency'));
        const rawPurchaseDate = cell(row, mapping, 'purchase_date');
        const purchaseDate = purchaseDateValue(rawPurchaseDate);
        const yieldPct = parseNumber(cell(row, mapping, 'yield_pct')) ?? 100;
        const compatiblePack = Boolean(packUnit && areUnitsCompatible(packUnit, ingredient.base_unit, ingredient));
        const compatibleCurrency = Boolean(currency && hasCurrencyRate(
          currency, current.currency, current.catalog.exchange_rates, current.catalog.as_of_date
        ));
        if (price !== null && price > 0 && packQuantity !== null && packQuantity > 0 && packUnit && currency &&
            purchaseDate !== null && Number.isFinite(yieldPct) && yieldPct > 0 && yieldPct <= 100 &&
            compatiblePack && compatibleCurrency && allowPriceForIngredient) {
          pendingPrices.push({
            name,
            price: {
              ingredient_id: ingredient.id,
              purchase_price: price,
              ...(purchaseDate ? { purchase_date: purchaseDate } : {}),
              currency,
              pack_quantity: packQuantity,
              pack_unit: packUnit,
              yield_pct: yieldPct,
              supplier: cell(row, mapping, 'supplier') || undefined,
            },
          });
        } else if (price !== null || packQuantity !== null || packUnit || rawPurchaseDate) {
          const reason = rawPurchaseDate && purchaseDate === null
            ? 'fecha de precio inválida'
            : !compatiblePack
              ? 'unidad de presentación incompatible o sin equivalencia explícita'
              : !allowPriceForIngredient
                ? 'unidad base distinta a la ya registrada'
                : !currency
                  ? 'falta declarar la moneda del precio'
                  : !compatibleCurrency
                    ? 'falta un tipo de cambio explícito para la moneda importada'
                  : 'presentación, moneda, precio o rendimiento incompleto';
          warnings.push(`${mapping.name}, fila ${sourceRow}: ${reason}; se importó el insumo si correspondía, pero no el precio.`);
        }
        return;
      }

      if (mapping.kind === 'purchase_prices') {
        const name = cell(row, mapping, 'ingredient_name', 'name');
        const price = parseNumber(cell(row, mapping, 'purchase_price'));
        const packQuantity = parseNumber(cell(row, mapping, 'pack_quantity'));
        const packUnit = unitValue(cell(row, mapping, 'pack_unit'));
        const ingredient = knownIngredients.get(normalizedName(name));
        const currency = currencyValue(cell(row, mapping, 'currency'));
        const rawPurchaseDate = cell(row, mapping, 'purchase_date');
        const purchaseDate = purchaseDateValue(rawPurchaseDate);
        const yieldPct = parseNumber(cell(row, mapping, 'yield_pct')) ?? 100;
        const compatiblePack = Boolean(ingredient && packUnit && areUnitsCompatible(packUnit, ingredient.base_unit, ingredient));
        const compatibleCurrency = Boolean(currency && hasCurrencyRate(
          currency, current.currency, current.catalog.exchange_rates, purchaseDate ?? undefined
        ));
        if (!name || !ingredient || price === null || price <= 0 || packQuantity === null || packQuantity <= 0 ||
            !packUnit || !currency || purchaseDate === null || yieldPct <= 0 || yieldPct > 100 || !compatiblePack || !compatibleCurrency) {
          warnings.push(`${mapping.name}, fila ${sourceRow}: no se pudo vincular el precio a un insumo con presentación, fecha, rendimiento, moneda explícita y tipo de cambio válido.`);
          return;
        }
        pendingPrices.push({
          name,
          price: {
            ingredient_id: ingredient.id,
            purchase_price: price,
            ...(purchaseDate ? { purchase_date: purchaseDate } : {}),
            currency,
            pack_quantity: packQuantity,
            pack_unit: packUnit,
            yield_pct: yieldPct,
            supplier: cell(row, mapping, 'supplier') || undefined,
          },
        });
        return;
      }

      if (mapping.kind === 'operating_expenses') {
        const name = cell(row, mapping, 'expense_name', 'name');
        const amount = parseNumber(cell(row, mapping, 'expense_amount'));
        const category = parseCategory(cell(row, mapping, 'expense_category'));
        const period = parsePeriod(cell(row, mapping, 'expense_period'));
        if (!name || amount === null || amount < 0 || !category || !period) {
          warnings.push(`${mapping.name}, fila ${sourceRow}: falta nombre, importe, categoría o período reconocido; se omitió el gasto.`);
          return;
        }
        expenses.push({
          id: makeId('imp_exp', name, new Set(expenses.map((item) => item.id))),
          name,
          category,
          period,
          amount,
        });
        counts.expenses += 1;
        return;
      }

      if (mapping.kind === 'recipes') {
        const name = cell(row, mapping, 'recipe_name');
        const key = normalizedName(name);
        const recipeType = parseRecipeType(cell(row, mapping, 'recipe_type'));
        const yieldQuantity = parseNumber(cell(row, mapping, 'yield_quantity'));
        const yieldUnit = unitValue(cell(row, mapping, 'yield_unit'));
        const componentName = cell(row, mapping, 'component_name', 'ingredient_name');
        const componentQuantity = parseNumber(cell(row, mapping, 'component_quantity'));
        const componentUnit = unitValue(cell(row, mapping, 'component_unit'));
        const ingredient = knownIngredients.get(normalizedName(componentName));
        if (
          !name || !recipeType || yieldQuantity === null || yieldQuantity <= 0 || !yieldUnit ||
          !componentName || componentQuantity === null || componentQuantity <= 0 ||
          !componentUnit || !ingredient ||
          !areUnitsCompatible(componentUnit, ingredient.base_unit, ingredient)
        ) {
          if (key) invalidRecipeKeys.add(key);
          warnings.push(`${mapping.name}, fila ${sourceRow}: receta incompleta o componente sin insumo coincidente; se omitirá la receta completa para evitar un costo parcial.`);
          return;
        }

        const existing = recipeRows.get(key);
        if (existing && (existing.type !== recipeType || existing.yieldQuantity !== yieldQuantity || existing.yieldUnit !== yieldUnit)) {
          invalidRecipeKeys.add(key);
          warnings.push(`${mapping.name}, fila ${sourceRow}: datos de rendimiento inconsistentes para ${name}; se omitirá la receta completa.`);
          return;
        }
        const target: {
          name: string;
          type: Recipe['recipe_type'];
          yieldQuantity: number;
          yieldUnit: UnitCode;
          components: NonNullable<Recipe['components']>;
        } = existing ?? {
          name,
          type: recipeType,
          yieldQuantity,
          yieldUnit,
          components: [],
        };
        target.components.push({
          component_type: 'ingredient',
          ingredient_id: ingredient.id,
          quantity: componentQuantity,
          unit: componentUnit,
        });
        recipeRows.set(key, target);
      }
    });
  }

  for (const item of pendingPrices) {
    const incoming = item.price;
    const supplierKey = normalizedName(incoming.supplier ?? '');
    const existingIndex = purchasePrices.findIndex((price) =>
      price.ingredient_id === incoming.ingredient_id &&
      (price.purchase_date ?? '') === (incoming.purchase_date ?? '') &&
      normalizedName(price.supplier ?? '') === supplierKey
    );
    if (existingIndex >= 0) purchasePrices[existingIndex] = incoming;
    else purchasePrices.push(incoming);
    counts.prices += 1;
  }

  for (const [key, row] of recipeRows) {
    const name = row.name;
    if (invalidRecipeKeys.has(key)) {
      warnings.push(`La receta ${name} contiene una o más líneas sin validar y no se importó.`);
      continue;
    }
    if (recipes.some((recipe) => normalizedName(recipe.name) === key)) {
      warnings.push(`La receta ${name} ya existe; no se duplicó.`);
      continue;
    }
    recipes.push({
      id: makeId('imp_recipe', name, usedRecipeIds),
      name,
      recipe_type: row.type,
      yield_quantity: row.yieldQuantity,
      yield_unit: row.yieldUnit,
      currency: current.currency,
      components: row.components ?? [],
    });
    counts.recipes += 1;
  }

  return {
    workspace: {
      ...current,
      catalog: { ...current.catalog, ingredients, purchase_prices: purchasePrices, recipes },
      operatingExpenses: expenses,
    },
    counts,
    warnings: warnings.slice(0, 60),
  };
}
