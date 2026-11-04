import type { CostCatalog, CostSnapshot } from '@pizzalog/cost-engine';

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

export function createInitialDemoWorkspace(): ToolsWorkspaceState {
  return {
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
      prod_margherita: { monthlyUnitsSold: 950, sellingPrice: null },
      prod_focaccia_a: { monthlyUnitsSold: 420, sellingPrice: null },
      prod_pollo_merma: { monthlyUnitsSold: 310, sellingPrice: null },
      prod_trufa_incompleta: { monthlyUnitsSold: 45, sellingPrice: null },
    },
    operatingExpenses: [
      { id: 'exp_1', name: 'Alquiler del Local (Demo)', category: 'rent', period: 'monthly', amount: 850000 },
      { id: 'exp_2', name: 'Equipo de Cocina y Salón (Demo)', category: 'payroll', period: 'monthly', amount: 1800000 },
      { id: 'exp_3', name: 'Energía Eléctrica, Gas y Agua (Demo)', category: 'utilities', period: 'monthly', amount: 320000 },
      { id: 'exp_4', name: 'Internet, Software y Contabilidad (Demo)', category: 'software', period: 'monthly', amount: 130000 },
    ],
    snapshots: [],
  };
}
