import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { BluetoothSerial } from '@e-is/capacitor-bluetooth-serial';
import { comandaTicket } from './tickets';

export interface ConfiguredPrinter {
  id: string;
  name: string;
  address: string;
  alias: string; // e.g. "Cocina", "Barra / Bebidas", "Horno", "Caja"
  width: 32 | 48;
  categoryIds?: number[];
  isDefault?: boolean;
}

export interface PrinterSettings {
  address: string | null;
  name: string | null;
  width: 32 | 48; // 32 = papel 58mm · 48 = papel 80mm
  autoTicket: boolean; // imprimir ticket al cobrar
  autoComanda: boolean; // imprimir comanda al enviar a cuenta
  useDigitalKds: boolean; // mostrar/usar comandera digital en cocina (false = comandas en papel y pincho)
  printers?: ConfiguredPrinter[];
  comandaSplitMode?: 'unified' | 'by_category' | 'by_printer';
  fiscalData?: {
    enabled?: boolean;
    cuit?: string;
    iibb?: string;
    ivaCondition?: string;
    fantasyName?: string;
    address?: string;
  };
}

const KEY = 'printer_settings';

const DEFAULTS: PrinterSettings = {
  address: null,
  name: null,
  width: 32,
  autoTicket: false,
  autoComanda: false,
  useDigitalKds: true,
  printers: [],
  comandaSplitMode: 'by_category',
};

export const isNative = () => Capacitor.isNativePlatform();

export async function getPrinterSettings(): Promise<PrinterSettings> {
  const { value } = await Preferences.get({ key: KEY });
  if (!value) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...(JSON.parse(value) as Partial<PrinterSettings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function savePrinterSettings(s: PrinterSettings): Promise<void> {
  await Preferences.set({ key: KEY, value: JSON.stringify(s) });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pizzalog:settings-changed', { detail: s }));
  }
}

export interface BtDevice {
  name: string;
  address: string;
}

/** Lista los dispositivos Bluetooth (emparejados y visibles). */
export async function listDevices(): Promise<BtDevice[]> {
  if (!isNative()) {
    throw new Error('La búsqueda de impresoras funciona solo en la app Android.');
  }
  await BluetoothSerial.enable();
  const result = await BluetoothSerial.scan();
  return (result.devices ?? [])
    .filter((d) => d.address)
    .map((d) => ({ name: d.name || d.address, address: d.address }));
}

/** Envía un payload ESC/POS a la impresora configurada o a la dirección indicada. */
export async function printRaw(payload: string, targetAddress?: string): Promise<void> {
  if (!isNative()) {
    // Modo emulación en navegador para pruebas
    console.log('[ESC/POS simulated print]:\n' + payload);
    return;
  }
  const s = await getPrinterSettings();
  const address = targetAddress || s.address;
  if (!address) {
    throw new Error('No hay impresora configurada. Elegila en Ajustes.');
  }
  await BluetoothSerial.enable();
  await BluetoothSerial.connect({ address });
  try {
    await BluetoothSerial.write({ address, value: payload });
    // Esperar a que el búfer de la comandera térmica procese y termine de imprimir
    // antes de cerrar la conexión RFCOMM (evita que la impresora descarte los bytes).
    await new Promise((resolve) => setTimeout(resolve, 2200));
  } finally {
    try {
      await BluetoothSerial.disconnect({ address });
    } catch {
      /* sin acción */
    }
  }
}

export async function tryPrint(payload: string, targetAddress?: string): Promise<string | null> {
  try {
    await printRaw(payload, targetAddress);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'No se pudo imprimir';
  }
}

export interface ComandaItem {
  qty: number;
  label: string;
  note?: string;
  categoryId?: number | null;
  categoryName?: string;
}

export interface DispatchComandasInput {
  place: string;
  account?: string;
  roundNumber?: number;
  lines: ComandaItem[];
  isReprint?: boolean;
}

/** Despacha e imprime comandas, separando por categorías o múltiples impresoras según configuración */
export async function dispatchComandas(input: DispatchComandasInput): Promise<{
  success: boolean;
  ticketsPrinted: number;
  error?: string;
}> {
  const s = await getPrinterSettings();
  if (input.lines.length === 0) return { success: true, ticketsPrinted: 0 };

  const configuredPrinters = s.printers && s.printers.length > 0 ? s.printers : null;
  const splitMode =
    s.comandaSplitMode ??
    (configuredPrinters && configuredPrinters.length > 1 ? 'by_printer' : 'by_category');

  // Si no hay ninguna impresora conectada ni configurada
  if (!s.address && (!configuredPrinters || configuredPrinters.length === 0)) {
    if (!isNative()) {
      return { success: true, ticketsPrinted: 1 };
    }
    return { success: false, ticketsPrinted: 0, error: 'No hay comanderas configuradas en Ajustes' };
  }

  // Agrupador de ítems
  type Group = {
    title: string;
    targetAddress?: string;
    width: number;
    lines: Array<{ qty: number; label: string; note?: string }>;
  };

  const groups: Group[] = [];

  if (configuredPrinters && configuredPrinters.length > 1 && splitMode === 'by_printer') {
    // Modo múltiples comanderas por impresora asignada
    for (const p of configuredPrinters) {
      const assigned = input.lines.filter((l) =>
        p.categoryIds && p.categoryIds.length > 0
          ? l.categoryId !== undefined && l.categoryId !== null && p.categoryIds.includes(l.categoryId)
          : false,
      );
      if (assigned.length > 0) {
        groups.push({
          title: p.alias || p.name,
          targetAddress: p.address,
          width: p.width || s.width,
          lines: assigned,
        });
      }
    }
    // Ítems no asignados a ninguna impresora van a la impresora por defecto (o primera)
    const assignedIds = new Set(configuredPrinters.flatMap((p) => p.categoryIds ?? []));
    const unassigned = input.lines.filter(
      (l) => l.categoryId === null || l.categoryId === undefined || !assignedIds.has(l.categoryId),
    );
    if (unassigned.length > 0) {
      const defaultP = configuredPrinters.find((p) => p.isDefault) ?? configuredPrinters[0]!;
      const existing = groups.find((g) => g.targetAddress === defaultP.address);
      if (existing) {
        existing.lines.push(...unassigned);
      } else {
        groups.push({
          title: defaultP.alias || 'General',
          targetAddress: defaultP.address,
          width: defaultP.width || s.width,
          lines: unassigned,
        });
      }
    }
  } else if (splitMode === 'by_category') {
    // Modo separar comandas por cocina (comida) vs barra (bebidas y postres)
    const isBarItem = (l: ComandaItem) => {
      const name = (l.categoryName || l.label).toLowerCase();
      return /bebida|trago|cerveza|vino|gaseosa|postre|caf[eé]|agua/i.test(name);
    };

    const cocinaItems = input.lines.filter((l) => !isBarItem(l));
    const barraItems = input.lines.filter((l) => isBarItem(l));

    if (cocinaItems.length > 0) {
      groups.push({
        title: 'Cocina',
        targetAddress: s.address ?? undefined,
        width: s.width,
        lines: cocinaItems,
      });
    }
    if (barraItems.length > 0) {
      groups.push({
        title: 'Barra / Bebidas',
        targetAddress: s.address ?? undefined,
        width: s.width,
        lines: barraItems,
      });
    }
  } else {
    // Comanda unificada (todo en un solo ticket)
    groups.push({
      title: '',
      targetAddress: s.address ?? undefined,
      width: s.width,
      lines: input.lines,
    });
  }

  // Imprimir cada grupo secuencialmente
  let printedCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]!;
    const payload = comandaTicket({
      place: input.place,
      account: input.account,
      lines: g.lines,
      width: g.width,
      groupTitle: g.title || undefined,
      roundNumber: input.roundNumber,
      isReprint: input.isReprint,
    });

    const err = await tryPrint(payload, g.targetAddress);
    if (err) {
      errors.push(`${g.title || 'Comanda'}: ${err}`);
    } else {
      printedCount++;
    }

    if (i < groups.length - 1) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  if (errors.length > 0) {
    return {
      success: printedCount > 0,
      ticketsPrinted: printedCount,
      error: errors.join(' · '),
    };
  }

  return { success: true, ticketsPrinted: printedCount };
}
