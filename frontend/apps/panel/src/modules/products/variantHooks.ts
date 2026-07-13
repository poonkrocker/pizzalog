import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OptionInput, VariantUpdateInput } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';

export function useVariants(productId: number | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['variants', productId],
    queryFn: () => api.variants.get(productId as number),
    enabled: productId !== null,
  });
}

export function useSetOptions() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { productId: number; options: OptionInput[] }) =>
      api.variants.setOptions(input.productId, input.options),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['variants', vars.productId] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useUpdateVariants() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { productId: number; variants: VariantUpdateInput[] }) =>
      api.variants.updateVariants(input.productId, input.variants),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['variants', vars.productId] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
