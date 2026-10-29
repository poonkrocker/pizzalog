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

export interface ReceiptConfig {
  showLogo?: boolean;
  headerText?: string;
  footerText?: string;
  showCustomerInfo?: boolean;
  showComments?: boolean;
  language?: string;
  show_logo?: boolean;
  header_text?: string | null;
  footer_text?: string | null;
  show_customer_info?: boolean;
  show_comments?: boolean;
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
    footerNote?: string;
  };
  receiptConfig?: ReceiptConfig;
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
  const address = targetAddress || s.address || s.printers?.[0]?.address;
  if (!address) {
    throw new Error('No hay ninguna impresora configurada ni seleccionada. Elegila en Ajustes.');
  }

  await BluetoothSerial.enable();

  // Si había una conexión previa colgada, desconectar preventivamente antes de reconectar
  try {
    await BluetoothSerial.disconnect({ address });
  } catch {
    /* ignorar */
  }

  // Conectar por RFCOMM SPP
  await BluetoothSerial.connect({ address });
  try {
    await BluetoothSerial.write({ address, value: payload });
    // Esperar a que el búfer de la comandera térmica termine de imprimir antes de cerrar
    await new Promise((resolve) => setTimeout(resolve, 2000));
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
    return e instanceof Error ? e.message : 'No se pudo comunicar con la impresora';
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

/** Despacha e imprime comandas, organizando los tickets por comandera física de forma robusta */
export async function dispatchComandas(input: DispatchComandasInput): Promise<{
  success: boolean;
  ticketsPrinted: number;
  error?: string;
}> {
  const s = await getPrinterSettings();
  if (input.lines.length === 0) return { success: true, ticketsPrinted: 0 };

  const configuredPrinters = s.printers && s.printers.length > 0 ? s.printers : [];
  const activeAddress = s.address || configuredPrinters[0]?.address || null;

  // Si no hay ninguna impresora conectada ni configurada
  if (!activeAddress && configuredPrinters.length === 0) {
    if (!isNative()) {
      return { success: true, ticketsPrinted: 1 };
    }
    return { success: false, ticketsPrinted: 0, error: 'No hay comanderas configuradas en Ajustes' };
  }

  const splitMode =
    s.comandaSplitMode ??
    (configuredPrinters.length > 1 ? 'by_printer' : 'by_category');

  // Grupos lógicos de comanda
  type Group = {
    title: string;
    targetAddress: string;
    width: number;
    lines: Array<{ qty: number; label: string; note?: string }>;
  };

  const groups: Group[] = [];

  if (configuredPrinters.length > 1 && splitMode === 'by_printer') {
    // Múltiples comanderas configuradas específicamente
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
          width: p.width || s.width || 32,
          lines: assigned,
        });
      }
    }
    const assignedIds = new Set(configuredPrinters.flatMap((p) => p.categoryIds ?? []));
    const unassigned = input.lines.filter(
      (l) => l.categoryId === null || l.categoryId === undefined || !assignedIds.has(l.categoryId),
    );
    if (unassigned.length > 0) {
      const defaultP =
        configuredPrinters.find((p) => p.isDefault || p.address === activeAddress) ??
        configuredPrinters[0]!;
      const existing = groups.find((g) => g.targetAddress === defaultP.address);
      if (existing) {
        existing.lines.push(...unassigned);
      } else {
        groups.push({
          title: defaultP.alias || 'General',
          targetAddress: defaultP.address,
          width: defaultP.width || s.width || 32,
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

    // Si hay impresoras nombradas específicamente para Barra o Cocina, usarlas; sino activeAddress
    const barraPrinter = configuredPrinters.find((p) => /barra|bebida/i.test(p.alias || p.name));
    const cocinaPrinter = configuredPrinters.find((p) => /cocina|horno/i.test(p.alias || p.name));

    if (cocinaItems.length > 0) {
      groups.push({
        title: 'Cocina',
        targetAddress: cocinaPrinter?.address || activeAddress || '',
        width: cocinaPrinter?.width || s.width || 32,
        lines: cocinaItems,
      });
    }
    if (barraItems.length > 0) {
      groups.push({
        title: 'Barra / Bebidas',
        targetAddress: barraPrinter?.address || activeAddress || '',
        width: barraPrinter?.width || s.width || 32,
        lines: barraItems,
      });
    }
  } else {
    // Comanda unificada (todo en un solo ticket)
    groups.push({
      title: '',
      targetAddress: activeAddress || '',
      width: s.width || 32,
      lines: input.lines,
    });
  }

  // Agrupar los tickets por dirección física de destino:
  // Si varios grupos van a la MISMA impresora (ej: Cocina y Barra en la misma IT01),
  // se combinan en un único envío para no desconectar y reconectar en milisegundos.
  const jobsByAddress = new Map<string, { width: number; payloads: string[] }>();

  for (const g of groups) {
    const addr = g.targetAddress || activeAddress;
    if (!addr) continue;

    const payload = comandaTicket({
      place: input.place,
      account: input.account,
      lines: g.lines,
      width: g.width,
      groupTitle: g.title || undefined,
      roundNumber: input.roundNumber,
      isReprint: input.isReprint,
    });

    if (!jobsByAddress.has(addr)) {
      jobsByAddress.set(addr, { width: g.width, payloads: [] });
    }
    jobsByAddress.get(addr)!.payloads.push(payload);
  }

  let printedCount = 0;
  const errors: string[] = [];
  const entries = Array.from(jobsByAddress.entries());

  for (let i = 0; i < entries.length; i++) {
    const [addr, job] = entries[i]!;
    // Concatenar los tickets destinados a esta misma comandera (cada uno tiene su propio .cut())
    const fullPayload = job.payloads.join('');

    const err = await tryPrint(fullPayload, addr);
    if (err) {
      // Reintento automático en caso de micro-corte o socket ocupado
      await new Promise((r) => setTimeout(r, 1200));
      const retryErr = await tryPrint(fullPayload, addr);
      if (retryErr) {
        const printerName =
          configuredPrinters.find((p) => p.address === addr)?.alias || s.name || addr;
        errors.push(`${printerName}: ${retryErr}`);
      } else {
        printedCount += job.payloads.length;
      }
    } else {
      printedCount += job.payloads.length;
    }

    // Si hay otra impresora física distinta en la lista, esperar a que Android libere el adaptador
    if (i < entries.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
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
