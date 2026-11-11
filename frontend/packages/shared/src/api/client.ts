// Wrapper único sobre fetch. Centraliza la base URL, el Bearer token, el
// formato de respuesta del backend ({ ok, data } / { ok, error }) y el 401.
// No conoce la plataforma: recibe getToken/onUnauthorized por inyección, así
// el panel (web) y el TPV (Capacitor) lo configuran a su manera.

export interface ApiClientConfig {
  baseUrl: string | (() => string | Promise<string>);
  getToken: () => string | null | Promise<string | null>;
  onUnauthorized?: () => void;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
  /** true cuando el fallo fue de red (sin respuesta del servidor). */
  get isOffline(): boolean {
    return this.status === 0;
  }
}

type JsonObject = Record<string, unknown>;

export class ApiClient {
  private preferSameOriginProxy = false;

  constructor(private readonly config: ApiClientConfig) {}

  private async getBaseUrl(): Promise<string> {
    const b = this.config.baseUrl;
    const url = typeof b === 'function' ? await b() : b;
    return url.replace(/\/+$/, '');
  }

  private canUseSameOriginProxy(): boolean {
    if (typeof window === 'undefined') return false;
    const proto = window.location.protocol;
    const host = window.location.hostname.toLowerCase();
    return (proto === 'https:' || proto === 'http:') && host.endsWith('pizzalog.net');
  }

  private async fetchWithFallback(
    baseUrl: string,
    path: string,
    init: RequestInit,
    token?: string | null
  ): Promise<Response> {
    const proxyHeaders: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
    };
    if (token) {
      proxyHeaders['X-Pizzalog-Authorization'] = `Bearer ${token}`;
    }

    if (this.preferSameOriginProxy && this.canUseSameOriginProxy()) {
      try {
        return await fetch(`/api-proxy.php?endpoint=${encodeURIComponent(path)}`, {
          ...init,
          headers: proxyHeaders,
        });
      } catch {
        // Si fallara el proxy local, reintentar vía URL directa
      }
    }

    try {
      return await fetch(`${baseUrl}${path}`, init);
    } catch {
      // 1. Pre-calentar la sesión TLS con un GET simple sin cuerpo (evita fallos de renegociación TLS en POST)
      try {
        await fetch(`${baseUrl}/`, { method: 'GET', cache: 'no-store', mode: 'cors' });
        return await fetch(`${baseUrl}${path}`, init);
      } catch {
        // 2. Fallback automático al proxy same-origin (/api-proxy.php) en *.pizzalog.net
        if (this.canUseSameOriginProxy()) {
          const proxyRes = await fetch(`/api-proxy.php?endpoint=${encodeURIComponent(path)}`, {
            ...init,
            headers: proxyHeaders,
          });
          this.preferSameOriginProxy = true;
          return proxyRes;
        }
        throw new Error('Network error');
      }
    }
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.config.getToken();
    const baseUrl = await this.getBaseUrl();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let res: Response;
    try {
      res = await this.fetchWithFallback(
        baseUrl,
        path,
        {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        },
        token
      );
    } catch {
      // Sin respuesta: caída de red. status 0 lo marca como offline.
      throw new ApiError('No se pudo conectar con el servidor', 0);
    }

    if (res.status === 401 && path !== '/auth/login') {
      this.config.onUnauthorized?.();
      throw new ApiError('Sesión expirada', 401);
    }

    let payload: JsonObject;
    try {
      payload = (await res.json()) as JsonObject;
    } catch {
      throw new ApiError('Respuesta inválida del servidor', res.status);
    }

    if (payload['ok'] === false) {
      throw new ApiError(String(payload['error'] ?? 'Error desconocido'), res.status);
    }
    if (!res.ok) {
      throw new ApiError(`Error ${res.status}`, res.status);
    }

    return (payload['data'] ?? null) as T;
  }

  /** Subida multipart (imágenes). El browser arma el boundary solo. */
  async postFile<T>(path: string, file: Blob, field = 'image'): Promise<T> {
    const token = await this.config.getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const form = new FormData();
    form.append(field, file, 'imagen.jpg');

    const baseUrl = await this.getBaseUrl();
    let res: Response;
    try {
      res = await this.fetchWithFallback(baseUrl, path, { method: 'POST', headers, body: form }, token);
    } catch {
      throw new ApiError('No se pudo conectar con el servidor', 0);
    }
    if (res.status === 401) {
      this.config.onUnauthorized?.();
      throw new ApiError('Sesión expirada', 401);
    }
    let payload: JsonObject;
    try {
      payload = (await res.json()) as JsonObject;
    } catch {
      throw new ApiError('Respuesta inválida del servidor', res.status);
    }
    if (payload['ok'] === false) {
      throw new ApiError(String(payload['error'] ?? 'Error desconocido'), res.status);
    }
    if (!res.ok) {
      throw new ApiError(`Error ${res.status}`, res.status);
    }
    return (payload['data'] ?? null) as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }
  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }
  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}
