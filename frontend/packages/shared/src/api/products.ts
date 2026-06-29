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
  };
}
