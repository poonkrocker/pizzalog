import { useQuery } from '@tanstack/react-query';
import type { AnalyticsQuery } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';

export function useAnalyticsSummary(params: AnalyticsQuery) {
  const api = useApi();
  return useQuery({
    queryKey: ['analytics', 'summary', params],
    queryFn: () => api.analytics.summary(params).then((r) => r.summary),
  });
}

export function useTopProducts(params: AnalyticsQuery) {
  const api = useApi();
  return useQuery({
    queryKey: ['analytics', 'top-products', params],
    queryFn: () => api.analytics.topProducts(params).then((r) => r.products),
  });
}

export function useSalesOverTime(params: AnalyticsQuery) {
  const api = useApi();
  return useQuery({
    queryKey: ['analytics', 'sales-over-time', params],
    queryFn: () => api.analytics.salesOverTime(params).then((r) => r.points),
  });
}

export function useAnalyticsIngredients(params: AnalyticsQuery) {
  const api = useApi();
  return useQuery({
    queryKey: ['analytics', 'ingredients', params],
    queryFn: () => api.analytics.ingredients(params),
  });
}

export function useWinningCombinations(params: AnalyticsQuery) {
  const api = useApi();
  return useQuery({
    queryKey: ['analytics', 'winning-combinations', params],
    queryFn: () => api.analytics.winningCombinations(params),
  });
}

