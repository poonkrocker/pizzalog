import type { ApiClient } from './client';
import type { Sale, SaleChannel, SaleDetail, SaleInput } from '../types';

export interface SalesQuery {
  from?: string;
  to?: string;
  channel?: SaleChannel;
  without_cash_session?: number;
  limit?: number;
  offset?: number;
}

export interface SalesImportInput {
  csv_text: string;
  deepseek_api_key?: string;
  use_ai?: boolean;
}

export interface SalesImportResult {
  imported_sales: number;
  imported_items: number;
  skipped_duplicates: number;
  total_amount?: number;
  ai_harmonized: boolean;
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
    create: (data: SaleInput) => client.post<{ sale: Sale }>('/sales', data),
    cancel: (id: number) => client.post<{ sale: Sale }>(`/sales/${id}/cancel`),
    importCsv: (data: SalesImportInput) =>
      client.post<SalesImportResult>('/sales/import', data),
  };
}
