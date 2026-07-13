import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createApi, type User } from '@pizzalog/shared';
import { config } from './config';
import { CapacitorTokenStorage } from './storage';

const storage = new CapacitorTokenStorage();

// Cliente único de la app. El token se lee de forma asíncrona desde el
// almacenamiento seguro; el ApiClient ya soporta getToken asíncrono.
const api = createApi({
  baseUrl: config.apiUrl,
  getToken: () => storage.get(),
  onUnauthorized: () => {
    void storage.clear();
  },
});

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Al montar: si hay token guardado, recupero la sesión.
  useEffect(() => {
    let active = true;
    void storage.get().then(async (token) => {
      if (!token) {
        if (active) setLoading(false);
        return;
      }
      try {
        const r = await api.auth.me();
        if (active) setUser(r.user);
      } catch {
        await storage.clear();
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  async function login(email: string, password: string) {
    const r = await api.auth.login(email, password);
    await storage.set(r.token);
    setUser(r.user);
  }

  async function logout() {
    await storage.clear();
    setUser(null);
  }

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return ctx;
}

export function useApi() {
  return api;
}
