import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { ApiError } from '@pizzalog/shared';
import { useAuth } from '@/lib/auth';
import { clearSavedCredentials, getSavedCredentials, saveCredentials } from '@/lib/storage';

export function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getSavedCredentials().then((creds) => {
      if (creds) {
        setEmail(creds.email);
        setPassword(creds.password);
        setRemember(true);
      }
    });
  }, []);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const cleanEmail = email.trim();
      await login(cleanEmail, password);
      if (remember) {
        await saveCredentials(cleanEmail, password);
      } else {
        await clearSavedCredentials();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="brand-stripe" aria-hidden="true">
          <span /><span /><span /><span /><span /><span />
        </div>
        <h1 className="login-title">
          Pizzalog <span>TPV</span>
        </h1>
        <form onSubmit={onSubmit}>
          <label className="t-field">
            <span>Email</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label className="t-field">
            <span>Contraseña</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '16px',
              fontSize: '14px',
              color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{ width: '20px', height: '20px', accentColor: 'var(--red)' }}
            />
            <span>Guardar usuario y contraseña</span>
          </label>
          {error && (
            <p className="t-error" role="alert">
              {error}
            </p>
          )}
          <button className="t-btn t-btn--primary t-btn--block" type="submit" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
