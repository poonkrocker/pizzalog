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
          sale_days?: number; span_days?: number; units_per_sale_day?: number | null;
          midday_units?: number; night_units?: number;
          local_units?: number; delivery_units?: number;
          first_sale: string | null; last_sale: string | null;
          verified_days: number; units_per_available_day: number | null;
          recipe_id: number | null; recipe_name: string | null;
        }>;
        recipes: Array<{ id: number; name: string; linked_product_id: number | null; yield_quantity: number; yield_unit: string; price: number }>;
      }>(`/analytics/seasonal-pizzas${queryStr(params)}`),
    linkSeasonalPizzaRecipe: (
      variantId: number,
      recipeOrPayload: number | {
        recipe_id?: number;
        name?: string;
        yield_quantity?: number;
        yield_unit?: string;
        price?: number;
        target_food_cost_pct?: number;
        components: Array<{ component_type: 'supply' | 'recipe'; component_id: number; quantity: number; unit: string }>;
      },
    ) =>
      client.put<{ success: boolean; variant_id: number; recipe_id: number }>(
        `/analytics/seasonal-pizzas/${variantId}/recipe`,
        typeof recipeOrPayload === 'number' ? { recipe_id: recipeOrPayload } : recipeOrPayload,
      ),
    unlinkSeasonalPizzaRecipe: (variantId: number) =>
      client.delete<{ success: boolean }>(`/analytics/seasonal-pizzas/${variantId}/recipe`),
    addSeasonalPizzaAvailability: (variantId: number, startDate: string, endDate: string) =>
      client.post<{ success: boolean }>(`/analytics/seasonal-pizzas/${variantId}/availability`, { start_date: startDate, end_date: endDate }),
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
