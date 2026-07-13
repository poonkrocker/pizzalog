import { useQuery } from '@tanstack/react-query';
import {
  ApiError,
  type Category,
  type Product,
  type ProductVariant,
  type SaleInput,
} from '@pizzalog/shared';
import { useApi } from '@/lib/auth';
import { useOnline } from '@/lib/network';
import { useSync } from '@/offline/sync';
import { cacheCatalog, readCachedCatalog } from '@/offline/catalog';

export interface CartLine {
  key: string; // identifica la línea (producto, o producto+variante, o precio abierto)
  product: Product;
  variant?: ProductVariant;
  quantity: number;
  unitPrice: number;
  label: string;
}

// Trae el catálogo: con red lo baja del backend y lo cachea; sin red (o si la
// bajada falla) lo lee del caché local.
export function useCatalog() {
  const api = useApi();
  const online = useOnline();
  return useQuery({
    queryKey: ['catalog', online],
    queryFn: async (): Promise<{ products: Product[]; categories: Category[] }> => {
      if (online) {
        try {
          const [p, c] = await Promise.all([api.products.list(), api.categories.list()]);
          const products = p.products.filter((x) => x.is_active === 1);
          await cacheCatalog(products, c.categories);
          return { products, categories: c.categories };
        } catch {
          return readCachedCatalog();
        }
      }
      return readCachedCatalog();
    },
  });
}

// Cobra una venta: si hay red la manda al backend; si está sin conexión (o el
// envío falla por red) la encola. Cualquier otro error (validación) se propaga.
export function useCheckout() {
  const api = useApi();
  const online = useOnline();
  const { enqueueSale } = useSync();

  return async function checkout(input: SaleInput): Promise<'online' | 'queued'> {
    if (online) {
      try {
        await api.sales.create(input);
        return 'online';
      } catch (err) {
        if (err instanceof ApiError && err.isOffline) {
          await enqueueSale(input);
          return 'queued';
        }
        throw err;
      }
    }
    await enqueueSale(input);
    return 'queued';
  };
}
