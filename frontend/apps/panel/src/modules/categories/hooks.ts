import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Category } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';

export function useCategories() {
  const api = useApi();
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list().then((r) => r.categories),
  });
}

export function useSaveCategory() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: number; data: Partial<Category> }) =>
      input.id ? api.categories.update(input.id, input.data) : api.categories.create(input.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useDeleteCategory() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.categories.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}
