import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DoughCalculateParams, SimulateParams } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';

export function useDoughProfiles() {
  const api = useApi();
  return useQuery({
    queryKey: ['production', 'dough-profiles'],
    queryFn: () => api.production.doughProfiles().then((r) => r.profiles),
  });
}

export function useCostMargins() {
  const api = useApi();
  return useQuery({
    queryKey: ['production', 'cost-margins'],
    queryFn: () => api.production.costMargins(),
  });
}

export function useDoughCalculate() {
  const api = useApi();
  return useMutation({
    mutationFn: (params: DoughCalculateParams) => api.production.doughCalculate(params),
  });
}

export function useSimulate() {
  const api = useApi();
  return useMutation({
    mutationFn: (params: SimulateParams) => api.production.simulate(params),
  });
}
