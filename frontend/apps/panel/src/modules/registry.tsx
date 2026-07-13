import type { Role } from '@pizzalog/shared';
import type { ModuleDef } from './types';
import { DashboardPage } from './dashboard/DashboardPage';
import { ProductsPage } from './products/ProductsPage';
import { CategoriesPage } from './categories/CategoriesPage';
import { SalesPage } from './sales/SalesPage';
import { SalonPage } from './salon/SalonPage';
import { SuppliesPage } from './supplies/SuppliesPage';
import { SuppliersPage } from './suppliers/SuppliersPage';
import { CustomersPage } from './customers/CustomersPage';
import { BusinessPage } from './business/BusinessPage';

// Registro central de módulos del panel.
// Para sumar uno: crear su carpeta en modules/, importar su página y agregar
// una entrada acá. Aparece solo en el menú y el router, para los roles dados.
export const modules: ModuleDef[] = [
  {
    id: 'dashboard',
    title: 'Resumen',
    path: '',
    roles: ['admin', 'manager'],
    element: <DashboardPage />,
    icon: '\u25E7',
  },
  {
    id: 'products',
    title: 'Productos',
    path: 'productos',
    roles: ['admin', 'manager'],
    element: <ProductsPage />,
    icon: '\u25C9',
  },
  {
    id: 'sales',
    title: 'Ventas',
    path: 'ventas',
    roles: ['admin', 'manager'],
    element: <SalesPage />,
    icon: '\u25B0',
  },
  {
    id: 'salon',
    title: 'Sal\u00f3n',
    path: 'salon',
    roles: ['admin', 'manager'],
    element: <SalonPage />,
    icon: '\u25A6',
  },
  {
    id: 'supplies',
    title: 'Insumos',
    path: 'insumos',
    roles: ['admin', 'manager'],
    element: <SuppliesPage />,
    icon: '\u25A4',
  },
  {
    id: 'suppliers',
    title: 'Proveedores',
    path: 'proveedores',
    roles: ['admin', 'manager'],
    element: <SuppliersPage />,
    icon: '\u25A3',
  },
  {
    id: 'customers',
    title: 'Clientes',
    path: 'clientes',
    roles: ['admin', 'manager'],
    element: <CustomersPage />,
    icon: '\u25CB',
  },
  {
    id: 'business',
    title: 'Mi local',
    path: 'mi-local',
    roles: ['admin'],
    element: <BusinessPage />,
    icon: '\u2302',
  },
  {
    id: 'categories',
    title: 'Categor\u00edas',
    path: 'categorias',
    roles: ['admin', 'manager'],
    element: <CategoriesPage />,
    icon: '\u25D1',
  },
];

export function modulesForRole(role: Role): ModuleDef[] {
  return modules.filter((m) => m.roles.includes(role));
}
