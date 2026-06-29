const ars = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

export function formatARS(amount: number): string {
  return ars.format(amount);
}

const dateTime = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });

export function formatDateTime(iso: string): string {
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T');
  return dateTime.format(new Date(normalized));
}

// Genera un client_uuid para la idempotencia de ventas (clave del offline).
export function uuid(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) {
    return c.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
