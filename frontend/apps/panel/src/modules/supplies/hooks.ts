import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MovementInput, Supply } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';

export function useSupplies() {
  const api = useApi();
  return useQuery({
    queryKey: ['supplies'],
    queryFn: () => api.supplies.list().then((r) => r.supplies),
  });
}

export function useSaveSupply() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: number; data: Partial<Supply> & { initial_stock?: number } }) =>
      input.id ? api.supplies.update(input.id, input.data) : api.supplies.create(input.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplies'] }),
  });
}

export function useDeleteSupply() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.supplies.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplies'] }),
  });
}

export function useMoveSupply() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; body: MovementInput }) =>
      api.supplies.move(input.id, input.body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['supplies'] });
      qc.invalidateQueries({ queryKey: ['supply-movements', vars.id] });
    },
  });
}

export function useSupplyMovements(id: number | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['supply-movements', id],
    queryFn: () => api.supplies.movements(id as number).then((r) => r.movements),
    enabled: id !== null,
  });
}
