import type { ApiClient } from './client';
import type { CashMovementType, CashSession } from '../types';

export function cashApi(client: ApiClient) {
  return {
    current: () => client.get<{ session: CashSession | null }>('/cash/current'),
    open: (opening_amount: number, note?: string) =>
      client.post<{ session: CashSession }>('/cash/open', { opening_amount, note }),
    movement: (type: CashMovementType, amount: number, reason?: string) =>
      client.post<{ session: CashSession }>('/cash/movement', { type, amount, reason }),
    close: (closing_amount: number, note?: string) =>
      client.post<{ session: CashSession }>('/cash/close', { closing_amount, note }),
    list: () => client.get<{ sessions: CashSession[] }>('/cash'),
    get: (id: number) => client.get<{ session: CashSession }>(`/cash/${id}`),
  };
}
