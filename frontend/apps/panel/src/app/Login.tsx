import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@pizzalog/shared';
import { useAuth } from '@/lib/auth';
import { Button, Field, Input } from '@/ui/controls';

const CRED_KEY = 'pizzalog_panel_saved_credentials';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CRED_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.email === 'string' && typeof parsed.password === 'string') {
          setEmail(parsed.email);
          setPassword(parsed.password);
          setRemember(true);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const cleanEmail = email.trim();
      await login(cleanEmail, password);
      try {
        if (remember) {
          localStorage.setItem(CRED_KEY, JSON.stringify({ email: cleanEmail, password }));
        } else {
          localStorage.removeItem(CRED_KEY);
        }
      } catch {
        // ignore
      }
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={onSubmit}>
        <div className="login__brandbar" aria-hidden="true" />
        <div className="login__body">
          <p className="login__eyebrow">Panel de gestión</p>
          <h1 className="login__word">Pizzalog</h1>
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Contraseña">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <label className="checkbox" style={{ marginBottom: '12px', fontSize: '14px' }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>Guardar usuario y contraseña</span>
          </label>
          {error && (
            <p className="login__error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </Button>
        </div>
      </form>
    </div>
  );
}
