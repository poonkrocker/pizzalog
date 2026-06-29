import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Table, TableArea } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';

// --- Áreas ---
export function useAreas() {
  const api = useApi();
  return useQuery({
    queryKey: ['table-areas'],
    queryFn: () => api.tables.areas().then((r) => r.areas),
  });
}

export function useSaveArea() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: number; data: Partial<TableArea> }) =>
      input.id ? api.tables.updateArea(input.id, input.data) : api.tables.createArea(input.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['table-areas'] }),
  });
}

export function useDeleteArea() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.tables.deleteArea(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['table-areas'] }),
  });
}

// --- Mesas ---
export function useTables(areaId: number | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['tables', areaId],
    queryFn: () => api.tables.listTables(areaId as number).then((r) => r.tables),
    enabled: areaId !== null,
  });
}

export function useSaveTable() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: number; data: Partial<Table> }) =>
      input.id ? api.tables.updateTable(input.id, input.data) : api.tables.createTable(input.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tables'] }),
  });
}

export function useDeleteTable() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.tables.deleteTable(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tables'] }),
  });
}

export function useSaveLayout() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tables: Table[]) =>
      api.tables.saveLayout(
        tables.map((t) => ({
          id: t.id,
          pos_x: t.pos_x,
          pos_y: t.pos_y,
          width: t.width,
          height: t.height,
          rotation: t.rotation,
        })),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tables'] }),
  });
}
