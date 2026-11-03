import { useEffect, useState, type FormEvent } from 'react';
import { createInitialDemoWorkspace, type ToolsWorkspaceState } from './demoData';
import { App } from './App';

const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'https://api.pizzalog.net').replace(/\/+$/, '');
const TOKEN_KEY = 'pizzalog_tools_session';

type Account = { id: number; email: string; name: string; expires_at?: string | null };
type ApiResponse<T> = { ok: boolean; data?: T; error?: string };

async function api<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !payload.ok || payload.data === undefined) {
    throw new Error(payload.error ?? 'No se pudo completar la solicitud');
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

  useEffect(() => {
    // Elimina el cache local de la versión previa, que ya no es una fuente de datos.
    try { localStorage.removeItem('pizzalog_tools_workspace_v2'); } catch { /* storage may be disabled */ }
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (!saved) {
      setLoading(false);
      return;
    }
    api<{ account: Account }>('/tools/auth/me', saved)
      .then(async (me) => {
        const data = await api<{ workspace: ToolsWorkspaceState | null }>('/tools/workspace', saved);
        setToken(saved);
        setAccount(me.account);
        setWorkspace(data.workspace ?? createInitialDemoWorkspace());
      })
      .catch(() => {
        sessionStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api<{ token: string; account: Account }>('/tools/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const data = await api<{ workspace: ToolsWorkspaceState | null }>('/tools/workspace', result.token);
      sessionStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token);
      setAccount(result.account);
      setWorkspace(data.workspace ?? createInitialDemoWorkspace());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setAccount(null);
    setWorkspace(null);
    setPassword('');
  }

  if (loading) {
    return <main className="tools-auth"><div className="tools-auth-card">Verificando acceso…</div></main>;
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
