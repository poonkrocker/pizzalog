import { Preferences } from '@capacitor/preferences';
import type { TokenStorage } from '@pizzalog/shared';

const KEY = 'pizzalog_token';
const CRED_KEY = 'pizzalog_saved_credentials';

// Almacenamiento del token sobre Capacitor Preferences (seguro en el
// dispositivo; en el navegador cae a localStorage automáticamente).
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

export async function getSavedCredentials(): Promise<{ email: string; password: string } | null> {
  try {
    const { value } = await Preferences.get({ key: CRED_KEY });
    if (!value) return null;
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed.email === 'string' && typeof parsed.password === 'string') {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function saveCredentials(email: string, password: string): Promise<void> {
  await Preferences.set({ key: CRED_KEY, value: JSON.stringify({ email, password }) });
}

export async function clearSavedCredentials(): Promise<void> {
  await Preferences.remove({ key: CRED_KEY });
}
