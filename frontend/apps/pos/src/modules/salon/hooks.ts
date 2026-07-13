import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RoundItemInput } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';

// Plano en vivo: se refresca solo para reflejar mesas que se ocupan o liberan.
export function useFloor() {
  const api = useApi();
  return useQuery({
    queryKey: ['floor'],
    queryFn: () => api.tables.floor().then((r) => r.areas),
    refetchInterval: 15000,
  });
}

export function useSession(id: number | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['session', id],
    queryFn: () => api.tables.session(id as number).then((r) => r.session),
    enabled: id !== null,
    refetchInterval: 10000,
  });
}

export function useOpenSession() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { tableIds: number[]; label?: string; partySize?: number }) =>
      api.tables.openSession(input.tableIds, {
        label: input.label,
        party_size: input.partySize,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['floor'] });
      qc.invalidateQueries({ queryKey: ['open-sessions'] });
    },
  });
}

// Cuentas abiertas (para listar las de cada barra).
export function useOpenSessions() {
  const api = useApi();
  return useQuery({
    queryKey: ['open-sessions'],
    queryFn: () => api.tables.openSessions().then((r) => r.sessions),
    refetchInterval: 15000,
  });
}

export function useAddRound() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { sessionId: number; items: RoundItemInput[]; note?: string }) =>
      api.tables.addRound(input.sessionId, input.items, input.note),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['session', vars.sessionId] }),
  });
}

export function useRequestBill() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) => api.tables.requestBill(sessionId),
    onSuccess: (_d, sessionId) => {
      qc.invalidateQueries({ queryKey: ['session', sessionId] });
      qc.invalidateQueries({ queryKey: ['floor'] });
    },
  });
}

export function useCloseSession() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { sessionId: number; payment_method: string }) =>
      api.tables.close(input.sessionId, { payment_method: input.payment_method }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['floor'] }),
  });
}

export function useCancelSession() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) => api.tables.cancel(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['floor'] }),
  });
}
