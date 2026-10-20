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
  discount?: number;
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
  if (input.discount && input.discount > 0) {
    const rawSubtotal = input.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    t.row('Subtotal', money(rawSubtotal));
    t.row('Descuento', '-' + money(input.discount));
  }
  t.bold(true).size('tall').row('TOTAL', money(input.total)).size(1).bold(false);
  t.line(`Pago: ${paymentName(input.paymentMethod)}`);
  t.feed(1);
  t.align('center').line('¡Gracias por tu compra!');
  t.cut();
  return t.toString();
}

/** Ticket de Cierre de Turno / Arqueo de Caja (Informe Z). */
export function cashCloseTicket(input: {
  businessName: string;
  session: any;
  width: number;
}): string {
  const s = input.session;
  const t = new Esc(input.width);
  t.init();

  t.align('center').bold(true).size(2).line(input.businessName).size(1).bold(false);
  t.bold(true).line('CIERRE DE TURNO / CAJA').bold(false);
  t.line(`Turno #${s.id}`);
  if (s.opened_by_name) {
    t.line(`Cajero: ${s.opened_by_name}`);
  }
  const opened = s.opened_at ? new Date(String(s.opened_at).replace(' ', 'T')).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '-';
  const closed = s.closed_at ? new Date(String(s.closed_at).replace(' ', 'T')).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  t.line(`Apertura: ${opened}`);
  t.line(`Cierre:   ${closed}`);
  t.align('left').hr('=');

  // ARQUEO DE EFECTIVO
  t.bold(true).line('ARQUEO DE EFECTIVO').bold(false);
  t.row('Fondo inicial', money(Number(s.opening_amount) || 0));
  t.row('(+) Ventas efectivo', money(Number(s.cash_sales) || 0));
  t.row('(+) Ingresos caja', money(Number(s.movements_in) || 0));
  t.row('(-) Egresos/retiros', money(Number(s.movements_out) || 0));
  t.hr('-');
  t.row('(=) Efectivo esperado', money(Number(s.expected_amount) || 0));
  if (s.closing_amount !== null && s.closing_amount !== undefined) {
    t.row('Real en caja (contado)', money(Number(s.closing_amount) || 0));
    const diff = Number(s.difference) || ((Number(s.closing_amount) || 0) - (Number(s.expected_amount) || 0));
    const diffLabel = diff === 0 ? 'DIFERENCIA (Exacto)' : diff > 0 ? 'DIFERENCIA (Sobrante)' : 'DIFERENCIA (Faltante)';
    t.bold(true).row(diffLabel, (diff > 0 ? '+' : '') + money(diff)).bold(false);
  }

  // VENTAS POR FORMA DE PAGO
  t.hr('=');
  t.bold(true).line('VENTAS POR MEDIO DE PAGO').bold(false);
  const byMethod: Array<{ payment_method: string; total: number; count: number }> = Array.isArray(s.sales_by_method)
    ? s.sales_by_method
    : [];
  let totalSales = 0;
  for (const m of byMethod) {
    totalSales += Number(m.total) || 0;
    const name = paymentName(m.payment_method);
    t.row(`${name} (${m.count})`, money(Number(m.total) || 0));
  }
  t.hr('-');
  t.bold(true).size('tall').row('TOTAL VENTAS', money(totalSales)).size(1).bold(false);

  // MOVIMIENTOS DETALLADOS
  const movs: Array<{ type: string; amount: number; reason?: string }> = s.movements ?? [];
  if (movs.length > 0) {
    t.hr('=');
    t.bold(true).line('DETALLE DE MOVIMIENTOS').bold(false);
    for (const m of movs) {
      const typeLabel = m.type === 'in' ? '[+] INGRESO' : '[-] EGRESO';
      t.row(typeLabel, money(Number(m.amount) || 0));
      if (m.reason) t.wrapped(`  Motivo: ${m.reason}`, 2);
    }
  }

  if (s.note) {
    t.hr('-');
    t.line(`Nota: ${s.note}`);
  }

  t.feed(2);
  t.align('center').line('--------------------------------');
  t.line('Firma Cajero / Responsable');
  t.feed(1);
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
    mp: 'Mercado Pago',
    mercadopago: 'Mercado Pago',
    other: 'Otro',
    otro: 'Otro',
  };
  return names[m] ?? m;
}
