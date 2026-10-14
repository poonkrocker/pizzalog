import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeliveryDriver, SettlementQuery } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';

export function useDrivers(all = false) {
  const api = useApi();
  return useQuery({
    queryKey: ['drivers', { all }],
    queryFn: () => api.drivers.list(all).then((r) => r.drivers),
  });
}

export function useDriverSettlement(query: SettlementQuery) {
  const api = useApi();
  return useQuery({
    queryKey: ['driver-settlement', query],
    queryFn: () => api.drivers.settlement(query),
  });
}

export function useCreateDriver() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<DeliveryDriver>) => api.drivers.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drivers'] });
    },
  });
}

export function useUpdateDriver() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<DeliveryDriver> }) =>
      api.drivers.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drivers'] });
      qc.invalidateQueries({ queryKey: ['driver-settlement'] });
    },
  });
}

export function useDeleteDriver() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.drivers.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drivers'] });
    },
  });
}
