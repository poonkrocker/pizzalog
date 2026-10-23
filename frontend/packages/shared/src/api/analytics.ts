import type { ApiClient } from './client';
import type {
  AnalyticsIngredient,
  AnalyticsSalesPoint,
  AnalyticsSummary,
  AnalyticsTopProduct,
  AnalyticsWinningCombinations,
  AnalyticsTimeHeatmapCell,
} from '../types';

export interface AnalyticsQuery {
  from?: string;
  to?: string;
  limit?: number;
}

export function analyticsApi(client: ApiClient) {
  const queryStr = (p?: AnalyticsQuery) => {
    if (!p) return '';
    const q = new URLSearchParams(
      Object.entries(p)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    return q ? `?${q}` : '';
  };

  return {
    summary: (params?: AnalyticsQuery) =>
      client.get<{ summary: AnalyticsSummary }>(`/analytics/summary${queryStr(params)}`),
    topProducts: (params?: AnalyticsQuery) =>
      client.get<{ products: AnalyticsTopProduct[] }>(`/analytics/top-products${queryStr(params)}`),
    topCategories: (params?: AnalyticsQuery) =>
      client.get<{ categories: Array<{ category_id: number; category_name: string; sales_count: number; units: number; revenue: number }> }>(`/analytics/top-categories${queryStr(params)}`),
    salesOverTime: (params?: AnalyticsQuery) =>
      client.get<{ points: AnalyticsSalesPoint[] }>(`/analytics/sales-over-time${queryStr(params)}`),
    productMargins: (params?: AnalyticsQuery) =>
      client.get<{ products: any[] }>(`/analytics/product-margins${queryStr(params)}`),
    ingredients: (params?: AnalyticsQuery) =>
      client.get<{ ingredients: AnalyticsIngredient[]; by_category: Array<{ category: string; units: number }> }>(
        `/analytics/ingredients${queryStr(params)}`,
      ),
    winningCombinations: (params?: AnalyticsQuery) =>
      client.get<AnalyticsWinningCombinations>(`/analytics/winning-combinations${queryStr(params)}`),
    timeHeatmap: (params?: AnalyticsQuery) =>
      client.get<{ cells: AnalyticsTimeHeatmapCell[] }>(`/analytics/time-heatmap${queryStr(params)}`),
  };
}
