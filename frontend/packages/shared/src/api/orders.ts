import type { ApiClient } from './client';
import type { Order, OrderStatus, Sale } from '../types';

export interface OrdersQuery {
  status?: string;
  channel?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export function ordersApi(client: ApiClient) {
  return {
    list: (params?: OrdersQuery) => {
      const q = params
        ? '?' +
          new URLSearchParams(
            Object.entries(params)
              .filter(([, v]) => v !== undefined && v !== '')
              .map(([k, v]) => [k, String(v)]),
          ).toString()
        : '';
      return client.get<{ orders: Order[] }>(`/orders${q}`);
    },
    get: (id: number) => client.get<{ order: Order }>(`/orders/${id}`),
    create: (data: Partial<Order> & { items: Array<{ product_id: number; quantity: number; unit_price?: number; notes?: string }> }) =>
      client.post<{ order: Order }>('/orders', data),
    updateStatus: (id: number, status: OrderStatus) =>
      client.put<{ order: Order }>(`/orders/${id}/status`, { status }),
    assignDriver: (id: number, delivery_driver_id: number | null) =>
      client.put<{ order: Order }>(`/orders/${id}/assign-driver`, { delivery_driver_id }),
    complete: (id: number, payment_method?: string) =>
      client.post<{ order: Order; sale?: Sale }>(`/orders/${id}/complete`, { payment_method }),
    cancel: (id: number) =>
      client.post<{ order: Order }>(`/orders/${id}/cancel`),
  };
}
