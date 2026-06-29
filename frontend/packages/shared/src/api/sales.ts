import type { ApiClient } from './client';
import type { Sale, SaleChannel, SaleDetail, SaleInput } from '../types';

export interface SalesQuery {
  from?: string;
  to?: string;
  channel?: SaleChannel;
  limit?: number;
  offset?: number;
}

export function salesApi(client: ApiClient) {
  return {
    list: (params?: SalesQuery) => {
      const q = params
        ? '?' +
          new URLSearchParams(
            Object.entries(params)
              .filter(([, v]) => v !== undefined && v !== '')
              .map(([k, v]) => [k, String(v)]),
          ).toString()
        : '';
      return client.get<{ sales: Sale[] }>(`/sales${q}`);
    },
    get: (id: number) => client.get<{ sale: SaleDetail }>(`/sales/${id}`),
    // create lleva client_uuid: es idempotente, base del reenvío offline.
    create: (data: SaleInput) => client.post<{ sale: Sale }>('/sales', data),
    cancel: (id: number) => client.post<{ sale: Sale }>(`/sales/${id}/cancel`),
  };
}
