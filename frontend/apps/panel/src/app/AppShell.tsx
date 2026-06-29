import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { modulesForRole } from '@/modules/registry';

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = user ? modulesForRole(user.role).filter((m) => m.nav !== false) : [];

  function onLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="shell">
      <aside className="shell__nav">
        <div className="shell__brand">Pizzalog</div>
        <nav className="shell__menu">
          {items.map((m) => (
            <NavLink
              key={m.id}
              to={`/${m.path}`}
              end
              className={({ isActive }) => `navitem${isActive ? ' navitem--active' : ''}`}
            >
              <span className="navitem__icon" aria-hidden="true">
                {m.icon}
              </span>
              {m.title}
            </NavLink>
          ))}
        </nav>
        <div className="shell__user">
          <span className="shell__username">{user?.name}</span>
          <button className="btn btn--ghost" onClick={onLogout}>
            Salir
          </button>
        </div>
      </aside>
      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}
