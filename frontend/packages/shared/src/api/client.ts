// Wrapper único sobre fetch. Centraliza la base URL, el Bearer token, el
// formato de respuesta del backend ({ ok, data } / { ok, error }) y el 401.
// No conoce la plataforma: recibe getToken/onUnauthorized por inyección, así
// el panel (web) y el TPV (Capacitor) lo configuran a su manera.

export interface ApiClientConfig {
  baseUrl: string;
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
  constructor(private readonly config: ApiClientConfig) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.config.getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let res: Response;
    try {
      res = await fetch(`${this.config.baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      // Sin respuesta: caída de red. status 0 lo marca como offline.
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
