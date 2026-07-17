// Espeja el shape de PublicController::menu() / secretMenu(). La carta es
// pública y sin token, así que no reusa @pizzalog/shared (pensado para el
// panel autenticado) — mantiene su propio contrato, deliberadamente chico.

export interface Variant {
  id: number;
  label: string;
  price: number;
  is_active: number;
}

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
  items: ComboItem[];
}

export interface Combo {
  groups: ComboGroup[];
}

export interface Product {
  id: number;
  category_id: number | null;
  sort_order: number;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  has_variants: number;
  is_combo: number;
  is_open_price: number;
  is_vegan_opt: number;
  badge_text: string | null;
  is_available_now: boolean;
  variants?: Variant[];
  combo?: Combo;
}

export interface Category {
  id: number;
  name: string;
  sort_order: number;
}

export interface BusinessTheme {
  bg?: string;
  accent?: string;
  link?: string;
  text?: string;
  pattern?: string;
}

export interface SocialLink {
  platform: string;
  url: string;
}

export interface BusinessProfile {
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
  google_maps_url: string | null;
  description: string | null;
  logo_url: string | null;
  theme: BusinessTheme | null;
  social_links: SocialLink[];
  is_open_for_orders: boolean;
  transfer_alias: string | null;
  card_surcharge_pct: number;
}

export interface Menu {
  business: BusinessProfile;
  categories: Category[];
  products: Product[];
}

export const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'mp'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  mp: 'Mercado Pago',
};

// --- Selecciones de combo en el carrito ------------------------------------

export interface ComboSelection {
  group_id: number;
  product_ids: number[];
}

// --- Payload de creación de pedido -----------------------------------------

export interface OrderItemInput {
  product_id: number;
  quantity: number;
  variant_id?: number;
  notes?: string;
  combo_selections?: ComboSelection[];
}

export interface CreateOrderInput {
  customer_name: string;
  customer_phone: string;
  address?: string | null;
  payment_method?: PaymentMethod | null;
  notes?: string | null;
  items: OrderItemInput[];
}

export interface OrderLine {
  product_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface OrderResult {
  id: number;
  order_number: number;
  status: string;
  customer_name: string;
  address: string | null;
  total: number;
  items: OrderLine[];
}

export interface CreateOrderResponse {
  order: OrderResult;
  whatsapp_url: string | null;
}
