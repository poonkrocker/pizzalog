import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';
import { Shell } from './Shell';
import { Login } from './Login';
import { HomePage } from '@/modules/home/HomePage';
import { SalePage } from '@/modules/sale/SalePage';
import { SalonPage } from '@/modules/salon/SalonPage';
import { SessionPage } from '@/modules/salon/SessionPage';
import { KitchenPage } from '@/modules/kitchen/KitchenPage';
import { SettingsPage } from '@/print/SettingsPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <Shell />
            </RequireAuth>
          }
        >
          <Route path="/" element={<HomePage />} />
          <Route path="/venta" element={<SalePage />} />
          <Route path="/salon" element={<SalonPage />} />
          <Route path="/salon/:id" element={<SessionPage />} />
          <Route path="/cocina" element={<KitchenPage />} />
          <Route path="/ajustes" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
