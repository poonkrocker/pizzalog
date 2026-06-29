import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SalesQuery } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';

export function useSales(params: SalesQuery) {
  const api = useApi();
  return useQuery({
    queryKey: ['sales', params],
    queryFn: () => api.sales.list(params).then((r) => r.sales),
  });
}

export function useSale(id: number | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['sale', id],
    queryFn: () => api.sales.get(id as number).then((r) => r.sale),
    enabled: id !== null,
  });
}

export function useCancelSale() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.sales.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales'] }),
  });
}
