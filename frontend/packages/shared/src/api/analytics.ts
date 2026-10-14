import type { ApiClient } from './client';
import type {
  AnalyticsSalesPoint,
  AnalyticsSummary,
  AnalyticsTopProduct,
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
    salesOverTime: (params?: AnalyticsQuery) =>
      client.get<{ points: AnalyticsSalesPoint[] }>(`/analytics/sales-over-time${queryStr(params)}`),
    productMargins: (params?: AnalyticsQuery) =>
      client.get<{ products: any[] }>(`/analytics/product-margins${queryStr(params)}`),
    ingredients: (params?: AnalyticsQuery) =>
      client.get<{ ingredients: any[]; by_category: any[] }>(`/analytics/ingredients${queryStr(params)}`),
  };
}
