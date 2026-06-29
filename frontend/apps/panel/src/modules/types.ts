import type { ReactNode } from 'react';
import type { Role } from '@pizzalog/shared';

// Contrato de un módulo del panel. El router, la navegación y los permisos se
// generan desde el registro de estos. Sumar un feature = una entrada más.
export interface ModuleDef {
  id: string;
  title: string; // etiqueta en el menú
  path: string; // ruta relativa a la raíz ('' = inicio)
  roles: Role[]; // roles que pueden verlo
  element: ReactNode; // contenido de la ruta
  nav?: boolean; // mostrar en el menú (default true)
  icon?: string;
}
