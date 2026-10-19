import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DoughCalculateParams,
  DoughProfileInput,
  SaveRecipeInput,
  SimulateParams,
} from '@pizzalog/shared';
import { useApi } from '@/lib/auth';

export function useDoughProfiles() {
  const api = useApi();
  return useQuery({
    queryKey: ['production', 'dough-profiles'],
    queryFn: () => api.production.doughProfiles().then((r) => r.profiles),
  });
}

export function useCreateDoughProfile() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DoughProfileInput) => api.production.createDoughProfile(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production', 'dough-profiles'] });
    },
  });
}

export function useUpdateDoughProfile() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: DoughProfileInput }) =>
      api.production.updateDoughProfile(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production', 'dough-profiles'] });
    },
  });
}

export function useDeleteDoughProfile() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.production.deleteDoughProfile(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production', 'dough-profiles'] });
    },
  });
}

export function useCostMargins() {
  const api = useApi();
  return useQuery({
    queryKey: ['production', 'cost-margins'],
    queryFn: () => api.production.costMargins(),
  });
}

export function useSaveRecipe() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveRecipeInput) => api.production.saveRecipe(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production', 'cost-margins'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
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
