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
        <div className="shell__brand">
          <span className="shell__brand-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="5" y="4.5" width="38" height="39" rx="5" stroke="#F0E6D0" strokeWidth="2.5" />
              <path d="M5 15.5H43" stroke="#F0E6D0" strokeWidth="2.5" />
              <circle cx="11" cy="10" r="1.5" fill="#D73828" />
              <circle cx="17" cy="10" r="1.5" fill="#D73828" />
              <circle cx="23" cy="10" r="1.5" fill="#D73828" />
              <path d="M10 27.5L36.5 17.5L34 37.5L10 27.5Z" fill="#D73828" stroke="#F0E6D0" strokeWidth="1.8" strokeLinejoin="round" />
              <circle cx="24" cy="25" r="2.3" fill="#F0E6D0" />
              <circle cx="30.5" cy="31" r="2.1" fill="#F0E6D0" />
              <path d="M2 31H8M1 36H6" stroke="#D73828" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </span>
          <span className="shell__brand-text">Pizzalog</span>
        </div>
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
              <span className="navitem__label">{m.title}</span>
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
