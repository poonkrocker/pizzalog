import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { BluetoothSerial } from '@e-is/capacitor-bluetooth-serial';

/**
 * Impresión por Bluetooth clásico (SPP) a la comandera térmica.
 *
 * - Solo funciona en la app Android (en el navegador se avisa y no se imprime).
 * - La impresora se elige una vez en Ajustes y queda guardada.
 * - Imprimir nunca bloquea la operación: si falla, la venta/comanda ya está
 *   registrada y solo se informa el error.
 */

export interface PrinterSettings {
  address: string | null;
  name: string | null;
  width: 32 | 48; // 32 = papel 58mm · 48 = papel 80mm
  autoTicket: boolean; // imprimir ticket al cobrar
  autoComanda: boolean; // imprimir comanda al enviar a cuenta
}

const KEY = 'printer_settings';

const DEFAULTS: PrinterSettings = {
  address: null,
  name: null,
  width: 32,
  autoTicket: false,
  autoComanda: false,
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
  await BluetoothSerial.enable(); // pide permisos si hace falta
  const result = await BluetoothSerial.scan();
  return (result.devices ?? [])
    .filter((d) => d.address)
    .map((d) => ({ name: d.name || d.address, address: d.address }));
}

/** Envía un payload ESC/POS a la impresora configurada. */
export async function printRaw(payload: string): Promise<void> {
  if (!isNative()) {
    throw new Error('La impresión funciona solo en la app Android.');
  }
  const s = await getPrinterSettings();
  if (!s.address) {
    throw new Error('No hay impresora configurada. Elegila en Ajustes.');
  }
  await BluetoothSerial.enable();
  await BluetoothSerial.connect({ address: s.address });
  try {
    await BluetoothSerial.write({ address: s.address, value: payload });
  } finally {
    // Best-effort: si la desconexión falla no queremos tapar el resultado real.
    try {
      await BluetoothSerial.disconnect({ address: s.address });
    } catch {
      /* sin acción */
    }
  }
}

/**
 * Imprime sin bloquear el flujo: devuelve null si salió bien o el mensaje de
 * error para mostrar como aviso. Nunca lanza.
 */
export async function tryPrint(payload: string): Promise<string | null> {
  try {
    await printRaw(payload);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'No se pudo imprimir';
  }
}
