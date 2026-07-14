import type { ApiClient } from './client';
import type { Product } from '../types';

export function productsApi(client: ApiClient) {
  return {
    list: () => client.get<{ products: Product[] }>('/products'),
    get: (id: number) => client.get<{ product: Product }>(`/products/${id}`),
    create: (data: Partial<Product>) =>
      client.post<{ product: Product }>('/products', data),
    update: (id: number, data: Partial<Product>) =>
      client.put<{ product: Product }>(`/products/${id}`, data),
    remove: (id: number) => client.delete<{ deleted: boolean }>(`/products/${id}`),
    /**
     * Reordena una categoría entera. Mandá TODOS los product_ids de esa
     * categoría en el orden final: el server valida todo o nada.
     */
    reorder: (categoryId: number | null, productIds: number[]) =>
      client.put<{ reordered: number }>('/products/reorder', {
        category_id: categoryId,
        product_ids: productIds,
      }),
  };
}
