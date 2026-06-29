import type { SaleChannel } from '@pizzalog/shared';

export const CHANNEL_LABELS: Record<SaleChannel, string> = {
  counter: 'Mostrador',
  dine_in: 'Salón',
  web: 'Web',
  whatsapp: 'WhatsApp',
  pedidosya: 'PedidosYa',
  rappi: 'Rappi',
  phone: 'Teléfono',
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  mercadopago: 'Mercado Pago',
};

export function channelLabel(c: SaleChannel): string {
  return CHANNEL_LABELS[c] ?? c;
}

export function paymentLabel(m: string): string {
  return PAYMENT_LABELS[m] ?? m;
}
