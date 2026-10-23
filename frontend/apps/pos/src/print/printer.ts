import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { BluetoothSerial } from '@e-is/capacitor-bluetooth-serial';

export interface PrinterSettings {
  address: string | null;
  name: string | null;
  width: 32 | 48; // 32 = papel 58mm · 48 = papel 80mm
  autoTicket: boolean; // imprimir ticket al cobrar
  autoComanda: boolean; // imprimir comanda al enviar a cuenta
  useDigitalKds: boolean; // mostrar/usar comandera digital en cocina (false = comandas en papel y pincho)
}

const KEY = 'printer_settings';

const DEFAULTS: PrinterSettings = {
  address: null,
  name: null,
  width: 32,
  autoTicket: false,
  autoComanda: false,
  useDigitalKds: true,
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

/**
 * Envía ESC/POS a una impresora Bluetooth clásica.
 *
 * Muchas impresoras térmicas SPP económicas solo aceptan RFCOMM sin
 * autenticación (insecure). Se intenta primero la conexión normal y, si falla,
 * la conexión insecure. El ticket se manda en bloques para evitar que algunos
 * buffers pequeños de impresora descarten parte o todo el contenido.
 */
export async function printRaw(payload: string): Promise<void> {
  if (!isNative()) {
    throw new Error('La impresión funciona solo en la app Android instalada.');
  }
  const s = await getPrinterSettings();
  if (!s.address) {
    throw new Error('No hay impresora configurada. Elegila en Ajustes.');
  }
  if (!payload) {
    throw new Error('El ticket está vacío; no hay nada para imprimir.');
  }

  await BluetoothSerial.enable();

  let connected = false;
  let lastConnectError: unknown;
  try {
    try {
      await BluetoothSerial.connect({ address: s.address });
      connected = true;
    } catch (error) {
      lastConnectError = error;
    }

    if (!connected) {
      try {
        await BluetoothSerial.connectInsecure({ address: s.address });
        connected = true;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error ?? '');
        const previous = lastConnectError instanceof Error ? lastConnectError.message : String(lastConnectError ?? '');
        throw new Error(
          `No se pudo conectar con ${s.name ?? s.address} por Bluetooth. ${detail || previous || 'Verificá que esté encendida, emparejada y fuera de otra conexión.'}`,
        );
      }
    }

    // ESC/POS se genera como ASCII, por lo que cortar el string no divide
    // caracteres multibyte. Escrituras secuenciales respetan el orden del ticket.
    const chunkSize = 128;
    for (let offset = 0; offset < payload.length; offset += chunkSize) {
      await BluetoothSerial.write({
        address: s.address,
        value: payload.slice(offset, offset + chunkSize),
      });
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error ?? '');
    throw new Error(detail || 'Falló la comunicación Bluetooth con la impresora.');
  } finally {
    if (connected) {
      try {
        await BluetoothSerial.disconnect({ address: s.address });
      } catch {
        // No ocultar el resultado real de la impresión por un fallo al desconectar.
      }
    }
  }
}

export async function tryPrint(payload: string): Promise<string | null> {
  try {
    await printRaw(payload);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'No se pudo imprimir';
  }
}
