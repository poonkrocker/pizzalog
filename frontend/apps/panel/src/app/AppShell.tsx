import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { modulesForRole } from '@/modules/registry';

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = user ? modulesForRole(user.role).filter((m) => m.nav !== false) : [];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  function onLogout() {
    setMenuOpen(false);
    logout();
    navigate('/login');
  }

  return (
    <div className="shell">
      <aside className="shell__nav">
        <div className="shell__brand">
          <span className="shell__brand-icon" aria-hidden="true">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="100" height="100" rx="21" fill="#D73828" />
              <g strokeLinecap="round" strokeLinejoin="round">
                <path
                  d="M29 17H77Q84 17 84 24V78Q84 85 77 85H34Q27 85 27 78V36"
                  fill="none"
                  stroke="#F0E6D0"
                  strokeWidth="5.5"
                />
                <path d="M29 17H77Q84 17 84 24V32H27V24Q27 17 34 17Z" fill="#F0E6D0" />
                <circle cx="36" cy="24.5" r="2.4" fill="#D73828" />
                <circle cx="44" cy="24.5" r="2.4" fill="#D73828" />
                <circle cx="52" cy="24.5" r="2.4" fill="#D73828" />
                <path d="M15 47H31M10 57H28M16 67H30" stroke="#F0E6D0" strokeWidth="4.7" />
                <path
                  d="M34 44L73 35L65 75L34 44Z"
                  fill="#F0E6D0"
                  stroke="#F0E6D0"
                  strokeWidth="2.2"
                />
                <circle cx="51" cy="48" r="3.7" fill="#D73828" />
                <circle cx="62" cy="54" r="3.4" fill="#D73828" />
                <circle cx="57" cy="65" r="3.1" fill="#D73828" />
              </g>
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
        <div className="shell__user" ref={menuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              width: '100%',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              👤 {user?.name ?? 'Usuario'}
            </span>
            <span style={{ fontSize: '11px', opacity: 0.7 }}>▾</span>
          </button>

          {menuOpen && (
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                left: 0,
                right: 0,
                minWidth: '190px',
                background: '#2c2829',
                border: '1px solid #443f40',
                borderRadius: '10px',
                padding: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
                zIndex: 100,
              }}
              className="user-dropdown"
            >
              <div
                style={{
                  padding: '6px 8px 8px',
                  borderBottom: '1px solid #443f40',
                  marginBottom: '6px',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#f0e6d0' }}>
                  {user?.name}
                </div>
                {user?.email && (
                  <div style={{ fontSize: '11px', color: '#a59f97' }}>{user.email}</div>
                )}
              </div>
              <button
                type="button"
                onClick={onLogout}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'rgba(215, 56, 40, 0.16)',
                  border: '1px solid rgba(215, 56, 40, 0.4)',
                  color: '#ffb4ab',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                🚪 Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </aside>
      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}
