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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export function useQuickUpdateProduct() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: number;
      data: { name?: string; price?: number; category_id?: number | null };
    }) => api.products.quickUpdate(input.id, input.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export function useBulkPriceUpdate() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { categoryId: number | 'all' | 'none' | null; delta: number }) =>
      api.products.bulkPrice(input.categoryId, input.delta),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useDeleteProduct() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.products.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export function useToggleAvailability() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; isAvailable: boolean }) =>
      api.products.setAvailability(input.id, input.isAvailable),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}
