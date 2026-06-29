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

export interface Product {
  id: number;
  category_id: number | null;
  name: string;
  description: string | null;
  price: number;
  cost: number | null;
  track_stock: number;
  stock?: number;
  is_active: number;
}

// --- Ventas ---------------------------------------------------------------

export type SaleChannel =
  | 'counter'
  | 'web'
  | 'whatsapp'
  | 'pedidosya'
  | 'rappi'
  | 'phone'
  | 'dine_in';

export interface SaleItemInput {
  product_id: number | null;
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

export type TableShape = 'round' | 'square' | 'rect';

export interface Table {
  id: number;
  area_id: number;
  label: string;
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
  capacity: number;
  shape: TableShape;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  rotation: number;
  status: 'free' | 'occupied';
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
  opened_at?: string;
  note: string | null;
  // Detalle (cuenta en vivo)
  tables?: SessionTable[];
  rounds?: Round[];
  totals?: { items_count: number; subtotal: number };
  // Resumen (listado de cuentas abiertas)
  subtotal?: number;
  tables_label?: string;
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
