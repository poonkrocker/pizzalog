import { createCostSnapshot, type CostCatalog, type CostSnapshot } from '@pizzalog/cost-engine';

export type LocaleCode = 'es-AR' | 'pt-BR' | 'en';

export interface OperatingExpenseItem {
  id: string;
  name: string;
  category: 'rent' | 'payroll' | 'utilities' | 'software' | 'taxes' | 'other';
  period: 'monthly' | 'weekly' | 'yearly';
  amount: number;
}

export interface ProductSalesPlan {
  monthlyUnitsSold?: number | null;
  /** Si es 0 o null, usa el Precio Sugerido calculado automáticamente */
  sellingPrice?: number | null;
}

export interface SalesImportRecord {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  period_start: string;
  period_end: string;
  channel?: string | null;
  gross_revenue?: number | null;
  net_revenue?: number | null;
  source: string;
  imported_at: string;
}

export interface ToolsWorkspaceState {
  businessName: string;
  currency: string;
  locale: LocaleCode;
  unitSystem: 'metric' | 'us_customary';
  defaultTargetFoodCostPct: number;
  defaultRoundingIncrement: number;
  defaultPackagingCost: number;
  defaultChannelFeePct: number;
  catalog: CostCatalog;
  productSalesMap: Record<string, ProductSalesPlan>;
  salesHistory?: SalesImportRecord[];
  salesPeriod?: string | null;
  operatingExpenses: OperatingExpenseItem[];
  snapshots: CostSnapshot[];
  equivalences?: Record<string, string>;
}

export const I18N: Record<
  LocaleCode,
  {
    subtitle: string;
    tabIngredients: string;
    tabSubrecipes: string;
    tabRecipes: string;
    tabExpenses: string;
    tabSnapshots: string;
    exportCustomExcel: string;
    downloadTemplateExcel: string;
    resetDemo: string;
    exportJson: string;
    importJson: string;
    saveSnapshot: string;
    statusComplete: string;
    statusIncomplete: string;
  }
> = {
  'es-AR': {
    subtitle: 'Restaurant Profit Kit v1 — Constructor de Recetas, Mermas, Ingeniería de Menú y Rentabilidad Neta',
    tabIngredients: '1. Insumos y Merma',
    tabSubrecipes: '2. Masas y Subrecetas',
    tabRecipes: '3. Recetas, Precios y Ventas/Mes',
    tabExpenses: '4. Alquiler, Costos Fijos y Ganancia Neta',
    tabSnapshots: '5. Snapshots y Golden Tests',
    exportCustomExcel: '📊 Exportar Mi Excel (.xlsx)',
    downloadTemplateExcel: '📘 Plantilla Base',
    resetDemo: 'Restaurar Demo',
    exportJson: 'Exportar JSON',
    importJson: 'Importar JSON',
    saveSnapshot: 'Guardar Snapshot',
    statusComplete: 'COMPLETO',
    statusIncomplete: 'INCOMPLETO (FALTA PRECIO)',
  },
  'pt-BR': {
    subtitle: 'Restaurant Profit Kit v1 — Construtor de Fichas Técnicas, Perdas, Engenharia de Cardápio e Lucro Líquido',
    tabIngredients: '1. Insumos e Perdas',
    tabSubrecipes: '2. Massas e Sub-receitas',
    tabRecipes: '3. Receitas, Preços e Vendas/Mês',
    tabExpenses: '4. Aluguel, Custos Fixos e Lucro Líquido',
    tabSnapshots: '5. Snapshots e Golden Tests',
    exportCustomExcel: '📊 Exportar Meu Excel (.xlsx)',
    downloadTemplateExcel: '📘 Planilha Base',
    resetDemo: 'Restaurar Demo',
    exportJson: 'Exportar JSON',
    importJson: 'Importar JSON',
    saveSnapshot: 'Salvar Snapshot',
    statusComplete: 'COMPLETO',
    statusIncomplete: 'INCOMPLETO (SEM PREÇO)',
  },
  en: {
    subtitle: 'Restaurant Profit Kit v1 — Interactive Recipe Builder, Yield, Menu Engineering & Net Profit',
    tabIngredients: '1. Ingredients & Yield',
    tabSubrecipes: '2. Dough & Subrecipes',
    tabRecipes: '3. Recipes, Pricing & Monthly Sales',
    tabExpenses: '4. Rent, Fixed Costs & Net Profit',
    tabSnapshots: '5. Snapshots & Golden Tests',
    exportCustomExcel: '📊 Export My Excel (.xlsx)',
    downloadTemplateExcel: '📘 Base Template',
    resetDemo: 'Reset Demo',
    exportJson: 'Export JSON',
    importJson: 'Import JSON',
    saveSnapshot: 'Save Snapshot',
    statusComplete: 'COMPLETE',
    statusIncomplete: 'INCOMPLETE (MISSING PRICE)',
  },
};

export function isDemoWorkspace(state: ToolsWorkspaceState): boolean {
  const name = typeof state?.businessName === 'string' ? state.businessName : '';
  const recipes = Array.isArray(state?.catalog?.recipes) ? state.catalog.recipes : [];
  return name.includes('Il Forno') ||
    recipes.some((r) => r?.id === 'prod_margherita' && typeof r?.name === 'string' && r.name.includes('Demo'));
}

export function normalizeWorkspace(raw: Partial<ToolsWorkspaceState> | null | undefined): ToolsWorkspaceState {
  if (!raw || typeof raw !== 'object' || !raw.catalog || typeof raw.catalog !== 'object') {
    return createInitialDemoWorkspace();
  }
  const locale: LocaleCode =
    raw.locale === 'pt-BR' || raw.locale === 'en' || raw.locale === 'es-AR' ? raw.locale : 'es-AR';
  const currency = typeof raw.currency === 'string' && raw.currency.trim() !== '' ? raw.currency.trim() : 'ARS';
  const base = createEmptyWorkspace(locale, currency);

  const rawIngredients = Array.isArray(raw.catalog.ingredients) ? raw.catalog.ingredients.filter(Boolean) : [];
  const rawPrices = Array.isArray(raw.catalog.purchase_prices) ? raw.catalog.purchase_prices.filter(Boolean) : [];
  const rawRecipes = Array.isArray(raw.catalog.recipes) ? raw.catalog.recipes.filter(Boolean) : [];

  // Si el workspace ya fue sincronizado con Pizzalog App y se removió prod_margherita,
  // limpiar restos de IDs demo que hayan quedado de sincronizaciones previas.
  const hasSyncedFromApp =
    rawRecipes.some((r) => typeof r?.id === 'string' && (r.id.startsWith('prod_app_') || r.id.startsWith('sub_app_'))) ||
    rawIngredients.some((i) => typeof i?.id === 'string' && i.id.startsWith('ing_app_'));
  const hasMainDemoRecipe = rawRecipes.some((r) => r?.id === 'prod_margherita');
  const shouldStripLeftoverDemo = hasSyncedFromApp && !hasMainDemoRecipe;

  const demoIngSet = new Set([
    'ing_harina', 'ing_levadura', 'ing_sal', 'ing_agua', 'ing_tomate',
    'ing_aceite', 'ing_mozzarella', 'ing_pollo', 'ing_garbanzo', 'ing_trufa',
  ]);
  const demoRecSet = new Set([
    'sub_masa_poolish', 'sub_salsa', 'prod_margherita', 'prod_focaccia_a',
    'prod_pollo_merma', 'prod_trufa_incompleta',
  ]);
  const demoExpSet = new Set(['exp_1', 'exp_2', 'exp_3', 'exp_4']);
  const demoSnapSet = new Set(['snap_margh_sep', 'snap_margh_oct', 'snap_margh_nov']);

  const cleanIngredients = shouldStripLeftoverDemo
    ? rawIngredients.filter((i) => !demoIngSet.has(i.id))
    : rawIngredients;
  const cleanPrices = shouldStripLeftoverDemo
    ? rawPrices.filter((p) => !demoIngSet.has(p.ingredient_id))
    : rawPrices;
  const cleanRecipes = (shouldStripLeftoverDemo
    ? rawRecipes.filter((r) => !demoRecSet.has(r.id))
    : rawRecipes
  ).map((r) => ({
    ...r,
    id: String(r.id ?? ''),
    name: String(r.name ?? 'Receta sin nombre'),
    recipe_type: r.recipe_type === 'subrecipe' ? 'subrecipe' : 'product',
    yield_quantity: Number(r.yield_quantity) > 0 ? Number(r.yield_quantity) : 1,
    yield_unit: r.yield_unit || 'unit',
    currency: r.currency || currency,
    components: Array.isArray(r.components) ? r.components : undefined,
  })) as ToolsWorkspaceState['catalog']['recipes'];

  const rawExpenses = Array.isArray(raw.operatingExpenses) ? raw.operatingExpenses.filter(Boolean) : [];
  const cleanExpenses = shouldStripLeftoverDemo
    ? rawExpenses.filter((e) => !demoExpSet.has(e.id) && !(typeof e.name === 'string' && e.name.includes('(Demo)')))
    : rawExpenses;

  const rawSnapshots = Array.isArray(raw.snapshots) ? raw.snapshots.filter(Boolean) : [];
  const cleanSnapshots = shouldStripLeftoverDemo
    ? rawSnapshots.filter((s) => !demoSnapSet.has(s.snapshot_id) && !demoRecSet.has(s.recipe_id))
    : rawSnapshots;

  const rawSalesHistory = Array.isArray(raw.salesHistory) ? raw.salesHistory.filter(Boolean) : [];
  const cleanSalesHistory = rawSalesHistory
    .filter((s) => !shouldStripLeftoverDemo || !demoRecSet.has(s.product_id ?? ''))
    .map((s, idx) => ({
      ...s,
      id: String(s.id ?? `sale_${idx}`),
      product_id: s.product_id ?? null,
      product_name: String(s.product_name ?? 'Producto'),
      quantity: Number.isFinite(Number(s.quantity)) ? Number(s.quantity) : 0,
      period_start: typeof s.period_start === 'string' && s.period_start ? s.period_start : '2026-01-01',
      period_end: typeof s.period_end === 'string' && s.period_end ? s.period_end : (typeof s.period_start === 'string' && s.period_start ? s.period_start : '2026-01-31'),
      channel: typeof s.channel === 'string' ? s.channel : 'Mostrador',
      source: typeof s.source === 'string' ? s.source : 'Importado',
      imported_at: typeof s.imported_at === 'string' ? s.imported_at : '2026-01-01',
    }));

  const targetFc = Number(raw.defaultTargetFoodCostPct);
  const roundingInc = Number(raw.defaultRoundingIncrement);
  const pkgCost = Number(raw.defaultPackagingCost);
  const chanFee = Number(raw.defaultChannelFeePct);

  return {
    ...base,
    ...raw,
    businessName:
      typeof raw.businessName === 'string' && raw.businessName.trim() !== ''
        ? raw.businessName
        : 'Mi Pizzería',
    currency,
    locale,
    unitSystem: raw.unitSystem === 'us_customary' ? 'us_customary' : 'metric',
    defaultTargetFoodCostPct: Number.isFinite(targetFc) && targetFc > 0 && targetFc < 100 ? targetFc : 30,
    defaultRoundingIncrement: Number.isFinite(roundingInc) && roundingInc > 0 ? roundingInc : 100,
    defaultPackagingCost: Number.isFinite(pkgCost) && pkgCost >= 0 ? pkgCost : 0,
    defaultChannelFeePct: Number.isFinite(chanFee) && chanFee >= 0 && chanFee < 100 ? chanFee : 0,
    catalog: {
      ...raw.catalog,
      ingredients: cleanIngredients,
      purchase_prices: cleanPrices,
      recipes: cleanRecipes,
    },
    productSalesMap:
      raw.productSalesMap && typeof raw.productSalesMap === 'object' && !Array.isArray(raw.productSalesMap)
        ? raw.productSalesMap
        : {},
    salesHistory: cleanSalesHistory,
    operatingExpenses: cleanExpenses,
    snapshots: cleanSnapshots,
    equivalences:
      raw.equivalences && typeof raw.equivalences === 'object' && !Array.isArray(raw.equivalences)
        ? raw.equivalences
        : {},
  };
}

export function createEmptyWorkspace(locale: LocaleCode = 'es-AR', currency = 'ARS'): ToolsWorkspaceState {
  return {
    businessName: 'Mi Restaurante',
    currency,
    locale,
    unitSystem: locale === 'en' ? 'us_customary' : 'metric',
    defaultTargetFoodCostPct: 30,
    defaultRoundingIncrement: 100,
    defaultPackagingCost: 0,
    defaultChannelFeePct: 0,
    catalog: {
      ingredients: [],
      purchase_prices: [],
      recipes: [],
    },
    productSalesMap: {},
    salesHistory: [],
    salesPeriod: null,
    operatingExpenses: [],
    snapshots: [],
  };
}

export function createInitialDemoWorkspace(): ToolsWorkspaceState {
  const demoCatalog: CostCatalog = {
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
  };

  const snapSep: CostSnapshot = {
    ...createCostSnapshot(
      {
        ...demoCatalog,
        purchase_prices: demoCatalog.purchase_prices.map((p) =>
          p.ingredient_id === 'ing_mozzarella'
            ? { ...p, purchase_price: 1500 }
            : p.ingredient_id === 'ing_harina'
            ? { ...p, purchase_price: 20000 }
            : p
        ),
      },
      'prod_margherita',
      {
        selling_price: 3200,
        target_food_cost_pct: 30,
        rounding_increment: 500,
        rounding_mode: 'ceil',
        packaging_cost: 350,
        channel_fee_pct: 25,
      }
    ),
    snapshot_id: 'snap_margh_sep',
    created_at: '2026-09-10T15:00:00.000Z',
  };

  const snapOct: CostSnapshot = {
    ...createCostSnapshot(
      {
        ...demoCatalog,
        purchase_prices: demoCatalog.purchase_prices.map((p) =>
          p.ingredient_id === 'ing_mozzarella'
            ? { ...p, purchase_price: 1800 }
            : p.ingredient_id === 'ing_harina'
            ? { ...p, purchase_price: 22500 }
            : p
        ),
      },
      'prod_margherita',
      {
        selling_price: 3800,
        target_food_cost_pct: 30,
        rounding_increment: 500,
        rounding_mode: 'ceil',
        packaging_cost: 350,
        channel_fee_pct: 25,
      }
    ),
    snapshot_id: 'snap_margh_oct',
    created_at: '2026-10-12T15:00:00.000Z',
  };

  const snapNov: CostSnapshot = {
    ...createCostSnapshot(
      demoCatalog,
      'prod_margherita',
      {
        selling_price: 4200,
        target_food_cost_pct: 30,
        rounding_increment: 500,
        rounding_mode: 'ceil',
        packaging_cost: 350,
        channel_fee_pct: 25,
      }
    ),
    snapshot_id: 'snap_margh_nov',
    created_at: '2026-11-01T15:00:00.000Z',
  };

  return {
    businessName: 'Pizzería Demo — Il Forno',
    currency: 'ARS',
    locale: 'es-AR',
    unitSystem: 'metric',
    defaultTargetFoodCostPct: 30,
    defaultRoundingIncrement: 500,
    defaultPackagingCost: 350,
    defaultChannelFeePct: 25,
    salesPeriod: '2026-11',
    catalog: demoCatalog,
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
    salesHistory: [
      // Período 2026-10 (Octubre)
      { id: 'sale_10_margh_salon', product_id: 'prod_margherita', product_name: 'Pizza Margherita Clásica (Demo)', quantity: 450, period_start: '2026-10-01', period_end: '2026-10-31', channel: 'Salón', gross_revenue: 1710000, net_revenue: 1710000, source: 'TPV Salón', imported_at: '2026-11-01' },
      { id: 'sale_10_margh_deliv', product_id: 'prod_margherita', product_name: 'Pizza Margherita Clásica (Demo)', quantity: 300, period_start: '2026-10-01', period_end: '2026-10-31', channel: 'Delivery Propio', gross_revenue: 1140000, net_revenue: 1140000, source: 'WhatsApp / Web', imported_at: '2026-11-01' },
      { id: 'sale_10_margh_apps', product_id: 'prod_margherita', product_name: 'Pizza Margherita Clásica (Demo)', quantity: 140, period_start: '2026-10-01', period_end: '2026-10-31', channel: 'PedidosYa / Rappi', gross_revenue: 630000, net_revenue: 472500, source: 'PedidosYa', imported_at: '2026-11-01' },
      { id: 'sale_10_focac_salon', product_id: 'prod_focaccia_a', product_name: 'Focaccia Rellena Producto A (CE-005 Demo)', quantity: 200, period_start: '2026-10-01', period_end: '2026-10-31', channel: 'Salón', gross_revenue: 480000, net_revenue: 480000, source: 'TPV Salón', imported_at: '2026-11-01' },
      { id: 'sale_10_focac_deliv', product_id: 'prod_focaccia_a', product_name: 'Focaccia Rellena Producto A (CE-005 Demo)', quantity: 180, period_start: '2026-10-01', period_end: '2026-10-31', channel: 'Delivery Propio', gross_revenue: 432000, net_revenue: 432000, source: 'WhatsApp / Web', imported_at: '2026-11-01' },
      { id: 'sale_10_pollo_salon', product_id: 'prod_pollo_merma', product_name: 'Porción Pollo Grillado 180g con Merma 10% (CE-006 Demo)', quantity: 180, period_start: '2026-10-01', period_end: '2026-10-31', channel: 'Salón', gross_revenue: 360000, net_revenue: 360000, source: 'TPV Salón', imported_at: '2026-11-01' },
      { id: 'sale_10_trufa_salon', product_id: 'prod_trufa_incompleta', product_name: 'Pizza Trufa Negra (Alerta Incompleta CE-007 Demo)', quantity: 35, period_start: '2026-10-01', period_end: '2026-10-31', channel: 'Salón', gross_revenue: 210000, net_revenue: 210000, source: 'TPV Salón', imported_at: '2026-11-01' },

      // Período 2026-11 (Noviembre actual)
      { id: 'sale_11_margh_salon', product_id: 'prod_margherita', product_name: 'Pizza Margherita Clásica (Demo)', quantity: 500, period_start: '2026-11-01', period_end: '2026-11-30', channel: 'Salón', gross_revenue: 2100000, net_revenue: 2100000, source: 'TPV Salón', imported_at: '2026-11-04' },
      { id: 'sale_11_margh_deliv', product_id: 'prod_margherita', product_name: 'Pizza Margherita Clásica (Demo)', quantity: 320, period_start: '2026-11-01', period_end: '2026-11-30', channel: 'Delivery Propio', gross_revenue: 1344000, net_revenue: 1344000, source: 'WhatsApp / Web', imported_at: '2026-11-04' },
      { id: 'sale_11_margh_apps', product_id: 'prod_margherita', product_name: 'Pizza Margherita Clásica (Demo)', quantity: 130, period_start: '2026-11-01', period_end: '2026-11-30', channel: 'PedidosYa / Rappi', gross_revenue: 598000, net_revenue: 448500, source: 'PedidosYa', imported_at: '2026-11-04' },
      { id: 'sale_11_focac_salon', product_id: 'prod_focaccia_a', product_name: 'Focaccia Rellena Producto A (CE-005 Demo)', quantity: 230, period_start: '2026-11-01', period_end: '2026-11-30', channel: 'Salón', gross_revenue: 598000, net_revenue: 598000, source: 'TPV Salón', imported_at: '2026-11-04' },
      { id: 'sale_11_focac_deliv', product_id: 'prod_focaccia_a', product_name: 'Focaccia Rellena Producto A (CE-005 Demo)', quantity: 190, period_start: '2026-11-01', period_end: '2026-11-30', channel: 'Delivery Propio', gross_revenue: 494000, net_revenue: 494000, source: 'WhatsApp / Web', imported_at: '2026-11-04' },
      { id: 'sale_11_pollo_salon', product_id: 'prod_pollo_merma', product_name: 'Porción Pollo Grillado 180g con Merma 10% (CE-006 Demo)', quantity: 210, period_start: '2026-11-01', period_end: '2026-11-30', channel: 'Salón', gross_revenue: 462000, net_revenue: 462000, source: 'TPV Salón', imported_at: '2026-11-04' },
      { id: 'sale_11_pollo_deliv', product_id: 'prod_pollo_merma', product_name: 'Porción Pollo Grillado 180g con Merma 10% (CE-006 Demo)', quantity: 100, period_start: '2026-11-01', period_end: '2026-11-30', channel: 'Delivery Propio', gross_revenue: 220000, net_revenue: 220000, source: 'WhatsApp / Web', imported_at: '2026-11-04' },
      { id: 'sale_11_trufa_salon', product_id: 'prod_trufa_incompleta', product_name: 'Pizza Trufa Negra (Alerta Incompleta CE-007 Demo)', quantity: 45, period_start: '2026-11-01', period_end: '2026-11-30', channel: 'Salón', gross_revenue: 292500, net_revenue: 292500, source: 'TPV Salón', imported_at: '2026-11-04' },
    ],
    snapshots: [snapSep, snapOct, snapNov],
  };
}
