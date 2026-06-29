import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Product } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';

export function useProducts() {
  const api = useApi();
  return useQuery({
    queryKey: ['products'],
    queryFn: () => api.products.list().then((r) => r.products),
  });
}

export function useSaveProduct() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: number; data: Partial<Product> }) =>
      input.id ? api.products.update(input.id, input.data) : api.products.create(input.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useDeleteProduct() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.products.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}
