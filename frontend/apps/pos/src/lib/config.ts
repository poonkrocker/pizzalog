import { Preferences } from '@capacitor/preferences';

const API_KEY = 'pizzalog_api_url';
export const DEFAULT_API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://api.pizzalog.net';

export async function getStoredApiUrl(): Promise<string> {
  try {
    const { value } = await Preferences.get({ key: API_KEY });
    if (value && value.trim().length > 0) {
      return value.trim().replace(/\/+$/, '');
    }
  } catch {
    /* fallback al default */
  }
  return DEFAULT_API_URL;
}

export async function setStoredApiUrl(url: string): Promise<void> {
  const clean = url.trim().replace(/\/+$/, '');
  await Preferences.set({ key: API_KEY, value: clean });
}

export async function resetStoredApiUrl(): Promise<void> {
  await Preferences.remove({ key: API_KEY });
}

export const config = {
  getApiUrl: getStoredApiUrl,
  defaultApiUrl: DEFAULT_API_URL,
  businessName: (import.meta.env.VITE_BUSINESS_NAME as string | undefined) ?? 'Pizzalog',
};

