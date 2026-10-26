import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '@pizzalog/shared';
import { useApi, useAuth } from '@/lib/auth';
import { modulesForUser } from '@/modules/registry';
import { Button, Field, Input, Modal } from '@/ui';

export function AppShell() {
  const { user, logout } = useAuth();
  const api = useApi();
  const navigate = useNavigate();
  const location = useLocation();
  const items = user ? modulesForUser(user).filter((m) => m.nav !== false) : [];
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Si el usuario entra a "/" pero no tiene permiso a Resumen (dashboard), redirigir a su primer módulo habilitado
  useEffect(() => {
    if (!user) return;
    if (location.pathname === '/' && !items.some((m) => m.path === '')) {
      const first = items[0];
      if (first) {
        navigate(`/${first.path}`, { replace: true });
      } else if (user.staff_person_code || user.staff_code) {
        navigate(`/empleado/${user.staff_person_code ?? user.staff_code}`, { replace: true });
      }
    }
  }, [user, items, location.pathname, navigate]);

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

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd.trim().length < 4) {
      setPwdMsg({ ok: false, text: 'La nueva contraseña debe tener al menos 4 caracteres.' });
      return;
    }
    setPwdBusy(true);
    setPwdMsg(null);
    try {
      await api.auth.changePassword(curPwd, newPwd.trim());
      setPwdMsg({ ok: true, text: 'Contraseña actualizada correctamente.' });
      setCurPwd('');
      setNewPwd('');
    } catch (err) {
      setPwdMsg({
        ok: false,
        text: err instanceof ApiError ? err.message : 'No se pudo cambiar la contraseña.',
      });
    } finally {
      setPwdBusy(false);
    }
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
          {items.map((m) => {
            if (m.id === 'sales') {
              const inSales = location.pathname.startsWith('/ventas') || location.pathname === '/caja';
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  <NavLink
                    to={`/${m.path}`}
                    end
                    className={({ isActive }) => `navitem${isActive || inSales ? ' navitem--active' : ''}`}
                    style={{ justifyContent: 'space-between' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="navitem__icon" aria-hidden="true">
                        {m.icon}
                      </span>
                      <span className="navitem__label">{m.title}</span>
                    </div>
                    <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>
                      {inSales ? '▼' : '▶'}
                    </span>
                  </NavLink>
                  {inSales && (
                    <div style={{ paddingLeft: '1.75rem', display: 'flex', flexDirection: 'column', gap: 2, margin: '2px 0 6px' }}>
                      <NavLink to="/ventas" end className={({ isActive }) => `navitem-sub${isActive ? ' navitem-sub--active' : ''}`}>
                        Resumen de ventas
                      </NavLink>
                      <NavLink to="/ventas/articulos" className={({ isActive }) => `navitem-sub${isActive ? ' navitem-sub--active' : ''}`}>
                        Por artículo
                      </NavLink>
                      <NavLink to="/ventas/categorias" className={({ isActive }) => `navitem-sub${isActive ? ' navitem-sub--active' : ''}`}>
                        Por categoría
                      </NavLink>
                      <NavLink to="/ventas/empleados" className={({ isActive }) => `navitem-sub${isActive ? ' navitem-sub--active' : ''}`}>
                        Por empleado
                      </NavLink>
                      <NavLink to="/ventas/pagos" className={({ isActive }) => `navitem-sub${isActive ? ' navitem-sub--active' : ''}`}>
                        Por tipo de pago
                      </NavLink>
                      <NavLink to="/ventas/descuentos" className={({ isActive }) => `navitem-sub${isActive ? ' navitem-sub--active' : ''}`}>
                        Descuentos
                      </NavLink>
                      <NavLink to="/ventas/impuestos" className={({ isActive }) => `navitem-sub${isActive ? ' navitem-sub--active' : ''}`}>
                        Impuestos
                      </NavLink>
                      <NavLink to="/ventas/caja" className={({ isActive }) => `navitem-sub${isActive ? ' navitem-sub--active' : ''}`}>
                        Caja
                      </NavLink>
                    </div>
                  )}
                </div>
              );
            }

            return (
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
            );
          })}
          {user?.staff_person_code && (
            <NavLink
              to={`/empleado/${user.staff_person_code}`}
              className={({ isActive }) => `navitem${isActive ? ' navitem--active' : ''}`}
            >
              <span className="navitem__icon" aria-hidden="true">
                🪪
              </span>
              <span className="navitem__label">Mi Perfil Personal</span>
            </NavLink>
          )}
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
                {(user?.username || user?.email) && (
                  <div style={{ fontSize: '11px', color: '#a59f97' }}>
                    {user.username ? `@${user.username}` : user.email}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setPwdMsg(null);
                  setCurPwd('');
                  setNewPwd('');
                  setPwdOpen(true);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid #443f40',
                  color: '#f0e6d0',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginBottom: '6px',
                }}
              >
                🔑 Cambiar contraseña
              </button>
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

      <Modal open={pwdOpen} title="🔑 Cambiar mi contraseña" onClose={() => !pwdBusy && setPwdOpen(false)}>
          <form onSubmit={handleChangePassword} className="stack">
            <Field label="Contraseña actual">
              <Input
                type="password"
                value={curPwd}
                onChange={(e) => setCurPwd(e.target.value)}
                required
              />
            </Field>
            <Field label="Nueva contraseña (mínimo 4 caracteres)">
              <Input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                required
              />
            </Field>
            {pwdMsg && (
              <p
                style={{
                  margin: 0,
                  fontSize: '13px',
                  color: pwdMsg.ok ? '#86efac' : '#fca5a5',
                  fontWeight: 600,
                }}
              >
                {pwdMsg.text}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <Button variant="ghost" type="button" onClick={() => setPwdOpen(false)}>
                Cerrar
              </Button>
              <Button type="submit" disabled={pwdBusy}>
                {pwdBusy ? 'Guardando…' : 'Guardar contraseña'}
              </Button>
            </div>
          </form>
        </Modal>
    </div>
  );
}
