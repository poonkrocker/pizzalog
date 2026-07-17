import type { ApiClient } from './client';
import type { Combo } from '../types';

export interface ComboGroupInput {
  name: string;
  select_count: number;
  item_product_ids: number[];
}

export function combosApi(client: ApiClient) {
  return {
    get: (productId: number) => client.get<Combo>(`/products/${productId}/combo`),
    /** Reemplaza TODOS los grupos. groups: [] = deja de ser combo. */
    update: (productId: number, groups: ComboGroupInput[]) =>
      client.put<Combo>(`/products/${productId}/combo`, { groups }),
  };
}
