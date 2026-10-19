import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useOnline } from '@/lib/network';
import { useSync } from '@/offline/sync';
import { useCurrentCashSession } from '@/modules/cash/hooks';

export function Shell() {
  const { user, logout } = useAuth();
  const online = useOnline();
  const { pendingCount } = useSync();
  const { data: cashSession } = useCurrentCashSession();

  const isCashOpen = Boolean(cashSession && cashSession.status === 'open');

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
          <button className="shell-logout" onClick={() => void logout()}>
            {user?.name ?? 'Salir'}
          </button>
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
