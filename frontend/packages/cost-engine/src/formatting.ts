/**
 * Formatea un número decimal en notación fija estándar (con punto decimal ".")
 * eliminando artefactos de punto flotante (ej. 200.00000000000003).
 */
export function formatDecimal(value: number, decimals = 2): string {
  const epsilon = Math.sign(value) * 1e-12;
  return (value + epsilon).toFixed(decimals);
}

export type RegionalLocale = 'es-AR' | 'pt-BR' | 'en';

/**
 * Formatea un número según la convención regional sin alterar el valor subyacente:
 * - es-AR / pt-BR: miles con "." y decimales con "," (ej. 1.500,50)
 * - en: miles con "," y decimales con "." (ej. 1,500.50)
 */
export function formatLocaleNumber(
  value: number,
  locale: RegionalLocale = 'es-AR',
  decimals = 2
): string {
  if (!Number.isFinite(value)) return '—';
  const safeDecimals = Math.max(0, Math.min(8, Math.trunc(decimals)));
  const fixedAbs = formatDecimal(Math.abs(value), safeDecimals);
  const [intPart = '0', fracPart] = fixedAbs.split('.');
  const thousandsSep = locale === 'en' ? ',' : '.';
  const decimalSep = locale === 'en' ? '.' : ',';
  const groupedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep);
  const isNegative = value < 0 && Number(fixedAbs) > 0;
  const sign = isNegative ? '-' : '';
  return safeDecimals > 0 && fracPart !== undefined
    ? `${sign}${groupedInt}${decimalSep}${fracPart}`
    : `${sign}${groupedInt}`;
}

/**
 * Formatea un importe monetario separando explícitamente la moneda de presentación de las unidades físicas.
 */
export function formatMoney(
  value: number,
  currency: string,
  locale: RegionalLocale = 'es-AR',
  decimals = 2
): string {
  const code = (currency || 'ARS').trim().toUpperCase();
  if (!Number.isFinite(value)) return `${code} —`;
  return `${code} ${formatLocaleNumber(value, locale, decimals)}`;
}

/**
 * Interpreta números en múltiples formatos regionales (1.500,50 · 1,500.50 · $ 8.000 · -0,125).
 * No redondea ni descarta precisión decimal.
 */
export function parseLocaleNumber(
  raw: unknown,
  decimalPreference: 'auto' | 'comma' | 'dot' = 'auto'
): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  const text = String(raw ?? '').trim();
  if (!text) return null;

  let value = text.replace(/[^0-9,.-]/g, '');
  if (!value || !/[0-9]/.test(value)) return null;

  // Rechazar signos '-' intercalados en el medio del número
  if (value.slice(1).includes('-')) return null;

  const comma = value.lastIndexOf(',');
  const dot = value.lastIndexOf('.');

  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    const thousands = decimal === ',' ? /\./g : /,/g;
    value = value.replace(thousands, '').replace(decimal, '.');
  } else if (comma >= 0) {
    const commaCount = (value.match(/,/g) ?? []).length;
    const decimals = value.length - comma - 1;
    if (commaCount > 1) {
      value = value.replace(/,/g, '');
    } else if (/^-?0,\d+$/.test(value)) {
      value = value.replace(',', '.');
    } else if (decimalPreference === 'comma') {
      value = value.replace(',', '.');
    } else {
      value = decimals > 0 && decimals <= 2 ? value.replace(',', '.') : value.replace(/,/g, '');
    }
  } else if (dot >= 0) {
    const dotCount = (value.match(/\./g) ?? []).length;
    if (dotCount > 1) {
      value = value.replace(/\./g, '');
    } else if (decimalPreference !== 'dot' && /^-?[1-9]\d{0,2}(\.\d{3})+$/.test(value)) {
      value = value.replace(/\./g, '');
    }
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Devuelve la fecha calendario local actual en formato YYYY-MM-DD sin saltos por medianoche UTC.
 */
export function todayLocalDateString(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Devuelve un timestamp ISO-8601 con el offset horario local (ej. 2026-11-18T22:30:00.000-03:00),
 * preservando la fecha calendario del creador al abrir el historial desde otras zonas horarias.
 */
export function toLocalIsoTimestamp(now: Date = new Date()): string {
  const pad = (n: number, len = 2) => String(Math.abs(Math.trunc(n))).padStart(len, '0');
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hours = pad(now.getHours());
  const mins = pad(now.getMinutes());
  const secs = pad(now.getSeconds());
  const ms = pad(now.getMilliseconds(), 3);
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const absOff = Math.abs(offsetMin);
  const offH = pad(Math.floor(absOff / 60));
  const offM = pad(absOff % 60);
  return `${year}-${month}-${day}T${hours}:${mins}:${secs}.${ms}${sign}${offH}:${offM}`;
}

/**
 * Formatea una fecha calendario (YYYY-MM-DD o prefijo de timestamp ISO) de manera estrictamente
 * invariante a la zona horaria del navegador/OS (nunca retrocede un día por parseo UTC).
 */
export function formatCalendarDate(
  value: string | null | undefined,
  locale: RegionalLocale = 'es-AR'
): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  const isoPrefix = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoPrefix) {
    const [, year, month, day] = isoPrefix;
    return locale === 'en' ? `${month}/${day}/${year}` : `${day}/${month}/${year}`;
  }
  const slashLocal = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashLocal) {
    const day = slashLocal[1]!.padStart(2, '0');
    const month = slashLocal[2]!.padStart(2, '0');
    const year = slashLocal[3]!;
    return locale === 'en' ? `${month}/${day}/${year}` : `${day}/${month}/${year}`;
  }
  return raw;
}

/**
 * Formatea fecha y hora preservando la fecha calendario registrada del registro histórico
 * sin desplazamiento entre zonas horarias.
 */
export function formatHistoricalDateTime(
  value: string | null | undefined,
  locale: RegionalLocale = 'es-AR'
): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  const datePart = formatCalendarDate(raw, locale);
  const timeMatch = raw.match(/^\d{4}-\d{2}-\d{2}[T\s](\d{2}):(\d{2})/);
  if (!timeMatch) return datePart;
  return `${datePart} ${timeMatch[1]}:${timeMatch[2]}`;
}
