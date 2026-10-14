import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrdersQuery, OrderStatus } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';

export function useOrders(params: OrdersQuery) {
  const api = useApi();
  return useQuery({
    queryKey: ['orders', params],
    queryFn: () => api.orders.list(params).then((r) => r.orders),
    refetchInterval: 15000, // Refresco automático cada 15 segundos para pedidos nuevos
  });
}

export function useOrder(id: number | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => api.orders.get(id as number).then((r) => r.order),
    enabled: id !== null,
  });
}

export function useUpdateOrderStatus() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: OrderStatus }) =>
      api.orders.updateStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order'] });
    },
  });
}

export function useCompleteOrder() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, paymentMethod }: { id: number; paymentMethod?: string }) =>
      api.orders.complete(id, paymentMethod),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
    },
  });
}

export function useCancelOrder() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.orders.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order'] });
    },
  });
}

export function useAssignDriver() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, driverId }: { id: number; driverId: number | null }) =>
      api.orders.assignDriver(id, driverId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order'] });
    },
  });
}
