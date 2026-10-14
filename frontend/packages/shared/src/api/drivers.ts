import type { ApiClient } from './client';
import type { DeliveryDriver, DriverSettlement } from '../types';

export interface SettlementQuery {
  from?: string;
  to?: string;
  driver_id?: number;
}

export function driversApi(client: ApiClient) {
  return {
    list: (all?: boolean) =>
      client.get<{ drivers: DeliveryDriver[] }>(`/drivers${all ? '?all=1' : ''}`),
    get: (id: number) =>
      client.get<{ driver: DeliveryDriver }>(`/drivers/${id}`),
    create: (data: Partial<DeliveryDriver>) =>
      client.post<{ driver: DeliveryDriver }>('/drivers', data),
    update: (id: number, data: Partial<DeliveryDriver>) =>
      client.put<{ driver: DeliveryDriver }>(`/drivers/${id}`, data),
    delete: (id: number) =>
      client.delete<{ ok: boolean }>(`/drivers/${id}`),
    settlement: (params?: SettlementQuery) => {
      const q = params
        ? '?' +
          new URLSearchParams(
            Object.entries(params)
              .filter(([, v]) => v !== undefined && v !== '')
              .map(([k, v]) => [k, String(v)]),
          ).toString()
        : '';
      return client.get<{ settlements: DriverSettlement[]; period: { from: string; to: string } }>(
        `/drivers/settlement${q}`,
      );
    },
  };
}
