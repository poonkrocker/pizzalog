import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useOnline } from '@/lib/network';
import { useSync } from '@/offline/sync';
import { useCurrentCashSession } from '@/modules/cash/hooks';

export function Shell() {
  const { user, logout } = useAuth();
  const online = useOnline();
  const { pendingCount } = useSync();
  const { data: cashSession } = useCurrentCashSession();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isCashOpen = Boolean(cashSession && cashSession.status === 'open');

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

  return (
    <div className="shell">
      <header className="shell-top">
        <span className="shell-brand">Pizzalog</span>
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
                  minWidth: '210px',
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
                  {user?.email && (
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{user.email}</div>
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
                  <span>⚙</span> Ajustes de impresora
                </button>

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
          <span className="nav-item__icon">▦</span>
          Inicio
        </NavLink>
        <NavLink to="/caja" className="nav-item">
          <span className="nav-item__icon">💵</span>
          Turno
        </NavLink>
        <NavLink to="/venta" className="nav-item">
          <span className="nav-item__icon">＄</span>
          Venta
        </NavLink>
        <NavLink to="/salon" className="nav-item">
          <span className="nav-item__icon">▤</span>
          Salón
        </NavLink>
        <NavLink to="/cocina" className="nav-item">
          <span className="nav-item__icon">♨</span>
          Cocina
        </NavLink>
        <NavLink to="/ajustes" className="nav-item">
          <span className="nav-item__icon">⚙</span>
          Ajustes
        </NavLink>
      </nav>
    </div>
  );
}
