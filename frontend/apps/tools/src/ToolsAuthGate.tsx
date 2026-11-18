import { Component, useEffect, useState, type ErrorInfo, type FormEvent, type ReactNode } from 'react';
import { todayLocalDateString } from '@pizzalog/cost-engine';
import { createInitialDemoWorkspace, normalizeWorkspace, type LocaleCode, type ToolsWorkspaceState } from './demoData';
import { App } from './App';
import { CommercialPlansModal } from './CommercialPlansModal';
import { AUTH_I18N } from './i18n';

const AUTH_LOCALE_KEY = 'pizzalog_tools_locale';

function readPreferredAuthLocale(): LocaleCode {
  try {
    const saved = localStorage.getItem(AUTH_LOCALE_KEY);
    if (saved === 'es-AR' || saved === 'pt-BR' || saved === 'en') return saved;
  } catch { /* ignore */ }
  if (typeof navigator !== 'undefined') {
    const lang = (navigator.language || '').toLowerCase();
    if (lang.startsWith('pt')) return 'pt-BR';
    if (lang.startsWith('en')) return 'en';
  }
  return 'es-AR';
}

class ToolsErrorBoundary extends Component<
  { children: ReactNode; workspace: ToolsWorkspaceState; locale: LocaleCode; onResetDemo: () => void; onLogout: () => void },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ToolsErrorBoundary caught error:', error, info);
  }

  override render() {
    if (this.state.error) {
      const aText = AUTH_I18N[this.props.locale] ?? AUTH_I18N['es-AR'];
      return (
        <main className="tools-auth">
          <section className="tools-auth-card" style={{ maxWidth: 580 }}>
            <div className="tools-auth-kicker">{aText.recoveryKicker}</div>
            <h1>{aText.recoveryTitle}</h1>
            <p>{aText.recoveryDesc}</p>
            <div className="alert-banner" style={{ wordBreak: 'break-word' }}>
              {this.state.error.message || aText.errGeneric}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              <button
                className="btn btn--primary tools-auth-submit"
                type="button"
                onClick={() => {
                  this.setState({ error: null });
                  window.location.reload();
                }}
              >
                {aText.recoveryRetry}
              </button>
              <button
                className="btn btn--secondary tools-auth-submit"
                type="button"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(this.props.workspace, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `pizzalog-tools-recovery-${todayLocalDateString()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                {aText.recoveryDownload}
              </button>
              <button
                className="btn btn--secondary tools-auth-submit"
                type="button"
                onClick={() => {
                  this.setState({ error: null });
                  this.props.onResetDemo();
                }}
              >
                {aText.recoveryReset}
              </button>
              <button className="btn tools-auth-submit" type="button" onClick={this.props.onLogout}>
                {aText.signOutBtn}
              </button>
            </div>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

const isStagingHost = typeof window !== 'undefined' && window.location.hostname.toLowerCase().includes('staging');
export const TOOLS_ENVIRONMENT: 'staging' | 'production' =
  (isStagingHost || ((import.meta.env.VITE_TOOLS_ENV as string | undefined) === 'staging')) ? 'staging' : 'production';
const RAW_PROD_API = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://api.pizzalog.net';
const RAW_STAGING_API = (import.meta.env.VITE_STAGING_API_URL as string | undefined) ?? RAW_PROD_API;
const API_URL = (TOOLS_ENVIRONMENT === 'staging' ? RAW_STAGING_API : RAW_PROD_API).replace(/\/+$/, '');
const TOKEN_KEY = 'pizzalog_tools_session';

const LEGACY_WORKSPACE_KEY = 'pizzalog_tools_workspace_v2';

let preferSameOriginToolsProxy = false;

function canUseSameOriginToolsProxy(): boolean {
  if (typeof window === 'undefined') return false;
  const proto = window.location.protocol;
  const host = window.location.hostname.toLowerCase();
  return (proto === 'https:' || proto === 'http:') && host.endsWith('pizzalog.net');
}

export async function parseToolsJsonResponse<T = any>(response: Response): Promise<T> {
  const rawText = await response.text();
  const trimmed = rawText.trim();
  if (!trimmed || trimmed.startsWith('<')) {
    throw new ToolsApiError(
      response.status >= 400
        ? `El servidor rechazó o interrumpió la solicitud (HTTP ${response.status})`
        : 'El servidor devolvió una respuesta no válida en lugar de JSON',
      response.status || 502
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new ToolsApiError('El servidor devolvió una respuesta inválida', response.status || 502);
  }
}

export async function toolsFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const auth = headers.get('Authorization');
  if (auth) {
    headers.set('X-Pizzalog-Authorization', auth);
  }

  // En producción/staging sobre *.pizzalog.net, si ya se activó el proxy same-origin, usarlo primero
  if (preferSameOriginToolsProxy && canUseSameOriginToolsProxy()) {
    try {
      const proxyRes = await fetch(`/api-proxy.php?endpoint=${encodeURIComponent(path)}`, {
        ...init,
        headers,
      });
      const ct = (proxyRes.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('application/json')) {
        return proxyRes;
      }
    } catch {
      // Si fallara el proxy local, reintentar vía URL directa
    }
  }

  try {
    const directRes = await fetch(`${API_URL}${path}`, { ...init, headers });
    const ct = (directRes.headers.get('content-type') || '').toLowerCase();
    // Si el servidor devolvió una página HTML de error (ej. ModSecurity/Apache <!DOCTYPE html>), intentar por proxy same-origin
    if (!ct.includes('application/json') && canUseSameOriginToolsProxy()) {
      try {
        const proxyRes = await fetch(`/api-proxy.php?endpoint=${encodeURIComponent(path)}`, {
          ...init,
          headers,
        });
        const proxyCt = (proxyRes.headers.get('content-type') || '').toLowerCase();
        if (proxyCt.includes('application/json')) {
          preferSameOriginToolsProxy = true;
          return proxyRes;
        }
      } catch {
        // continuar con directRes
      }
    }
    return directRes;
  } catch {
    try {
      await fetch(`${API_URL}/`, { method: 'GET', cache: 'no-store', mode: 'cors' });
      return await fetch(`${API_URL}${path}`, { ...init, headers });
    } catch {
      if (canUseSameOriginToolsProxy()) {
        const proxyRes = await fetch(`/api-proxy.php?endpoint=${encodeURIComponent(path)}`, {
          ...init,
          headers,
        });
        preferSameOriginToolsProxy = true;
        return proxyRes;
      }
      throw new Error('No se pudo conectar con el servidor');
    }
  }
}

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

function readAccountRecoveryBackup(accountId?: number): {
  workspace: ToolsWorkspaceState;
  baseVersion?: number | null;
  baseUpdatedAt?: string | null;
  pendingSync?: boolean;
} | null {
  if (!accountId || accountId <= 0) return null;
  try {
    const raw = localStorage.getItem(`pizzalog_tools_recovery_${accountId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.workspace?.catalog) return null;
    return {
      workspace: normalizeWorkspace(parsed.workspace),
      baseVersion: typeof parsed.baseVersion === 'number' ? parsed.baseVersion : null,
      baseUpdatedAt: typeof parsed.baseUpdatedAt === 'string' ? parsed.baseUpdatedAt : null,
      pendingSync: Boolean(parsed.pendingSync),
    };
  } catch {
    return null;
  }
}

async function restoreOrMigrateWorkspace(
  token: string,
  accountId?: number,
  fallbackLocale: LocaleCode = 'es-AR'
): Promise<{ workspace: ToolsWorkspaceState; updatedAt: string | null; version: number | null }> {
  const localRecovery = readAccountRecoveryBackup(accountId);
  try {
    const server = await api<{ workspace: ToolsWorkspaceState | null; updated_at?: string | null; version?: number | null }>('/tools/workspace', token);
    const serverVersion = typeof server.version === 'number' ? server.version : 1;

    // Si había cambios hechos sin conexión en esta misma versión base, sincronizarlos automáticamente
    if (
      localRecovery &&
      localRecovery.pendingSync &&
      (localRecovery.baseVersion === null || localRecovery.baseVersion === undefined || localRecovery.baseVersion === serverVersion)
    ) {
      try {
        const synced = await api<{ saved: boolean; updated_at?: string | null; version?: number | null }>('/tools/workspace', token, {
          method: 'POST',
          body: JSON.stringify({
            workspace: localRecovery.workspace,
            version: server.workspace ? serverVersion : undefined,
            updated_at: server.updated_at ?? undefined,
          }),
        });
        localStorage.setItem(
          `pizzalog_tools_recovery_${accountId}`,
          JSON.stringify({
            workspace: localRecovery.workspace,
            baseVersion: synced.version ?? serverVersion + 1,
            baseUpdatedAt: synced.updated_at ?? server.updated_at ?? null,
            pendingSync: false,
          })
        );
        return {
          workspace: localRecovery.workspace,
          updatedAt: synced.updated_at ?? server.updated_at ?? null,
          version: synced.version ?? serverVersion + 1,
        };
      } catch {
        // Si falló la resincronización inicial, continuar con los datos locales recuperados
        return {
          workspace: localRecovery.workspace,
          updatedAt: server.updated_at ?? null,
          version: serverVersion,
        };
      }
    }

    if (server.workspace) {
      return {
        workspace: normalizeWorkspace(server.workspace),
        updatedAt: server.updated_at ?? null,
        version: serverVersion,
      };
    }
  } catch (err) {
    // Si hay pérdida temporal de red pero existe backup local de la cuenta, permitir continuar sin pantalla bloqueada
    if (localRecovery) {
      return {
        workspace: localRecovery.workspace,
        updatedAt: localRecovery.baseUpdatedAt ?? null,
        version: localRecovery.baseVersion ?? 1,
      };
    }
    throw err;
  }

  const legacy = readLegacyWorkspace();
  if (!legacy) {
    return {
      workspace: { ...createInitialDemoWorkspace(), locale: fallbackLocale },
      updatedAt: null,
      version: 1,
    };
  }

  const normalizedLegacy = normalizeWorkspace(legacy);
  const saved = await api<{ saved: boolean; updated_at?: string | null; version?: number | null }>('/tools/workspace', token, {
    method: 'POST',
    body: JSON.stringify({ workspace: normalizedLegacy }),
  });
  removeLegacyWorkspace();
  return {
    workspace: normalizedLegacy,
    updatedAt: saved.updated_at ?? null,
    version: typeof saved.version === 'number' ? saved.version : 1,
  };
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
    response = await toolsFetch(path, { ...init, headers });
  } catch {
    throw new ToolsApiError('No se pudo conectar con el servidor', 0);
  }
  const payload = await parseToolsJsonResponse<ApiResponse<T>>(response);
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
  const [workspaceVersion, setWorkspaceVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');

  // Form states
  const [authLocale, setAuthLocale] = useState<LocaleCode>(() => readPreferredAuthLocale());
  const [mode, setMode] = useState<'login' | 'activate' | 'reset' | 'forgot'>('login');
  const [actionToken, setActionToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPlans, setShowPlans] = useState(false);

  const aText = AUTH_I18N[authLocale] ?? AUTH_I18N['es-AR'];
  const selectAuthLocale = (next: LocaleCode) => {
    setAuthLocale(next);
    try { localStorage.setItem(AUTH_LOCALE_KEY, next); } catch { /* ignore */ }
  };

  const renderAuthKicker = () => (
    <div className="tools-auth-kicker">
      <span>
        {aText.kicker}
        {TOOLS_ENVIRONMENT === 'staging' ? ` · ${aText.stagingBadge}` : ''}
      </span>
      <div className="auth-lang-bar" role="group" aria-label="Language">
        {(['es-AR', 'pt-BR', 'en'] as const).map((loc) => (
          <button
            key={loc}
            type="button"
            className={`auth-lang-btn ${authLocale === loc ? 'auth-lang-btn--active' : ''}`}
            onClick={() => selectAuthLocale(loc)}
          >
            {loc === 'es-AR' ? 'ES' : loc === 'pt-BR' ? 'PT' : 'EN'}
          </button>
        ))}
      </div>
    </div>
  );

  useEffect(() => {
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
        demoWs = raw ? normalizeWorkspace(JSON.parse(raw) as ToolsWorkspaceState) : { ...createInitialDemoWorkspace(), locale: authLocale };
      } catch {
        demoWs = { ...createInitialDemoWorkspace(), locale: authLocale };
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
          const restored = await restoreOrMigrateWorkspace(savedToken, me.account.id, authLocale);
          setWorkspace(restored.workspace);
          setWorkspaceUpdatedAt(restored.updatedAt);
          setWorkspaceVersion(restored.version);
          setWorkspaceError('');
        } catch (err) {
          setWorkspaceError(err instanceof Error ? err.message : aText.errLoadWorkspaceTitle);
        }
      } catch (err) {
        const status = err instanceof ToolsApiError ? err.status : 0;
        if (status === 401 || status === 403) {
          clearSessionToken();
          setError(err instanceof Error ? err.message : aText.errInvalidSession);
        } else {
          setError(err instanceof Error ? err.message : aText.errVerifySession);
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
        const restored = await restoreOrMigrateWorkspace(result.token, result.account.id, authLocale);
        setWorkspace(restored.workspace);
        setWorkspaceUpdatedAt(restored.updatedAt);
        setWorkspaceVersion(restored.version);
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : aText.errLoadWorkspaceTitle);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : aText.errLoginFailed);
    } finally {
      setLoading(false);
    }
  }

  async function handleActivateOrReset(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setError(aText.errPassMinLen);
      return;
    }
    if (password !== confirmPassword) {
      setError(aText.errPassMismatch);
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
      window.history.replaceState({}, document.title, window.location.pathname);
      writeSessionToken(result.token);
      setToken(result.token);
      setAccount(result.account);
      try {
        const restored = await restoreOrMigrateWorkspace(result.token, result.account.id, authLocale);
        setWorkspace(restored.workspace);
        setWorkspaceUpdatedAt(restored.updatedAt);
        setWorkspaceVersion(restored.version);
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : aText.errLoadWorkspaceTitle);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : aText.errGeneric);
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
      setNotice(aText.forgotSentNotice);
    } catch (err) {
      setError(err instanceof Error ? err.message : aText.errGeneric);
    } finally {
      setLoading(false);
    }
  }

  async function retryWorkspaceLoad() {
    if (!token) return;
    setLoading(true);
    setWorkspaceError('');
    try {
      const restored = await restoreOrMigrateWorkspace(token, account?.id, authLocale);
      setWorkspace(restored.workspace);
      setWorkspaceUpdatedAt(restored.updatedAt);
      setWorkspaceVersion(restored.version);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : aText.errLoadWorkspaceTitle);
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
      demoWs = raw ? normalizeWorkspace(JSON.parse(raw) as ToolsWorkspaceState) : { ...createInitialDemoWorkspace(), locale: authLocale };
    } catch {
      demoWs = { ...createInitialDemoWorkspace(), locale: authLocale };
    }
    writeSessionToken('guest-demo-token');
    setToken('guest-demo-token');
    setAccount(guestAccount);
    setWorkspace(demoWs);
    setWorkspaceUpdatedAt(null);
  }

  if (loading) {
    return <main className="tools-auth"><div className="tools-auth-card">{aText.verifyingAccess}</div></main>;
  }

  if (token && account && workspaceError) {
    return (
      <main className="tools-auth">
        <section className="tools-auth-card">
          {renderAuthKicker()}
          <h1>{aText.errLoadWorkspaceTitle}</h1>
          <p>{aText.errLoadWorkspaceDesc}</p>
          <div className="alert-banner">{workspaceError}</div>
          <button className="btn btn--primary tools-auth-submit" type="button" onClick={() => void retryWorkspaceLoad()} disabled={loading}>
            {loading ? aText.retryingBtn : aText.retryBtn}
          </button>
          <button className="btn tools-auth-submit" type="button" onClick={logout}>{aText.signOutBtn}</button>
        </section>
      </main>
    );
  }

  if (token && account && workspace) {
    return (
      <ToolsErrorBoundary
        workspace={workspace}
        locale={workspace.locale ?? authLocale}
        onResetDemo={() => setWorkspace(createInitialDemoWorkspace())}
        onLogout={logout}
      >
        <App
          token={token}
          account={account}
          initialWorkspace={workspace}
          initialUpdatedAt={workspaceUpdatedAt}
          initialVersion={workspaceVersion}
          toolsEnvironment={TOOLS_ENVIRONMENT}
          onLogout={logout}
        />
      </ToolsErrorBoundary>
    );
  }

  if (mode === 'activate' || mode === 'reset') {
    return (
      <main className="tools-auth">
        <form className="tools-auth-card" onSubmit={handleActivateOrReset}>
          {renderAuthKicker()}
          <h1>{mode === 'activate' ? aText.titleActivate : aText.titleReset}</h1>
          <p>{mode === 'activate' ? aText.leadActivate : aText.leadReset}</p>
          <label className="field">
            <span>{aText.newPassword}</span>
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
            <span>{aText.confirmPassword}</span>
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
            {loading ? aText.savingBtn : mode === 'activate' ? aText.activateBtn : aText.resetSaveBtn}
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
              {aText.backToLogin}
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
          {renderAuthKicker()}
          <h1>{aText.titleForgot}</h1>
          <p>{aText.leadForgot}</p>
          <label className="field">
            <span>{aText.emailLabel}</span>
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
            {loading ? aText.sendingBtn : aText.sendResetBtn}
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
              {aText.backToLogin}
            </button>
          </div>
        </form>
      </main>
    );
  }

  return (
    <main className="tools-auth">
      <form className="tools-auth-card" onSubmit={handleLogin}>
        {renderAuthKicker()}
        <h1>{aText.titleLogin}</h1>
        <p>{aText.leadLogin}</p>
        <label className="field">
          <span>{aText.emailOrUser}</span>
          <input type="text" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>{aText.password}</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="alert-banner">{error}</div>}
        <button className="btn btn--primary tools-auth-submit" type="submit" disabled={loading}>
          {loading ? aText.signingInBtn : aText.signInBtn}
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
            {aText.forgotLink}
          </button>
          <span style={{ color: '#b9a99a' }}>Tools v1.0</span>
        </div>
        <small style={{ marginTop: '0.75rem', display: 'block' }}>
          {aText.noAccountHint}
        </small>
        <div style={{ marginTop: '0.85rem', borderTop: '1px solid #44372e', paddingTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            className="btn btn--secondary"
            style={{ width: '100%', padding: '10px 14px', fontSize: '0.88rem', borderColor: '#d7a35a', color: '#f7d399', background: '#3a2d24', fontWeight: 600 }}
            onClick={startGuestDemo}
          >
            {aText.demoBtn}
          </button>
          <button
            type="button"
            className="link"
            style={{ color: '#d7a35a', fontWeight: 600, fontSize: '0.86rem', textAlign: 'center' }}
            onClick={() => setShowPlans(true)}
          >
            {aText.plansBtn}
          </button>
        </div>
      </form>
      {showPlans && (
        <CommercialPlansModal onClose={() => setShowPlans(false)} userEmail={email} />
      )}
    </main>
  );
}
