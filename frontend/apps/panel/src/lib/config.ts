declare global {
  interface Window {
    __PIZZALOG_CONFIG__?: { apiUrl?: string };
  }
}

const runtimeUrl =
  typeof window !== 'undefined' ? window.__PIZZALOG_CONFIG__?.apiUrl : undefined;

export const config = {
  apiUrl:
    runtimeUrl ??
    (import.meta.env.VITE_API_URL as string | undefined) ??
    'https://api.pizzalog.net',
};
