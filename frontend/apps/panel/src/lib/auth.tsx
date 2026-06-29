import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createApi, WebTokenStorage, type Api, type User } from '@pizzalog/shared';
import { config } from './config';

// Storage del token a nivel módulo: getToken del cliente siempre lee el valor
// más reciente, sin depender del render.
const storage = new WebTokenStorage();

interface AuthState {
  user: User | null;
  loading: boolean;
  api: Api;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const api = useMemo(
    () =>
      createApi({
        baseUrl: config.apiUrl,
        getToken: () => storage.get(),
        onUnauthorized: () => {
          storage.clear();
          setUser(null);
        },
      }),
    [],
  );

  // Al montar: si hay token guardado, validarlo trayendo el usuario.
  useEffect(() => {
    const token = storage.get();
    if (!token) {
      setLoading(false);
      return;
    }
    api.auth
      .me()
      .then((r) => setUser(r.user))
      .catch(() => storage.clear())
      .finally(() => setLoading(false));
  }, [api]);

  async function login(email: string, password: string): Promise<void> {
    const r = await api.auth.login(email, password);
    await storage.set(r.token);
    setUser(r.user);
  }

  function logout(): void {
    storage.clear();
    setUser(null);
  }

  const value = useMemo<AuthState>(
    () => ({ user, loading, api, login, logout }),
    [user, loading, api],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return ctx;
}

export function useApi(): Api {
  return useAuth().api;
}
