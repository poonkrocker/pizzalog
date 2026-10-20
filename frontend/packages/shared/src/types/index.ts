// Entidades del dominio, espejando los contratos del backend Pizzalog.

export type Role = 'admin' | 'manager' | 'cashier' | 'kitchen';

export interface User {
  id: number;
  business_id: number;
  name: string;
  email: string;
  role: Role;
  hourly_rate?: number;
  is_active: number;
}

export interface Category {
  id: number;
  name: string;
  sort_order: number;
  product_count?: number;
  products_count?: number;
}

/** Claves de visible_days (lunes a domingo, en inglés como las guarda el back). */
export type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface Product {
  id: number;
  category_id: number | null;
  sort_order: number;
  name: string;
  description: string | null;
  price: number;
  cost: number | null;
  image_url: string | null;
  track_stock: number;
  stock?: number;
  is_active: number;
  has_variants: number;
  is_combo: number;
  is_open_price: number;
  is_combinable?: number;
  // Visibilidad (migración 011 y 024)
  show_online: number;
  show_in_salon?: number;
  is_available: number;
  is_secret: number;
  is_vegan_opt: number;
  badge_text: string | null;
  visible_days: WeekDay[] | null;   // null = todos los días
  visible_from: string | null;      // 'HH:MM' — null = sin restricción
  visible_until: string | null;     // 'HH:MM' — si es < visible_from, cruza medianoche
  options?: ProductOption[];
  variants?: ProductVariant[];
  combo?: Combo;
}

// --- Combos ---------------------------------------------------------------

export interface ComboItem {
  product_id: number;
  name: string;
  price: number;
  image_url: string | null;
}

export interface ComboGroup {
  id: number;
  name: string;
  select_count: number;
  sort_order: number;
  items: ComboItem[];
}

export interface Combo {
  groups: ComboGroup[];
}

/** Lo que el cliente eligió en cada grupo, al agregar el combo al carrito. */
export interface ComboSelection {
  group_id: number;
  product_ids: number[];
}

export interface ProductOptionValue {
  id: number;
  value: string;
  sort_order: number;
}

export interface ProductOption {
  id: number;
  name: string;
  sort_order: number;
  values: ProductOptionValue[];
}

export interface ProductVariant {
  id: number;
  label: string;
  price: number;
  sku: string | null;
  sort_order: number;
  is_active: number;
  option_value_ids: number[];
}

// --- Ventas ---------------------------------------------------------------

export type SaleChannel =
  | 'counter'
  | 'takeaway'
  | 'delivery'
  | 'web'
  | 'whatsapp'
  | 'pedidosya'
  | 'rappi'
  | 'phone'
  | 'dine_in';

export interface SaleItemInput {
  product_id: number | null;
  variant_id?: number;
  product_name: string;
  unit_price: number;
  quantity: number;
}

export interface SaleInput {
  client_uuid: string; // idempotencia: clave para el reenvío offline
  items: SaleItemInput[];
  payment_method: string;
  discount?: number;
  channel?: SaleChannel;
  cash_session_id?: number | null;
  note?: string;
}

export interface Sale {
  id: number;
  sale_number: number;
  user_id?: number | null;
  user_name?: string | null;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: string;
  channel: SaleChannel;
  status: string;
  created_at: string;
}

export interface SaleItem {
  id: number;
  product_id: number | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface SaleDetail extends Sale {
  note: string | null;
  items: SaleItem[];
}

// --- Salón ----------------------------------------------------------------

export interface TableArea {
  id: number;
  name: string;
  sort_order: number;
}

export interface BusinessTheme {
  bg?: string;
  accent?: string;
  link?: string;
  text?: string;
  pattern?: 'mosaico' | 'liso' | 'rayas' | 'lunares';
}

export interface Business {
  id: number;
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
  /** Link "Compartir" del perfil de Google Maps. Reemplaza a latitude/longitude. */
  google_maps_url: string | null;
  description: string | null;
  logo_url: string | null;
  accepts_online_orders: number;
  transfer_alias: string | null;
  card_surcharge_pct: number;
  pay_methods_pickup: string[];
  pay_methods_delivery: string[];
  theme: BusinessTheme | null;
}

// --- Horarios de atención (gatean el pedido online, no la carta) -----------

/** day_of_week: 0 = domingo … 6 = sábado. */
export interface BusinessHour {
  id?: number;
  day_of_week: number;
  opens_at: string;   // 'HH:MM'
  closes_at: string;  // 'HH:MM' — si es <= opens_at, cruza medianoche
}

// --- Redes sociales --------------------------------------------------------

/** platform es texto libre: el ícono se resuelve en el front, con fallback. */
export interface SocialLink {
  id?: number;
  platform: string;
  url: string;
  sort_order?: number;
}

export type TableShape = 'round' | 'square' | 'rect';
export type TableKind = 'table' | 'bar';

export interface Table {
  id: number;
  area_id: number;
  label: string;
  kind: TableKind;
  capacity: number;
  shape: TableShape;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  rotation: number;
  is_active: number;
}

export interface FloorTable {
  id: number;
  label: string;
  kind: TableKind;
  capacity: number;
  shape: TableShape;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  rotation: number;
  status: 'free' | 'occupied' | 'bar';
  open_count: number;
  session_id: number | null;
}

export interface FloorArea {
  id: number;
  name: string;
  tables: FloorTable[];
}

export type RoundStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';

export interface RoundItem {
  id: number;
  product_id: number | null;
  name: string;
  qty: number;
  unit_price: number;
  note: string | null;
  status: 'ordered' | 'cancelled';
  line_total?: number;
}

export interface Round {
  id: number;
  session_id?: number;
  number: number;
  status: RoundStatus;
  note: string | null;
  printed_at: string | null;
  items: RoundItem[];
}

export interface SessionTable {
  id: number;
  label: string;
  area_name?: string;
}

export type SessionStatus = 'open' | 'bill_requested' | 'closed' | 'cancelled';

export interface TableSession {
  id: number;
  status: SessionStatus;
  party_size: number | null;
  label?: string | null;
  opened_at?: string;
  note: string | null;
  // Detalle (cuenta en vivo)
  tables?: SessionTable[];
  rounds?: Round[];
  totals?: { items_count: number; subtotal: number };
  // Resumen (listado de cuentas abiertas)
  subtotal?: number;
  tables_label?: string;
  table_ids?: number[];
}

// --- Cocina ---------------------------------------------------------------

export interface KitchenRoundItem {
  id: number;
  product_id: number | null;
  name: string;
  qty: number;
  note: string | null;
}

export interface KitchenRound {
  id: number;
  session_id: number;
  number: number;
  status: RoundStatus;
  tables_label: string | null;
  note: string | null;
  printed: boolean;
  printed_at: string | null;
  created_at: string;
  items: KitchenRoundItem[];
}

// --- Abastecimiento y contactos -------------------------------------------

export interface Supplier {
  id: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  cuit: string | null;
  notes: string | null;
  is_active: number;
}

export interface Supply {
  id: number;
  name: string;
  category: string | null;
  unit: string;
  stock: number;
  min_stock: number | null;
  cost: number | null;
  supplier_id: number | null;
  supplier_name: string | null;
  is_active: number;
}

export type SupplyMovementType = 'restock' | 'consumption' | 'adjustment' | 'count';

export interface SupplyMovement {
  id: number;
  type: SupplyMovementType;
  quantity: number;
  reason: string | null;
  user_id: number | null;
  user_name: string | null;
  created_at: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

// --- Pedidos (Delivery / Takeaway) ----------------------------------------

export type OrderStatus =
  | 'received'
  | 'confirmed'
  | 'preparing'
  | 'on_the_way'
  | 'delivered'
  | 'cancelled';

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  notes: string | null;
}

export interface Order {
  id: number;
  order_number: number;
  channel: SaleChannel;
  status: OrderStatus;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  delivery_fee: number;
  items_total: number;
  total: number;
  payment_method: string | null;
  notes: string | null;
  sale_id: number | null;
  delivery_driver_id?: number | null;
  delivery_driver_name?: string | null;
  delivery_driver_phone?: string | null;
  created_at: string;
  items?: OrderItem[];
}

// --- Cadetes / Repartidores & Liquidación ----------------------------------

export type VehicleType = 'moto' | 'bici' | 'auto' | 'otro';

export interface DeliveryDriver {
  id: number;
  name: string;
  phone: string | null;
  vehicle_type: VehicleType;
  vehicle_plate: string | null;
  fee_per_trip: number;
  is_active: number;
  created_at?: string;
}

export interface DriverSettlementOrder {
  id: number;
  order_number: number;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  total: number;
  delivery_fee: number;
  payment_method: string | null;
  status: OrderStatus;
  created_at: string;
}

export interface DriverSettlement {
  driver_id: number;
  driver_name: string;
  driver_phone: string | null;
  fee_per_trip: number;
  total_orders: number;
  cash_orders_count: number;
  cash_collected: number;
  other_payments_count: number;
  other_payments_total: number;
  total_earned_fees: number;
  net_cash_balance: number;
  orders: DriverSettlementOrder[];
}

// --- Caja y Arqueo --------------------------------------------------------

export type CashSessionStatus = 'open' | 'closed';
export type CashMovementType = 'in' | 'out';

export interface CashMovement {
  id: number;
  cash_session_id: number;
  type: CashMovementType;
  amount: number;
  reason: string | null;
  created_by?: number;
  created_at: string;
}

export interface CashSession {
  id: number;
  opened_by: number;
  opened_by_name?: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_amount: number;
  closing_amount: number | null;
  expected_amount: number | null;
  difference: number | null;
  status: CashSessionStatus;
  note: string | null;
  cash_sales?: number;
  movements_in?: number;
  movements_out?: number;
  sales_by_method?: Array<{ payment_method: string; total: number; count: number }> | Record<string, number>;
  movements?: CashMovement[];
}

// --- Analytics ------------------------------------------------------------

export interface AnalyticsSummary {
  from: string;
  to: string;
  sales_count: number;
  revenue: number;
  discounts: number;
  avg_ticket: number;
  units_sold: number;
  by_channel: Array<{ channel: string; sales_count: number; revenue: number }>;
  delivery: { sales_count: number; revenue: number };
  local: { sales_count: number; revenue: number };
}

export interface AnalyticsTopProduct {
  product_id: number | null;
  name: string;
  units: number;
  revenue: number;
}

export interface AnalyticsSalesPoint {
  day: string;
  sales_count: number;
  revenue: number;
}

export interface AnalyticsIngredient {
  id: number;
  name: string;
  category: string;
  units: number;
  sales_count: number;
}

export interface ProductCombination {
  p1_id: number;
  p2_id: number;
  p1_name: string;
  p2_name: string;
  pair_orders: number;
  total_revenue: number;
}

export interface IngredientCombination {
  i1_id: number;
  i2_id: number;
  i1_name: string;
  i2_name: string;
  i1_category: string;
  i2_category: string;
  orders_count: number;
  occurrences: number;
}

export interface AnalyticsWinningCombinations {
  product_combinations: ProductCombination[];
  ingredient_combinations: IngredientCombination[];
}

// --- Producción / Calculadora de Masas & Costos ---------------------------

export interface DoughProfile {
  id: number;
  business_id: number;
  name: string;
  unit_weight_grams: number;
  hydration_pct: number;
  biga_pct: number;
  biga_water_pct: number;
  biga_yeast_pct: number;
  poolish_pct: number;
  poolish_water_pct: number;
  poolish_yeast_pct: number;
  direct_yeast_pct: number;
  salt_pct: number;
  sugar_pct: number;
  oil_pct: number;
  flour_white_pct: number;
  flour_integral_pct: number;
  flour_semola_pct: number;
  cost_per_kg: number;
  notes: string | null;
}

export interface DoughCalculation {
  type: 'pizza' | 'faina';
  total_weight_kg: number;
  total_flour_kg?: number;
  total_water_kg?: number;
  weight_per_unit_g: number;
  units: number;
  batches: number;
  flour_blend?: {
    white_kg: number;
    semola_kg: number;
    integral_kg: number;
  };
  biga?: {
    active: boolean;
    pct: number;
    flour_kg: number;
    water_kg: number;
    yeast_g: number;
    total_kg: number;
  };
  poolish?: {
    active: boolean;
    pct: number;
    flour_kg: number;
    water_kg: number;
    yeast_g: number;
    total_kg: number;
  };
  empaste?: {
    flour_kg: number;
    water_kg: number;
    salt_g: number;
    direct_yeast_g: number;
    sugar_g: number;
    oil_cc: number;
  };
  total?: {
    chickpea_flour_kg: number;
    water_liters: number;
    salt_grams: number;
    oil_liters: number;
  };
  per_batch: {
    batches?: number;
    flour_kg?: number;
    water_kg?: number;
    biga_kg?: number;
    salt_g?: number;
    chickpea_flour_kg?: number;
    water_liters?: number;
    salt_grams?: number;
    oil_liters?: number;
  };
  cost: {
    total: number;
    per_kg: number;
    per_unit: number;
  };
  whatsapp_text: string;
}

export interface RecipeIngredient {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
}

export interface CostMarginProduct {
  id: number;
  name: string;
  category: string;
  price: number;
  cost: number;
  margin: number;
  margin_pct: number;
  food_cost_pct: number;
  markup_pct: number;
  suggested_price: number;
  status: 'ok' | 'review' | 'no_price';
  ingredients: RecipeIngredient[];
}

export interface CostMarginsSummary {
  total_products: number;
  avg_food_cost_pct: number;
  avg_margin_pct: number;
  review_count: number;
  no_price_count: number;
}

export interface SupplyItem {
  id: number;
  name: string;
  category: string;
  unit: string;
  cost: number;
}

export interface DoughProfileInput {
  name: string;
  unit_weight_grams: number;
  hydration_pct: number;
  biga_pct: number;
  biga_water_pct: number;
  biga_yeast_pct: number;
  poolish_pct: number;
  poolish_water_pct: number;
  poolish_yeast_pct: number;
  direct_yeast_pct: number;
  salt_pct: number;
  sugar_pct: number;
  oil_pct: number;
  flour_white_pct: number;
  flour_integral_pct: number;
  flour_semola_pct: number;
  cost_per_kg?: number;
  notes?: string | null;
}

export interface RecipeIngredientInput {
  ingredient_id?: number;
  name: string;
  category?: string;
  quantity: number;
  unit: string;
  unit_cost?: number;
}

export interface SaveRecipeInput {
  product_id?: number;
  name: string;
  category_name?: string;
  price: number;
  ingredients: RecipeIngredientInput[];
}

export interface CostMarginsResponse {
  summary: CostMarginsSummary;
  products: CostMarginProduct[];
  supplies?: SupplyItem[];
}

export interface SimulationProduct {
  id: number;
  name: string;
  category: string;
  current_price: number;
  current_cost: number;
  simulated_price: number;
  simulated_cost: number;
  simulated_margin: number;
  simulated_food_cost: number;
}

export interface SimulationResponse {
  simulation: {
    cost_delta_pct: number;
    price_delta_pct: number;
    orig_avg_food_cost: number;
    sim_avg_food_cost: number;
    delta_food_cost: number;
  };
  products: SimulationProduct[];
}

