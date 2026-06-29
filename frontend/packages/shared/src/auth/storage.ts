// Almacenamiento del token, abstracto. El panel usa localStorage; el TPV
// (Capacitor) inyecta su propia implementación con almacenamiento seguro.

export interface TokenStorage {
  get(): string | null | Promise<string | null>;
  set(token: string): void | Promise<void>;
  clear(): void | Promise<void>;
}

export class WebTokenStorage implements TokenStorage {
  constructor(private readonly key = 'pizzalog_token') {}
  get(): string | null {
    return localStorage.getItem(this.key);
  }
  set(token: string): void {
    localStorage.setItem(this.key, token);
  }
  clear(): void {
    localStorage.removeItem(this.key);
  }
}
