import type { Role, User } from '@pizzalog/shared';
import type { ModuleDef } from './types';
import { DashboardPage } from './dashboard/DashboardPage';
import { AnalyticsDetailsPage } from './dashboard/AnalyticsDetailsPage';
import { OrdersPage } from './orders/OrdersPage';
import { DriversPage } from './drivers/DriversPage';
import { ProductsPage } from './products/ProductsPage';
import { CategoriesPage } from './categories/CategoriesPage';
import { SalesPage } from './sales/SalesPage';
import { ItemsReportPage } from './sales-reports/ItemsReportPage';
import { CategoriesReportPage } from './sales-reports/CategoriesReportPage';
import { EmployeesReportPage } from './sales-reports/EmployeesReportPage';
import { PaymentsReportPage } from './sales-reports/PaymentsReportPage';
import { DiscountsReportPage } from './sales-reports/DiscountsReportPage';
import { TaxesReportPage } from './sales-reports/TaxesReportPage';

import { CashPage } from './cash/CashPage';
import { SalonPage } from './salon/SalonPage';
import { SuppliesPage } from './supplies/SuppliesPage';
import { SuppliersPage } from './suppliers/SuppliersPage';
import { CustomersPage } from './customers/CustomersPage';
import { BusinessPage } from './business/BusinessPage';
import { ProductionPage } from './production/ProductionPage';
import { StaffPage } from './staff/StaffPage';

// Registro central de módulos del panel.
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
    id: 'analytics-details',
    title: 'Detalles',
    path: 'detalles',
    roles: ['admin', 'manager'],
    element: <AnalyticsDetailsPage />,
    icon: '📊',
  },
  {
    id: 'orders',
    title: 'Pedidos',
    path: 'pedidos',
    roles: ['admin', 'manager'],
    element: <OrdersPage />,
    icon: '\u25C8',
  },
  {
    id: 'drivers',
    title: 'Cadetes',
    path: 'cadetes',
    roles: ['admin', 'manager'],
    element: <DriversPage />,
    icon: '🛵',
  },
  {
    id: 'staff',
    title: 'Personal & Sueldos',
    path: 'personal',
    roles: ['admin', 'manager'],
    element: <StaffPage />,
    icon: '👥',
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
    id: 'production',
    title: 'Calculadora & Costos',
    path: 'calculadora',
    roles: ['admin', 'manager'],
    element: <ProductionPage />,
    icon: '🥣',
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
    id: 'sales-items',
    title: 'Ventas por artículo',
    path: 'ventas/articulos',
    roles: ['admin', 'manager'],
    element: <ItemsReportPage />,
    nav: false,
  },
  {
    id: 'sales-categories',
    title: 'Ventas por categoría',
    path: 'ventas/categorias',
    roles: ['admin', 'manager'],
    element: <CategoriesReportPage />,
    nav: false,
  },
  {
    id: 'sales-employees',
    title: 'Ventas por empleado',
    path: 'ventas/empleados',
    roles: ['admin', 'manager'],
    element: <EmployeesReportPage />,
    nav: false,
  },
  {
    id: 'sales-payments',
    title: 'Ventas por tipo de pago',
    path: 'ventas/pagos',
    roles: ['admin', 'manager'],
    element: <PaymentsReportPage />,
    nav: false,
  },
  {
    id: 'sales-discounts',
    title: 'Descuentos',
    path: 'ventas/descuentos',
    roles: ['admin', 'manager'],
    element: <DiscountsReportPage />,
    nav: false,
  },
  {
    id: 'sales-taxes',
    title: 'Impuestos',
    path: 'ventas/impuestos',
    roles: ['admin', 'manager'],
    element: <TaxesReportPage />,
    nav: false,
  },
  {
    id: 'sales-cash',
    title: 'Caja',
    path: 'ventas/caja',
    roles: ['admin', 'manager'],
    element: <CashPage />,
    nav: false,
  },
  {
    id: 'cash',
    title: 'Caja',
    path: 'caja',
    roles: ['admin', 'manager'],
    element: <CashPage />,
    nav: false,
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

export function modulesForUser(user: User): ModuleDef[] {
  if (user.role === 'admin') {
    return modules;
  }
  if (Array.isArray(user.allowed_modules)) {
    return modules.filter((m) => user.allowed_modules!.includes(m.id));
  }
  return modules.filter((m) => m.roles.includes(user.role));
}
