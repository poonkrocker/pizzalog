import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useApi, useAuth } from '@/lib/auth';
import { useOnline } from '@/lib/network';
import { useSync } from '@/offline/sync';
import { useCurrentCashSession } from '@/modules/cash/hooks';
import { getPrinterSettings } from '@/print/printer';
import { ThemeToggle } from './ThemeToggle';
import { useTheme } from './ThemeProvider';
import {
  IconInicio,
  IconTurno,
  IconVenta,
  IconCuentas,
  IconCocina,
  IconAjustes,
} from './NavIcons';

export function Shell() {
  const { user, logout } = useAuth();
  const { resolved, toggle } = useTheme();
  const api = useApi();
  const online = useOnline();
  const { pendingCount } = useSync();
  const { data: cashSession } = useCurrentCashSession();
  const navigate = useNavigate();

  const [business, setBusiness] = useState<{ name?: string; logo_url?: string | null } | null>(() => {
    try {
      const cached = localStorage.getItem('pizzalog_cached_business');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [useDigitalKds, setUseDigitalKds] = useState(true);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isCashOpen = Boolean(cashSession && cashSession.status === 'open');

  useEffect(() => {
    void getPrinterSettings().then((s) => setUseDigitalKds(s.useDigitalKds !== false));
    // También consultar configuración del negocio si está en línea
    void api.business
      .get()
      .then((r) => {
        if (r.business) {
          setBusiness({ name: r.business.name, logo_url: r.business.logo_url });
          try {
            localStorage.setItem(
              'pizzalog_cached_business',
              JSON.stringify({ name: r.business.name, logo_url: r.business.logo_url }),
            );
          } catch {}
        }
        if (r.business.use_digital_kds !== undefined) {
          setUseDigitalKds(r.business.use_digital_kds === 1);
        }
      })
      .catch(() => {});

    function onSettingsChange(e: Event) {
      const custom = e as CustomEvent<{ useDigitalKds?: boolean }>;
      if (custom.detail && custom.detail.useDigitalKds !== undefined) {
        setUseDigitalKds(custom.detail.useDigitalKds);
      }
    }
    window.addEventListener('pizzalog:settings-changed', onSettingsChange);
    return () => window.removeEventListener('pizzalog:settings-changed', onSettingsChange);
  }, [api]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [menuOpen]);

  async function handleChangePassword() {
    if (!currentPwd || !newPwd) return;
    setPwdBusy(true);
    setPwdMsg(null);
    try {
      await api.auth.changePassword(currentPwd, newPwd);
      setPwdMsg({ text: '✓ Contraseña actualizada con éxito.', ok: true });
      setCurrentPwd('');
      setNewPwd('');
      setTimeout(() => {
        setPwdModalOpen(false);
        setPwdMsg(null);
      }, 1200);
    } catch (e) {
      setPwdMsg({
        text: e instanceof Error ? e.message : 'No se pudo cambiar la contraseña',
        ok: false,
      });
    } finally {
      setPwdBusy(false);
    }
  }

  return (
    <div className="shell">
      <header className="shell-top">
        <div className="shell-brand-wrap" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img
            src={resolved === 'light' ? '/brand/pizzalog-mark.svg' : '/brand/pizzalog-mark-cream.svg'}
            alt="Pizzalog"
            style={{ height: '32px', width: '32px', display: 'block', objectFit: 'contain' }}
          />
          {business?.logo_url && (
            <>
              <span style={{ width: '1px', height: '18px', background: 'var(--line)', opacity: 0.8 }} />
              <img
                src={business.logo_url}
                alt={business.name || 'Local'}
                style={{
                  maxHeight: '26px',
                  maxWidth: '85px',
                  objectFit: 'contain',
                  borderRadius: '4px',
                  display: 'block',
                }}
              />
            </>
          )}
        </div>
        <div className="shell-top__right">
          {pendingCount > 0 && (
            <span className="pending-pill">{pendingCount} por enviar</span>
          )}
          <NavLink
            to="/caja"
            style={{
              textDecoration: 'none',
              padding: '3px 8px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 700,
              background: isCashOpen ? 'rgba(108, 192, 112, 0.2)' : 'rgba(253, 183, 64, 0.2)',
              color: isCashOpen ? 'var(--success)' : 'var(--ocre)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {isCashOpen ? '🟢 Caja' : '🟡 Abrir Caja'}
          </NavLink>
          <span className={`net-pill${online ? '' : ' net-pill--off'}`}>
            <span className="net-dot" />
            {online ? 'En línea' : 'Sin conexión'}
          </span>

          <button
            type="button"
            onClick={toggle}
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              borderRadius: '10px',
              cursor: 'pointer',
              padding: '6px 9px',
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: '15px',
              lineHeight: 1,
            }}
            title={`Cambiar a tema ${resolved === 'dark' ? 'claro' : 'oscuro'}`}
          >
            {resolved === 'dark' ? '☀️' : '🌙'}
          </button>

          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="shell-logout"
              onClick={() => setMenuOpen((v) => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <span>{user?.name ?? 'Usuario'}</span>
              <span style={{ fontSize: '11px', opacity: 0.7 }}>▾</span>
            </button>

            {menuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  minWidth: '220px',
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: '14px',
                  padding: '8px',
                  boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
                  zIndex: 100,
                }}
              >
                <div
                  style={{
                    padding: '8px 10px',
                    borderBottom: '1px solid var(--line)',
                    marginBottom: '6px',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--cream)' }}>
                    {user?.name}
                  </div>
                  {(user?.username || user?.email) && (
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      {user.username ? `@${user.username}` : user.email}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text)',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/caja');
                  }}
                >
                  <span>💵</span> Control de Turno / Caja
                </button>

                <button
                  type="button"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text)',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/ajustes');
                  }}
                >
                  <span>⚙</span> Ajustes y Comanderas
                </button>

                <button
                  type="button"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text)',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onClick={() => {
                    setMenuOpen(false);
                    setCurrentPwd('');
                    setNewPwd('');
                    setPwdMsg(null);
                    setPwdModalOpen(true);
                  }}
                >
                  <span>🔑</span> Cambiar mi contraseña
                </button>

                <div className="theme-menu-section">
                  <ThemeToggle />
                </div>
                <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />

                <button
                  type="button"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'rgba(215, 56, 40, 0.14)',
                    border: '1px solid rgba(215, 56, 40, 0.35)',
                    color: '#f0a59b',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onClick={() => {
                    setMenuOpen(false);
                    void logout();
                  }}
                >
                  <span>🚪</span> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {!online && (
        <div className="offline-banner">
          Sin conexión — las ventas se guardan y se envían al volver.
        </div>
      )}

      <main className="shell-content">
        <Outlet />
      </main>

      <nav className="shell-nav">
        <NavLink to="/" end className="nav-item">
          <span className="nav-item__icon">
            <IconInicio />
          </span>
          Inicio
        </NavLink>
        <NavLink to="/caja" className="nav-item">
          <span className="nav-item__icon">
            <IconTurno isOpen={isCashOpen} />
          </span>
          Turno
        </NavLink>
        <NavLink to="/venta" className="nav-item">
          <span className="nav-item__icon">
            <IconVenta />
          </span>
          Venta
        </NavLink>
        <NavLink to="/salon" className="nav-item">
          <span className="nav-item__icon">
            <IconCuentas />
          </span>
          Cuentas
        </NavLink>
        {useDigitalKds && (
          <NavLink to="/cocina" className="nav-item">
            <span className="nav-item__icon">
              <IconCocina />
            </span>
            Cocina
          </NavLink>
        )}
        <NavLink to="/ajustes" className="nav-item">
          <span className="nav-item__icon">
            <IconAjustes />
          </span>
          Ajustes
        </NavLink>
      </nav>

      {pwdModalOpen && (
        <div className="overlay" onClick={() => !pwdBusy && setPwdModalOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="sheet__title">🔑 Cambiar mi contraseña</h2>
            <label className="t-field">
              <span>Contraseña actual</span>
              <input
                type="password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                autoFocus
              />
            </label>
            <label className="t-field">
              <span>Nueva contraseña (mín. 4 caracteres)</span>
              <input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
              />
            </label>
            {pwdMsg && (
              <p
                style={{
                  color: pwdMsg.ok ? 'var(--success)' : '#f0a59b',
                  fontSize: 14,
                  marginBottom: 10,
                }}
              >
                {pwdMsg.text}
              </p>
            )}
            <button
              className="t-btn t-btn--primary t-btn--block"
              disabled={pwdBusy || !currentPwd || newPwd.length < 4}
              onClick={() => void handleChangePassword()}
            >
              {pwdBusy ? 'Guardando…' : 'Guardar contraseña'}
            </button>
            <button
              className="sheet__cancel"
              disabled={pwdBusy}
              onClick={() => setPwdModalOpen(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
