import type { ApiClient } from './client';
import type { Customer } from '../types';

export function customersApi(client: ApiClient) {
  return {
    list: (q?: string) =>
      client.get<{ customers: Customer[] }>(`/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    get: (id: number) => client.get<{ customer: Customer }>(`/customers/${id}`),
    create: (data: Partial<Customer>) =>
      client.post<{ customer: Customer }>('/customers', data),
    update: (id: number, data: Partial<Customer>) =>
      client.put<{ customer: Customer }>(`/customers/${id}`, data),
    remove: (id: number) => client.delete<{ deleted: boolean }>(`/customers/${id}`),
  };
}
