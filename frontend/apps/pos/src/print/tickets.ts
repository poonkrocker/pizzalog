import { Esc } from './escpos';

export interface TicketLine {
  qty: number;
  label: string;
  unitPrice: number;
  note?: string;
}

const money = (n: number) =>
  '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const CHANNEL_NAMES: Record<string, string> = {
  takeaway: 'PARA LLEVAR',
  delivery: 'DELIVERY',
  counter: 'MOSTRADOR',
};

/** Ticket de venta (Llevar / Delivery): se entrega al cliente. */
export function saleTicket(input: {
  businessName: string;
  lines: TicketLine[];
  total: number;
  paymentMethod: string;
  channel: string;
  width: number;
}): string {
  const t = new Esc(input.width);
  t.init();

  t.align('center').bold(true).size(2).line(input.businessName).size(1).bold(false);
  const ch = CHANNEL_NAMES[input.channel];
  if (ch) t.line(ch);
  t.line(new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }));
  t.align('left').hr();

  for (const l of input.lines) {
    t.row(`${l.qty} x ${l.label}`, money(l.unitPrice * l.qty));
    if (l.note) t.wrapped(`  ${l.note}`, 2);
  }

  t.hr();
  t.bold(true).size('tall').row('TOTAL', money(input.total)).size(1).bold(false);
  t.line(`Pago: ${paymentName(input.paymentMethod)}`);
  t.feed(1);
  t.align('center').line('¡Gracias por tu compra!');
  t.cut();
  return t.toString();
}

/** Comanda de cocina: qué preparar y para qué cuenta. */
export function comandaTicket(input: {
  place: string; // "Barra 1", "Mostrador"...
  account?: string; // nombre de la cuenta ("Juan")
  lines: Array<{ qty: number; label: string; note?: string }>;
  width: number;
}): string {
  const t = new Esc(input.width);
  t.init();

  t.align('center').bold(true).size(2).line('COMANDA').size(1).bold(false);
  t.line(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
  t.align('left').hr('=');

  t.bold(true).size(2).line(input.place).size(1).bold(false);
  if (input.account) t.line(`Cuenta: ${input.account}`);
  t.hr();

  for (const l of input.lines) {
    t.bold(true).size('tall').line(`${l.qty} x ${l.label}`).size(1).bold(false);
    if (l.note) t.wrapped(`>> ${l.note}`, 3);
    t.feed(1);
  }

  t.cut();
  return t.toString();
}

function paymentName(m: string): string {
  const names: Record<string, string> = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    transferencia: 'Transferencia',
    cash: 'Efectivo',
    card: 'Tarjeta',
    transfer: 'Transferencia',
    mercadopago: 'Mercado Pago',
    otro: 'Otro',
  };
  return names[m] ?? m;
}
