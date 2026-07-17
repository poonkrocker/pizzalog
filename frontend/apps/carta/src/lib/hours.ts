import type { BusinessHour } from '../types';

/**
 * Consolida las franjas horarias en texto legible, estilo Arrabbiata:
 *   "Lun a Vie 20:00–23:59 · Sáb, Dom 12:00–15:00 y 20:00–00:30"
 *
 * Agrupa días que comparten exactamente el mismo set de franjas, y comprime
 * días consecutivos en rangos ("Lun a Vie"). Los días sin franjas no aparecen.
 * day_of_week: 0 = domingo … 6 = sábado.
 */

const LABEL = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
// Orden de lectura de la semana (lunes primero), en índices de day_of_week.
const WEEK = [1, 2, 3, 4, 5, 6, 0];

function slotsKey(slots: BusinessHour[]): string {
  return slots
    .map((s) => `${s.opens_at}-${s.closes_at}`)
    .sort()
    .join(' y ');
}

function slotsText(slots: BusinessHour[]): string {
  return slots
    .slice()
    .sort((a, b) => a.opens_at.localeCompare(b.opens_at))
    .map((s) => `${s.opens_at}–${s.closes_at}`)
    .join(' y ');
}

/** @returns líneas ya formateadas, una por grupo de días. [] si no hay horarios. */
export function formatHours(hours: BusinessHour[]): string[] {
  if (!hours || hours.length === 0) return [];

  // Franjas por día.
  const byDay = new Map<number, BusinessHour[]>();
  for (const h of hours) {
    const arr = byDay.get(h.day_of_week) ?? [];
    arr.push(h);
    byDay.set(h.day_of_week, arr);
  }

  // Recorro la semana en orden y agrupo días consecutivos con idéntico set.
  const groups: Array<{ days: number[]; text: string }> = [];
  for (const day of WEEK) {
    const slots = byDay.get(day);
    if (!slots || slots.length === 0) continue;

    const key = slotsKey(slots);
    const last = groups[groups.length - 1];
    if (last && last.text === key) {
      last.days.push(day);
    } else {
      groups.push({ days: [day], text: key });
    }
  }

  return groups.map((g) => {
    const slots = byDay.get(g.days[0]!)!;
    const daysLabel =
      g.days.length >= 3
        ? `${LABEL[g.days[0]!]} a ${LABEL[g.days[g.days.length - 1]!]}`
        : g.days.map((d) => LABEL[d]).join(', ');
    return `${daysLabel} ${slotsText(slots)}`;
  });
}
