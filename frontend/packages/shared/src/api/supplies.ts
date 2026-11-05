import type { ApiClient } from './client';
import type { Supply, SupplyMovement, SupplyMovementType } from '../types';

export interface MovementInput {
  type: SupplyMovementType;
  quantity: number;
  reason?: string;
}

export interface PriceListAlias {
  alias_key: string;
  raw_name: string | null;
  target_id: string;
  pack_quantity: number | null;
  pack_unit: string | null;
}

export interface PriceListApplyItem {
  supply_id: number;
  new_cost: number;
  alias_key?: string;
  raw_name?: string;
  raw_price?: number;
  pack_quantity?: number | null;
  pack_unit?: string | null;
  remember?: boolean;
}

export interface PriceListApplyResult {
  batch_id: string;
  updated: Array<{ supply_id: number; old_cost: number | null; new_cost: number }>;
  unchanged: number;
  skipped: Array<{ index: number; supply_id?: number; reason: string }>;
  aliases_saved: number;
}

export interface SupplyPriceHistoryEntry {
  id: number;
  old_cost: number | null;
  new_cost: number | null;
  unit: string | null;
  source: 'manual' | 'price_list' | 'revert' | string;
  source_name: string | null;
  raw_name: string | null;
  raw_price: number | null;
  batch_id: string | null;
  created_at: string;
  supplier_name: string | null;
  user_name: string | null;
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
    priceHistory: (id: number) =>
      client.get<{ history: SupplyPriceHistoryEntry[] }>(`/supplies/${id}/price-history`),
    priceListAliases: (supplierId?: number | null) =>
      client.get<{ aliases: PriceListAlias[] }>(`/supplies/price-lists/aliases${supplierId ? `?supplier_id=${supplierId}` : ''}`),
    applyPriceList: (body: { supplier_id?: number | null; source_name?: string; items: PriceListApplyItem[] }) =>
      client.post<PriceListApplyResult>('/supplies/price-lists/apply', body),
    revertPriceList: (batchId: string) =>
      client.post<{ reverted: number; conflicts: number[] }>(`/supplies/price-lists/${encodeURIComponent(batchId)}/revert`, {}),
  };
}
