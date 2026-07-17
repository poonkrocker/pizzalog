import { ApiClient, type ApiClientConfig } from './client';
import { authApi } from './auth';
import { categoriesApi } from './categories';
import { customersApi } from './customers';
import { productsApi } from './products';
import { salesApi } from './sales';
import { suppliersApi } from './suppliers';
import { suppliesApi } from './supplies';
import { variantsApi } from './variants';
import { businessApi } from './business';
import { combosApi } from './combos';
import { uploadsApi } from './uploads';
import { tablesApi } from './tables';
import { kitchenApi } from './kitchen';

// Crea la fachada de la API. Cada dominio es un módulo independiente: sumar
// uno nuevo (cash, inventory, fiscal...) es agregar su archivo y una línea
// acá, espejando el backend.
export function createApi(config: ApiClientConfig) {
  const client = new ApiClient(config);
  return {
    client,
    auth: authApi(client),
    categories: categoriesApi(client),
    products: productsApi(client),
    variants: variantsApi(client),
    combos: combosApi(client),
    business: businessApi(client),
    uploads: uploadsApi(client),
    sales: salesApi(client),
    suppliers: suppliersApi(client),
    supplies: suppliesApi(client),
    customers: customersApi(client),
    tables: tablesApi(client),
    kitchen: kitchenApi(client),
  };
}

export type Api = ReturnType<typeof createApi>;

export { ApiClient, ApiError } from './client';
export type { ApiClientConfig } from './client';
export type { RoundItemInput, CloseSplit } from './tables';
export type { SalesQuery } from './sales';
export type { MovementInput } from './supplies';
export type { OptionInput, VariantUpdateInput } from './variants';
export type { BusinessUpdateInput, BusinessHoursResponse } from './business';
export type { ComboGroupInput } from './combos';
