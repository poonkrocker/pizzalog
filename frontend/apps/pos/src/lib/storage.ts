import { Preferences } from '@capacitor/preferences';
import type { TokenStorage } from '@pizzalog/shared';

const KEY = 'pizzalog_token';
const LEGACY_CRED_KEY = 'pizzalog_saved_credentials';
const SAVED_IDENTIFIER_KEY = 'pizzalog_saved_identifier';

// Almacenamiento del token sobre Capacitor Preferences
export class CapacitorTokenStorage implements TokenStorage {
  async get(): Promise<string | null> {
    const { value } = await Preferences.get({ key: KEY });
    return value;
  }
  async set(token: string): Promise<void> {
    await Preferences.set({ key: KEY, value: token });
  }
  async clear(): Promise<void> {
    await Preferences.remove({ key: KEY });
  }
}

/**
 * Recupera únicamente el identificador (usuario/email) recordado.
 * Si existía el registro legacy con contraseña en texto plano, lo migra y limpia la contraseña.
 */
export async function getSavedCredentials(): Promise<{ email: string } | null> {
  try {
    // Limpiar cualquier contraseña persistida por versiones anteriores
    const legacy = await Preferences.get({ key: LEGACY_CRED_KEY });
    if (legacy.value) {
      await Preferences.remove({ key: LEGACY_CRED_KEY });
      const parsed = JSON.parse(legacy.value);
      if (parsed && typeof parsed.email === 'string' && parsed.email.trim()) {
        await Preferences.set({ key: SAVED_IDENTIFIER_KEY, value: parsed.email.trim() });
        return { email: parsed.email.trim() };
      }
    }

    const { value } = await Preferences.get({ key: SAVED_IDENTIFIER_KEY });
    if (!value || !value.trim()) return null;
    return { email: value.trim() };
  } catch {
    return null;
  }
}

export async function saveCredentials(email: string): Promise<void> {
  await Preferences.remove({ key: LEGACY_CRED_KEY });
  await Preferences.set({ key: SAVED_IDENTIFIER_KEY, value: email.trim() });
}

export async function clearSavedCredentials(): Promise<void> {
  await Preferences.remove({ key: LEGACY_CRED_KEY });
  await Preferences.remove({ key: SAVED_IDENTIFIER_KEY });
}
