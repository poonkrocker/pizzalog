import type { CreateOrderInput, CreateOrderResponse, Menu } from '../types';

declare global {
  interface Window {
    __PIZZALOG_CONFIG__?: { apiUrl?: string; defaultSlug?: string; slug?: string };
  }
}

export const API =
  window.__PIZZALOG_CONFIG__?.apiUrl ??
  (import.meta.env.VITE_API_URL as string | undefined) ??
  'https://api.pizzalog.net';

/** Error de la API con el mensaje que mandó el back (los 422 son legibles). */
export class CartaError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  let body: { data?: T; error?: string } | null = null;
  try {
    body = (await res.json()) as { data?: T; error?: string };
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.data === undefined) {
    throw new CartaError(body?.error ?? 'No pudimos conectarnos con el local');
  }
  return body.data;
}

/**
 * Las tres vistas de la carta:
 *  - 'carta'   → /{slug}         · pedís
 *  - 'secreta' → /{slug}/secreta · pedís, pero solo lo que no está en el listado
 *  - 'salon'   → /{slug}/salon   · solo mirás (QR de la mesa)
 */
export type Mode = 'carta' | 'secreta' | 'salon';

export interface Route {
  slug: string | null;
  mode: Mode;
}

export function routeFromPath(): Route {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const first = parts[0];

  if (!first) {
    const fallback = window.__PIZZALOG_CONFIG__?.defaultSlug || window.__PIZZALOG_CONFIG__?.slug;
    if (fallback) {
      window.history.replaceState(null, '', `/${fallback}`);
      return { slug: fallback, mode: 'carta' };
    }
    return { slug: null, mode: 'carta' };
  }

  const second = (parts[1] ?? '').toLowerCase();
  const mode: Mode = second === 'salon' ? 'salon' : second === 'secreta' ? 'secreta' : 'carta';

  return { slug: decodeURIComponent(first).toLowerCase(), mode };
}

export function fetchMenu(slug: string, mode: Mode): Promise<Menu> {
  const path = mode === 'secreta' ? `/public/${slug}/menu/secreta` : `/public/${slug}/menu`;
  return fetch(`${API}${path}`).then((r) => unwrap<Menu>(r));
}

export function createOrder(slug: string, input: CreateOrderInput): Promise<CreateOrderResponse> {
  return fetch(`${API}/public/${slug}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).then((r) => unwrap<CreateOrderResponse>(r));
}

export const money = (n: number) =>
  '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
