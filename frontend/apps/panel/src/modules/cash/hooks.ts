import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CashMovementType } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';

export function useCurrentCashSession() {
  const api = useApi();
  return useQuery({
    queryKey: ['cash', 'current'],
    queryFn: () => api.cash.current().then((r) => r.session),
    refetchInterval: 10000, // Refresco cada 10s para actualizar ventas en vivo
  });
}

export function useCashSessions() {
  const api = useApi();
  return useQuery({
    queryKey: ['cash', 'list'],
    queryFn: () => api.cash.list().then((r) => r.sessions),
  });
}

export function useOpenCashSession() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ openingAmount, note }: { openingAmount: number; note?: string }) =>
      api.cash.open(openingAmount, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash'] });
    },
  });
}

export function useCashMovement() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, amount, reason }: { type: CashMovementType; amount: number; reason?: string }) =>
      api.cash.movement(type, amount, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash'] });
    },
  });
}

export function useCloseCashSession() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ closingAmount, note }: { closingAmount: number; note?: string }) =>
      api.cash.close(closingAmount, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash'] });
    },
  });
}
