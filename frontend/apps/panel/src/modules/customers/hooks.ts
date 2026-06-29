import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Customer } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';

export function useCustomers(q: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['customers', q],
    queryFn: () => api.customers.list(q || undefined).then((r) => r.customers),
  });
}

export function useSaveCustomer() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: number; data: Partial<Customer> }) =>
      input.id ? api.customers.update(input.id, input.data) : api.customers.create(input.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useDeleteCustomer() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.customers.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}
