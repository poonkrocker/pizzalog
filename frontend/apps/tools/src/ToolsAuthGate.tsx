import { useEffect, useState, type FormEvent } from 'react';
import { createInitialDemoWorkspace, type ToolsWorkspaceState } from './demoData';
import { App } from './App';
import { CommercialPlansModal } from './CommercialPlansModal';

const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'https://api.pizzalog.net').replace(/\/+$/, '');
const TOKEN_KEY = 'pizzalog_tools_session';
const isStagingHost = typeof window !== 'undefined' && window.location.hostname.toLowerCase().includes('staging');
const TOOLS_ENVIRONMENT = (isStagingHost || ((import.meta.env.VITE_TOOLS_ENV as string | undefined) === 'staging')) ? 'staging' : 'production';

const LEGACY_WORKSPACE_KEY = 'pizzalog_tools_workspace_v2';

function readLegacyWorkspace(): ToolsWorkspaceState | null {
  try {
    const raw = localStorage.getItem(LEGACY_WORKSPACE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as ToolsWorkspaceState;
    if (
      !value || typeof value !== 'object' ||
      !value.catalog || !Array.isArray(value.catalog.ingredients) ||
      !Array.isArray(value.catalog.purchase_prices) || !Array.isArray(value.catalog.recipes) ||
      !Array.isArray(value.operatingExpenses) || !Array.isArray(value.snapshots) ||
      !value.productSalesMap || typeof value.productSalesMap !== 'object'
    ) return null;
    return value;
  } catch {
    return null;
  }
}

function removeLegacyWorkspace(): void {
  try { localStorage.removeItem(LEGACY_WORKSPACE_KEY); } catch { /* Retain the local recovery copy if storage is unavailable. */ }
}

async function restoreOrMigrateWorkspace(token: string): Promise<{ workspace: ToolsWorkspaceState; updatedAt: string | null }> {
  const server = await api<{ workspace: ToolsWorkspaceState | null; updated_at?: string | null }>('/tools/workspace', token);
  if (server.workspace) return { workspace: server.workspace, updatedAt: server.updated_at ?? null };

  const legacy = readLegacyWorkspace();
  if (!legacy) return { workspace: createInitialDemoWorkspace(), updatedAt: null };

  const saved = await api<{ saved: boolean; updated_at?: string | null }>('/tools/workspace', token, {
    method: 'PUT',
    body: JSON.stringify({ workspace: legacy }),
  });
  removeLegacyWorkspace();
  return { workspace: legacy, updatedAt: saved.updated_at ?? null };
}

function readSessionToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function writeSessionToken(token: string): void {
  try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* Keep current login in memory */ }
}
function clearSessionToken(): void {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* Storage may be disabled */ }
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
  const [workspaceUpdatedAt, setWorkspaceUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');

  // Form states
  const [mode, setMode] = useState<'login' | 'activate' | 'reset' | 'forgot'>('login');
  const [actionToken, setActionToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPlans, setShowPlans] = useState(false);

  useEffect(() => {
    // Detectar parámetros URL (?activate=TOKEN o ?reset=TOKEN)
    const params = new URLSearchParams(window.location.search);
    const act = params.get('activate');
    const rst = params.get('reset');
    if (act) {
      setMode('activate');
      setActionToken(act);
      setLoading(false);
      return;
    }
    if (rst) {
      setMode('reset');
      setActionToken(rst);
      setLoading(false);
      return;
    }

    const saved = readSessionToken();
    if (saved === null) {
      setLoading(false);
      return;
    }
    const savedToken: string = saved;

    if (savedToken === 'guest-demo-token') {
      const guestAccount: Account = {
        id: 0,
        email: 'demo@pizzalog.net',
        name: 'Invitado Demo',
        expires_at: null,
      };
      let demoWs: ToolsWorkspaceState;
      try {
        const raw = localStorage.getItem('pizzalog_tools_guest_workspace');
        demoWs = raw ? (JSON.parse(raw) as ToolsWorkspaceState) : createInitialDemoWorkspace();
      } catch {
        demoWs = createInitialDemoWorkspace();
      }
      setToken('guest-demo-token');
      setAccount(guestAccount);
      setWorkspace(demoWs);
      setLoading(false);
      return;
    }

    async function restore() {
      try {
        const me = await api<{ account: Account }>('/tools/auth/me', savedToken);
        setToken(savedToken);
        setAccount(me.account);
        try {
          const restored = await restoreOrMigrateWorkspace(savedToken);
          setWorkspace(restored.workspace);
          setWorkspaceUpdatedAt(restored.updatedAt);
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
    setNotice('');
    setWorkspaceError('');
    setLoading(true);
    try {
      const result = await api<{ token: string; account: Account }>('/tools/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ email, password, environment: TOOLS_ENVIRONMENT }),
      });
      writeSessionToken(result.token);
      setToken(result.token);
      setAccount(result.account);
      try {
        const restored = await restoreOrMigrateWorkspace(result.token);
        setWorkspace(restored.workspace);
        setWorkspaceUpdatedAt(restored.updatedAt);
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : 'No se pudo recuperar el espacio de trabajo');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  async function handleActivateOrReset(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setError('');
    setNotice('');
    setLoading(true);
    const endpoint = mode === 'activate' ? '/tools/auth/activate' : '/tools/auth/reset-password';

    try {
      const result = await api<{ token: string; account: Account }>(endpoint, undefined, {
        method: 'POST',
        body: JSON.stringify({ token: actionToken, password }),
      });
      // Limpiar query params de la URL para que no quede el token expuesto
      window.history.replaceState({}, document.title, window.location.pathname);
      writeSessionToken(result.token);
      setToken(result.token);
      setAccount(result.account);
      try {
        const restored = await restoreOrMigrateWorkspace(result.token);
        setWorkspace(restored.workspace);
        setWorkspaceUpdatedAt(restored.updatedAt);
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : 'No se pudo recuperar el espacio de trabajo');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo procesar la solicitud');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await api<{ sent: boolean }>('/tools/auth/forgot-password', undefined, {
        method: 'POST',
        body: JSON.stringify({ email, environment: TOOLS_ENVIRONMENT }),
      });
      setNotice('Si el correo corresponde a una cuenta activa, te enviamos un enlace para restablecer tu contraseña.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo procesar la solicitud');
    } finally {
      setLoading(false);
    }
  }

  async function retryWorkspaceLoad() {
    if (!token) return;
    setLoading(true);
    setWorkspaceError('');
    try {
      const restored = await restoreOrMigrateWorkspace(token);
      setWorkspace(restored.workspace);
      setWorkspaceUpdatedAt(restored.updatedAt);
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
    setWorkspaceUpdatedAt(null);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError('');
    setNotice('');
    setMode('login');
  }

  function startGuestDemo() {
    const guestAccount: Account = {
      id: 0,
      email: 'demo@pizzalog.net',
      name: 'Invitado Demo',
      expires_at: null,
    };
    let demoWs: ToolsWorkspaceState;
    try {
      const raw = localStorage.getItem('pizzalog_tools_guest_workspace');
      demoWs = raw ? (JSON.parse(raw) as ToolsWorkspaceState) : createInitialDemoWorkspace();
    } catch {
      demoWs = createInitialDemoWorkspace();
    }
    writeSessionToken('guest-demo-token');
    setToken('guest-demo-token');
    setAccount(guestAccount);
    setWorkspace(demoWs);
    setWorkspaceUpdatedAt(null);
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
    return <App token={token} account={account} initialWorkspace={workspace} initialUpdatedAt={workspaceUpdatedAt} onLogout={logout} />;
  }

  if (mode === 'activate' || mode === 'reset') {
    return (
      <main className="tools-auth">
        <form className="tools-auth-card" onSubmit={handleActivateOrReset}>
          <div className="tools-auth-kicker">PIZZALOG / TOOLS</div>
          <h1>{mode === 'activate' ? '¡Bienvenido! Creá tu contraseña' : 'Restablecer contraseña'}</h1>
          <p>
            {mode === 'activate'
              ? 'Definí la contraseña para acceder a tu Restaurant Profit Kit.'
              : 'Ingresá tu nueva contraseña para volver a acceder a tu cuenta.'}
          </p>
          <label className="field">
            <span>Nueva Contraseña (mínimo 8 caracteres)</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Confirmar Contraseña</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </label>
          {error && <div className="alert-banner">{error}</div>}
          <button className="btn btn--primary tools-auth-submit" type="submit" disabled={loading}>
            {loading ? 'Guardando…' : mode === 'activate' ? 'Activar cuenta y acceder' : 'Guardar nueva contraseña'}
          </button>
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <button
              type="button"
              className="link"
              onClick={() => {
                setMode('login');
                window.history.replaceState({}, document.title, window.location.pathname);
              }}
            >
              Volver al inicio de sesión
            </button>
          </div>
        </form>
      </main>
    );
  }

  if (mode === 'forgot') {
    return (
      <main className="tools-auth">
        <form className="tools-auth-card" onSubmit={handleForgotPassword}>
          <div className="tools-auth-kicker">PIZZALOG / TOOLS</div>
          <h1>Recuperar Contraseña</h1>
          <p>Ingresá tu email registrado y te enviaremos un enlace seguro para restablecer tu contraseña.</p>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {error && <div className="alert-banner">{error}</div>}
          {notice && <div className="alert-banner alert-banner--success" style={{ background: '#e8f5e9', color: '#2e7d32' }}>{notice}</div>}
          <button className="btn btn--primary tools-auth-submit" type="submit" disabled={loading}>
            {loading ? 'Enviando…' : 'Enviar enlace de recuperación'}
          </button>
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <button
              type="button"
              className="link"
              onClick={() => {
                setMode('login');
                setError('');
                setNotice('');
              }}
            >
              ← Volver al inicio de sesión
            </button>
          </div>
        </form>
      </main>
    );
  }

  return (
    <main className="tools-auth">
      <form className="tools-auth-card" onSubmit={handleLogin}>
        <div className="tools-auth-kicker">PIZZALOG / TOOLS</div>
        <h1>Restaurant Profit Kit</h1>
        <p>Ingresá con la cuenta que recibiste al adquirir el producto o vinculá tu usuario de Pizzalog App.</p>
        <label className="field">
          <span>Email o Usuario</span>
          <input type="text" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="alert-banner">{error}</div>}
        <button className="btn btn--primary tools-auth-submit" type="submit" disabled={loading}>
          {loading ? 'Ingresando…' : 'Ingresar a mis herramientas'}
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', fontSize: '0.82rem' }}>
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode('forgot');
              setError('');
              setNotice('');
            }}
          >
            ¿Olvidaste tu contraseña?
          </button>
          <span style={{ color: '#888' }}>Tools v1.0</span>
        </div>
        <small style={{ marginTop: '0.75rem', display: 'block', color: '#666' }}>
          ¿Todavía no tenés cuenta? Podés probar la demo interactiva en vivo o suscribirte para acceso permanente.
        </small>
        <div style={{ marginTop: '0.85rem', borderTop: '1px solid #44372e', paddingTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            className="btn btn--secondary"
            style={{ width: '100%', padding: '10px 14px', fontSize: '0.88rem', borderColor: '#d7a35a', color: '#f7d399', fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}
            onClick={startGuestDemo}
          >
            🚀 Explorar Demo en Vivo (Sin Registro)
          </button>
          <button
            type="button"
            className="link"
            style={{ color: '#d7a35a', fontWeight: 600, fontSize: '0.86rem', textAlign: 'center' }}
            onClick={() => setShowPlans(true)}
          >
            ✨ Ver Planes, Precios y Medios de Pago
          </button>
        </div>
      </form>
      {showPlans && (
        <CommercialPlansModal onClose={() => setShowPlans(false)} userEmail={email} />
      )}
    </main>
  );
}
