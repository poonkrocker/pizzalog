import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { modules } from '@/modules/registry';
import { AppShell } from './AppShell';
import { Login } from './Login';
import { RequireAuth } from './RequireAuth';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
