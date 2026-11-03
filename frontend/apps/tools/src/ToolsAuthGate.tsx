import { useEffect, useState, type FormEvent } from 'react';
import { createInitialDemoWorkspace, type ToolsWorkspaceState } from './demoData';
import { App } from './App';

const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'https://api.pizzalog.net').replace(/\/+$/, '');
const TOKEN_KEY = 'pizzalog_tools_session';

function readSessionToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function writeSessionToken(token: string): void {
  try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* Keep the current login in memory for this tab. */ }
}
function clearSessionToken(): void {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* Storage may be disabled. */ }
}

type Account = { id: number; email: string; name: string; expires_at?: string | null };
type ApiResponse<T> = { ok: boolean; data?: T; error?: string };

class ToolsApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ToolsApiError';
  }
}

async function api<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ToolsApiError('No se pudo conectar con el servidor', 0);
  }
  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ToolsApiError('El servidor devolvió una respuesta inválida', response.status);
  }
  if (!response.ok || !payload.ok || payload.data === undefined) {
    throw new ToolsApiError(payload.error ?? 'No se pudo completar la solicitud', response.status);
  }
  return payload.data;
}

export function ToolsAuthGate() {
  const [token, setToken] = useState<string | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [workspace, setWorkspace] = useState<ToolsWorkspaceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');

  useEffect(() => {
    // Elimina el cache local de la versión previa, que ya no es una fuente de datos.
    try { localStorage.removeItem('pizzalog_tools_workspace_v2'); } catch { /* storage may be disabled */ }
    const saved = readSessionToken();
    if (!saved) {
      setLoading(false);
      return;
    }

    async function restore() {
      try {
        const me = await api<{ account: Account }>('/tools/auth/me', saved);
        setToken(saved);
        setAccount(me.account);
        try {
          const data = await api<{ workspace: ToolsWorkspaceState | null }>('/tools/workspace', saved);
          setWorkspace(data.workspace ?? createInitialDemoWorkspace());
          setWorkspaceError('');
        } catch (err) {
          setWorkspaceError(err instanceof Error ? err.message : 'No se pudo recuperar el espacio de trabajo');
        }
      } catch (err) {
        const status = err instanceof ToolsApiError ? err.status : 0;
        if (status === 401 || status === 403) {
          clearSessionToken();
          setError(err instanceof Error ? err.message : 'La sesión ya no es válida. Ingresá nuevamente.');
        } else {
          setError(err instanceof Error ? err.message : 'No se pudo verificar la sesión guardada');
        }
      } finally {
        setLoading(false);
      }
    }
    void restore();
  }, []);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setError('');
    setWorkspaceError('');
    setLoading(true);
    try {
      const result = await api<{ token: string; account: Account }>('/tools/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      writeSessionToken(result.token);
      setToken(result.token);
      setAccount(result.account);
      try {
        const data = await api<{ workspace: ToolsWorkspaceState | null }>('/tools/workspace', result.token);
        setWorkspace(data.workspace ?? createInitialDemoWorkspace());
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : 'No se pudo recuperar el espacio de trabajo');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  async function retryWorkspaceLoad() {
    if (!token) return;
    setLoading(true);
    setWorkspaceError('');
    try {
      const data = await api<{ workspace: ToolsWorkspaceState | null }>('/tools/workspace', token);
      setWorkspace(data.workspace ?? createInitialDemoWorkspace());
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'No se pudo recuperar el espacio de trabajo');
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearSessionToken();
    setToken(null);
    setAccount(null);
    setWorkspace(null);
    setPassword('');
  }

  if (loading) {
    return <main className="tools-auth"><div className="tools-auth-card">Verificando acceso…</div></main>;
  }

  if (token && account && workspaceError) {
    return (
      <main className="tools-auth">
        <section className="tools-auth-card">
          <div className="tools-auth-kicker">PIZZALOG / TOOLS</div>
          <h1>No pudimos cargar tu espacio de trabajo</h1>
          <p>Tu sesión sigue activa y no se reemplazaron tus datos guardados.</p>
          <div className="alert-banner">{workspaceError}</div>
          <button className="btn btn--primary tools-auth-submit" type="button" onClick={() => void retryWorkspaceLoad()} disabled={loading}>
            {loading ? 'Reintentando…' : 'Reintentar'}
          </button>
          <button className="btn tools-auth-submit" type="button" onClick={logout}>Cerrar sesión</button>
        </section>
      </main>
    );
  }

  if (token && account && workspace) {
    return <App token={token} account={account} initialWorkspace={workspace} onLogout={logout} />;
  }

  return (
    <main className="tools-auth">
      <form className="tools-auth-card" onSubmit={handleLogin}>
        <div className="tools-auth-kicker">PIZZALOG / TOOLS</div>
        <h1>Restaurant Profit Kit</h1>
        <p>Ingresá con la cuenta que recibiste al adquirir el producto.</p>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="alert-banner">{error}</div>}
        <button className="btn btn--primary tools-auth-submit" type="submit" disabled={loading}>
          {loading ? 'Ingresando…' : 'Ingresar a mis herramientas'}
        </button>
        <small>¿Todavía no tenés acceso? La cuenta se habilita después de la compra.</small>
      </form>
    </main>
  );
}
