import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RoundStatus } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';

// Comandas activas en cocina. Se refresca solo para ver las que van entrando.
export function useKitchenRounds() {
  const api = useApi();
  return useQuery({
    queryKey: ['kitchen'],
    queryFn: () => api.kitchen.rounds(['pending', 'preparing', 'ready']).then((r) => r.rounds),
    refetchInterval: 10000,
  });
}

export function useSetRoundStatus() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { roundId: number; status: RoundStatus }) =>
      api.kitchen.setStatus(input.roundId, input.status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kitchen'] }),
  });
}
