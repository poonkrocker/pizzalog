import type { ApiClient } from './client';
import type { Supply, SupplyMovement, SupplyMovementType } from '../types';

export interface MovementInput {
  type: SupplyMovementType;
  quantity: number;
  reason?: string;
}

export function suppliesApi(client: ApiClient) {
  return {
    list: (category?: string) =>
      client.get<{ supplies: Supply[] }>(`/supplies${category ? `?category=${encodeURIComponent(category)}` : ''}`),
    lowStock: () => client.get<{ supplies: Supply[] }>('/supplies/low-stock'),
    get: (id: number) => client.get<{ supply: Supply }>(`/supplies/${id}`),
    create: (data: Partial<Supply> & { initial_stock?: number }) =>
      client.post<{ supply: Supply }>('/supplies', data),
    update: (id: number, data: Partial<Supply>) =>
      client.put<{ supply: Supply }>(`/supplies/${id}`, data),
    remove: (id: number) => client.delete<{ deleted: boolean }>(`/supplies/${id}`),
    movements: (id: number) =>
      client.get<{ movements: SupplyMovement[] }>(`/supplies/${id}/movements`),
    move: (id: number, body: MovementInput) =>
      client.post<{ supply: Supply }>(`/supplies/${id}/movement`, body),
  };
}
