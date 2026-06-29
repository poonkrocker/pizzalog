import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Supplier } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';

export function useSuppliers(activeOnly = false) {
  const api = useApi();
  return useQuery({
    queryKey: ['suppliers', activeOnly],
    queryFn: () => api.suppliers.list(activeOnly).then((r) => r.suppliers),
  });
}

export function useSaveSupplier() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: number; data: Partial<Supplier> }) =>
      input.id ? api.suppliers.update(input.id, input.data) : api.suppliers.create(input.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useDeleteSupplier() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.suppliers.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}
