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
  time_preset?: 'all' | 'midday' | 'night';
  start_hour?: number;
  end_hour?: number;
  hour_preset?: 'midday' | 'night' | 'all';
}

export interface ProductTrendSeries {
  product_id: number;
  name: string;
  total_units: number;
  total_revenue: number;
  data: number[];
}

export interface ProductTrendsResponse {
  granularity: 'day' | 'week';
  labels: string[];
  series: ProductTrendSeries[];
}

export interface ProductListItem {
  id: number;
  name: string;
  category_name: string;
  total_units_sold: number;
}

export function analyticsApi(client: ApiClient) {
  const queryStr = (p?: Record<string, any>) => {
    if (!p) return '';
    const q = new URLSearchParams(
      Object.entries(p)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v)]),
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
    categoryLeaders: (params?: AnalyticsQuery) =>
      client.get<{ leaders: Array<{ category_id: number; category_name: string; product_id: number | null; product_name: string; units: number; revenue: number }> }>(`/analytics/category-leaders${queryStr(params)}`),
    salesOverTime: (params?: AnalyticsQuery) =>
      client.get<{ points: AnalyticsSalesPoint[] }>(`/analytics/sales-over-time${queryStr(params)}`),
    weeklyPizzas: (params?: AnalyticsQuery) =>
      client.get<{
        weeks: Array<{
          week_start: string;
          week_end: string;
          units: number;
          revenue: number;
          tickets: number;
          products: Array<{ product_id: number | null; name: string; units: number; revenue: number; tickets: number }>;
        }>;
        products: Array<{
          product_id: number | null;
          name: string;
          units: number;
          revenue: number;
          tickets: number;
          weekly_units: Record<string, number>;
          change_pct: number | null;
        }>;
        best_week: {
          week_start: string;
          week_end: string;
          units: number;
          revenue: number;
          tickets: number;
          products: Array<{ product_id: number | null; name: string; units: number; revenue: number; tickets: number }>;
        } | null;
      }>(`/analytics/weekly-pizzas${queryStr(params)}`),
    productTrends: (params?: { from?: string; to?: string; product_ids?: number[] | string; granularity?: 'day' | 'week' }) =>
      client.get<ProductTrendsResponse>(`/analytics/product-trends${queryStr(params)}`),
    productsList: () =>
      client.get<{ products: ProductListItem[] }>('/analytics/products-list'),
    seasonalPizzas: (params?: { from?: string; to?: string }) =>
      client.get<{
        parent_product_id: number | null;
        from: string;
        to: string;
        variants: Array<{
          variant_id: number; label: string; price: number; is_active: number;
          units: number; revenue: number; tickets: number;
          first_sale: string | null; last_sale: string | null;
          verified_days: number; units_per_available_day: number | null;
          recipe_id: number | null; recipe_name: string | null;
        }>;
        recipes: Array<{ id: number; name: string; linked_product_id: number | null; yield_quantity: number; yield_unit: string; price: number }>;
      }>(`/analytics/seasonal-pizzas${queryStr(params)}`),
    linkSeasonalPizzaRecipe: (variantId: number, recipeId: number) =>
      client.put<{ success: boolean }>(`/analytics/seasonal-pizzas/${variantId}/recipe`, { recipe_id: recipeId }),
    unlinkSeasonalPizzaRecipe: (variantId: number) =>
      client.delete<{ success: boolean }>(`/analytics/seasonal-pizzas/${variantId}/recipe`),
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
    timePreferences: () =>
      client.get<{ preferences: { selected_preset: 'all' | 'midday' | 'night'; presets: Record<string, { weekdays: number[]; start_hour: number; end_hour: number }> } }>('/analytics/time-preferences'),
    saveTimePreferences: (preferences: { selected_preset: 'all' | 'midday' | 'night' }) =>
      client.put<{ preferences: { selected_preset: 'all' | 'midday' | 'night'; presets: Record<string, { weekdays: number[]; start_hour: number; end_hour: number }> } }>('/analytics/time-preferences', { preferences }),
  };
}
