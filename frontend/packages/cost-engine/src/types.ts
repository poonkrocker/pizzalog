export type Dimension = 'mass' | 'volume' | 'count';

export type MassUnit = 'kg' | 'g' | 'mg' | 'lb' | 'oz';
export type VolumeUnit = 'L' | 'l' | 'ml' | 'cc' | 'fl_oz_us' | 'gal_us';
export type CountUnit = 'unit' | 'u' | 'dozen' | 'docena';
export type UnitCode = MassUnit | VolumeUnit | CountUnit;

export interface Ingredient {
  id: string;
  name: string;
  base_dimension: Dimension;
  base_unit: UnitCode;
  /** Requerida explícitamente para convertir masa ↔ volumen (ej. aceite: 0.92, agua: 1.0) */
  density_g_per_ml?: number | null;
  /** Requerida explícitamente para convertir unidad ↔ masa */
  unit_weight_g?: number | null;
  /** Si el ingrediente tiene costo cero explícito (ej. agua corriente de red) */
  is_free?: boolean;
  is_active: boolean;
}

export interface PurchasePrice {
  ingredient_id: string;
  purchase_date?: string;
  purchase_price: number | string | null;
  currency: string;
  pack_quantity: number;
  pack_unit: UnitCode;
  /** Porcentaje utilizable (0 < yield_pct <= 100). Por defecto 100. */
  yield_pct?: number;
  /** Cantidad utilizable explícita en pack_unit (alternativa a yield_pct) */
  usable_quantity?: number;
  supplier?: string;
}

export interface ExchangeRate {
  from_currency: string;
  to_currency: string;
  rate: number;
  effective_date: string;
  source?: string;
}

export interface RecipeComponent {
  component_type: 'ingredient' | 'subrecipe';
  ingredient_id?: string;
  recipe_id?: string;
  quantity: number;
  unit: UnitCode;
  sort_order?: number;
  /** Si el usuario decidió excluir deliberadamente el componente dejando trazabilidad */
  exclude_from_cost?: boolean;
}

export interface PrefermentSpec {
  /** % de la harina total que va al prefermento (biga/poolish) */
  flour_pct: number;
  /** % de agua sobre la harina del prefermento */
  water_pct: number;
  /** % de levadura sobre la harina del prefermento */
  yeast_pct: number;
  yeast_ingredient_id: string;
}

export interface FlourShareSpec {
  ingredient_id: string;
  /** Porcentaje directo sobre el total de harina (0 a 100) */
  share_pct?: number;
  /** Peso de referencia en la mezcla madre (ej. 0.5 kg sobre 8.22 kg en hoja Masas) */
  weight_kg?: number;
}

export interface BakersDoughSpec {
  /** Peso por unidad en gramos (si se calcula por unidades y peso de bollo) */
  unit_weight_g?: number;
  /** Cantidad de bollos/unidades (por defecto 1) */
  units_count?: number;
  /** Harina total fija en gramos (alternativa directa cuando el fixture define total_flour_g, ej. CE-002) */
  total_flour_g?: number;
  /** Hidratación total: % de agua sobre harina total */
  hydration_pct: number;
  /**
   * Regla de rendimiento de masa:
   * - 'flour_plus_water': Peso bollo = harina + agua (convención histórica hoja Masas Arrabbiata CE-001)
   * - 'total_formula': Peso bollo = harina + agua + sal + levadura + azúcar + aceite
   * - 'measured_yield': El rendimiento final del batch es un dato medido explícito (CE-002)
   */
  yield_basis: 'flour_plus_water' | 'total_formula' | 'measured_yield';
  /** Rendimiento final medido del batch en gramos (requerido cuando yield_basis === 'measured_yield') */
  measured_yield_g?: number;
  flours: FlourShareSpec[];
  biga?: PrefermentSpec;
  poolish?: PrefermentSpec;
  direct_yeast_pct?: number;
  yeast_ingredient_id?: string;
  salt_pct?: number;
  salt_ingredient_id?: string;
  sugar_pct?: number;
  sugar_ingredient_id?: string;
  oil_pct?: number;
  oil_ingredient_id?: string;
  water_ingredient_id?: string;
}

export interface Recipe {
  id: string;
  name: string;
  recipe_type: 'product' | 'subrecipe';
  yield_quantity: number;
  yield_unit: UnitCode;
  target_food_cost_pct?: number;
  currency: string;
  components?: RecipeComponent[];
  bakers_dough?: BakersDoughSpec;
}

export interface MissingInput {
  ingredient_id: string;
  ingredient_name: string;
  reason: 'missing_purchase_price' | 'missing_ingredient' | 'inactive_ingredient';
}

export interface ComponentCostBreakdown {
  component_type: 'ingredient' | 'subrecipe';
  id: string;
  name: string;
  quantity: number;
  unit: UnitCode;
  normalized_quantity: number;
  cost_unit: UnitCode;
  raw_unit_cost: number | null;
  raw_total_cost: number | null;
  total_cost: string | null;
  status: 'complete' | 'incomplete' | 'excluded';
}

export interface CostResult {
  recipe_id: string;
  recipe_name: string;
  status: 'complete' | 'incomplete';
  currency: string;
  batch_cost: string | null;
  raw_batch_cost: number | null;
  partial_batch_cost: string;
  raw_partial_batch_cost: number;
  yield_quantity: string;
  raw_yield_quantity: number;
  yield_unit: UnitCode;
  unit_cost: string | null;
  raw_unit_cost: number | null;
  cost_per_kg?: number | null;
  components: ComponentCostBreakdown[];
  missing_inputs: MissingInput[];
  warnings: string[];
  calculated_at: string;
  input_snapshot_hash: string;
  engine_version: string;
}

export interface PricingScenarioInput {
  unit_cost: number | null;
  status?: 'complete' | 'incomplete';
  currency?: string;
  target_food_cost_pct: number;
  rounding_increment: number;
  rounding_mode?: 'ceil' | 'nearest' | 'floor' | 'none';
  /** Si se provee un precio de venta específico para evaluar, si no usa el suggested_price */
  selling_price?: number;
  /** Costo variable de envase/descartables por unidad (separado del food cost de ingredientes) */
  packaging_cost?: number;
  /** Comisión porcentual del canal (ej. 25% app delivery), separada del food cost */
  channel_fee_pct?: number;
}

export interface PricingScenarioResult {
  status: 'complete' | 'incomplete';
  currency: string;
  target_food_cost_pct: number;
  rounding_increment: number;
  rounding_mode: 'ceil' | 'nearest' | 'floor' | 'none';
  minimum_price: string | null;
  raw_minimum_price: number | null;
  suggested_price: string | null;
  raw_suggested_price: number | null;
  evaluated_price: string | null;
  raw_evaluated_price: number | null;
  gross_profit: string | null;
  raw_gross_profit: number | null;
  food_cost_pct: number | null;
  gross_margin_pct: number | null;
  markup_pct: number | null;
  packaging_cost: string;
  channel_fee_pct: number;
  net_contribution_after_channel: string | null;
  raw_net_contribution_after_channel: number | null;
  warnings: string[];
}

export interface PortfolioScenarioItem {
  id: string;
  name: string;
  unit_cost: number | null;
  status: 'complete' | 'incomplete';
  selling_price: number | null;
}

export interface PortfolioScenarioInput {
  items: PortfolioScenarioItem[];
  cost_delta_pct: number;
  price_delta_pct: number;
  rounding_increment?: number;
  target_food_cost_pct?: number;
}

export interface PortfolioScenarioRow {
  id: string;
  name: string;
  status: 'complete' | 'incomplete';
  current_cost: number | null;
  simulated_cost: number | null;
  current_price: number | null;
  simulated_price: number | null;
  current_food_cost_pct: number | null;
  simulated_food_cost_pct: number | null;
  current_margin: number | null;
  simulated_margin: number | null;
}

export interface PortfolioScenarioResult {
  rows: PortfolioScenarioRow[];
  complete_items: number;
  incomplete_items: number;
  current_revenue: number;
  simulated_revenue: number;
  current_cost: number;
  simulated_cost: number;
  current_food_cost_pct: number | null;
  simulated_food_cost_pct: number | null;
  current_gross_profit: number;
  simulated_gross_profit: number;
  current_margin_pct: number | null;
  simulated_margin_pct: number | null;
}

export interface CostCatalog {
  ingredients: Ingredient[];
  purchase_prices: PurchasePrice[];
  recipes: Recipe[];
  exchange_rates?: ExchangeRate[];
  as_of_date?: string;
}

export interface CostSnapshot {
  snapshot_id: string;
  input_snapshot_hash: string;
  created_at: string;
  engine_version: string;
  recipe_id: string;
  cost_result: CostResult;
  pricing_scenario?: PricingScenarioResult;
  frozen_inputs: {
    recipe: Recipe;
    ingredients: Ingredient[];
    purchase_prices: PurchasePrice[];
  };
}

export type CostEngineErrorCode =
  | 'UNKNOWN_UNIT'
  | 'INCOMPATIBLE_UNITS'
  | 'INCOMPATIBLE_UNITS_MISSING_DENSITY'
  | 'INVALID_YIELD_PCT'
  | 'INVALID_PACK_QUANTITY'
  | 'INVALID_RECIPE_YIELD'
  | 'SUBRECIPE_CYCLE_DETECTED'
  | 'SUBRECIPE_NOT_FOUND'
  | 'CURRENCY_MISMATCH'
  | 'INVALID_PRICING_PARAMETERS'
  | 'INVALID_DOUGH_SPEC';

export class CostEngineValidationError extends Error {
  public readonly code: CostEngineErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: CostEngineErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'CostEngineValidationError';
    this.code = code;
    this.details = details;
  }
}
