import { Preferences } from '@capacitor/preferences';
import type { TokenStorage } from '@pizzalog/shared';

const KEY = 'pizzalog_token';

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
