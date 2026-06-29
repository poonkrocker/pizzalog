import type { ApiClient } from './client';
import type { Supplier } from '../types';

export function suppliersApi(client: ApiClient) {
  return {
    list: (activeOnly = false) =>
      client.get<{ suppliers: Supplier[] }>(`/suppliers${activeOnly ? '?active=1' : ''}`),
    get: (id: number) => client.get<{ supplier: Supplier }>(`/suppliers/${id}`),
    create: (data: Partial<Supplier>) =>
      client.post<{ supplier: Supplier }>('/suppliers', data),
    update: (id: number, data: Partial<Supplier>) =>
      client.put<{ supplier: Supplier }>(`/suppliers/${id}`, data),
    remove: (id: number) => client.delete<{ deleted: boolean }>(`/suppliers/${id}`),
  };
}
