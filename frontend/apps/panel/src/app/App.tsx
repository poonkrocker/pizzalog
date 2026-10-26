import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { modules } from '@/modules/registry';
import { EmployeePortalPage } from '@/modules/staff/EmployeePortalPage';
import { AppShell } from './AppShell';
import { Login } from './Login';
import { RequireAuth } from './RequireAuth';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Perfil Online Individual por Empleado (acceso web independiente sin login de admin) */}
        <Route path="/empleado/:code" element={<EmployeePortalPage />} />
        <Route path="/mi-perfil/:code" element={<EmployeePortalPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            {modules.map((m) =>
              m.path === '' ? (
                <Route key={m.id} index element={m.element} />
              ) : (
                <Route key={m.id} path={m.path} element={m.element} />
              ),
            )}
          </Route>
        </Route>
        <Route path="caja" element={<Navigate to="/ventas/caja" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
