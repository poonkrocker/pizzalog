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
  // Visibilidad (migración 011)
  show_online: number;
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
