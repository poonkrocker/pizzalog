import type { ApiClient } from './client';
import type { FloorArea, Round, Table, TableArea, TableSession } from '../types';

export interface RoundItemInput {
  product_id: number;
  qty: number;
  note?: string;
}

export interface CloseSplit {
  item_ids: number[];
  payment_method: string;
}

export function tablesApi(client: ApiClient) {
  return {
    // --- Croquis ---
    floor: () => client.get<{ areas: FloorArea[] }>('/floor'),

    // --- Áreas ---
    areas: () => client.get<{ areas: TableArea[] }>('/table-areas'),
    createArea: (data: Partial<TableArea>) =>
      client.post<{ area: TableArea }>('/table-areas', data),
    updateArea: (id: number, data: Partial<TableArea>) =>
      client.put<{ area: TableArea }>(`/table-areas/${id}`, data),
    deleteArea: (id: number) => client.delete<{ deleted: boolean }>(`/table-areas/${id}`),

    // --- Mesas ---
    listTables: (areaId?: number) =>
      client.get<{ tables: Table[] }>(`/tables${areaId ? `?area_id=${areaId}` : ''}`),
    createTable: (data: Partial<Table>) => client.post<{ table: Table }>('/tables', data),
    updateTable: (id: number, data: Partial<Table>) =>
      client.put<{ table: Table }>(`/tables/${id}`, data),
    deleteTable: (id: number) => client.delete<{ deleted: boolean }>(`/tables/${id}`),
    saveLayout: (
      tables: Array<
        Pick<Table, 'id' | 'pos_x' | 'pos_y' | 'width' | 'height' | 'rotation'> & {
          area_id?: number;
        }
      >,
    ) => client.put<{ updated: number }>('/tables/layout', { tables }),

    // --- Cuentas ---
    openSessions: () => client.get<{ sessions: TableSession[] }>('/table-sessions'),
    session: (id: number) => client.get<{ session: TableSession }>(`/table-sessions/${id}`),
    openSession: (tableIds: number[], partySize?: number, note?: string) =>
      client.post<{ session: TableSession }>('/table-sessions', {
        table_ids: tableIds,
        party_size: partySize,
        note,
      }),
    addRound: (sessionId: number, items: RoundItemInput[], note?: string) =>
      client.post<{ round: Round }>(`/table-sessions/${sessionId}/rounds`, { items, note }),
    requestBill: (sessionId: number) =>
      client.post<{ session: TableSession }>(`/table-sessions/${sessionId}/request-bill`),
    setTables: (sessionId: number, tableIds: number[]) =>
      client.put<{ session: TableSession }>(`/table-sessions/${sessionId}/tables`, {
        table_ids: tableIds,
      }),
    merge: (targetId: number, sourceId: number) =>
      client.post<{ session: TableSession }>(`/table-sessions/${targetId}/merge`, {
        source_session_id: sourceId,
      }),
    close: (
      sessionId: number,
      body: {
        payment_method?: string;
        splits?: CloseSplit[];
        cash_session_id?: number;
        note?: string;
      },
    ) => client.post<{ sale_ids: number[] }>(`/table-sessions/${sessionId}/close`, body),
    cancel: (sessionId: number) =>
      client.post<{ cancelled: boolean }>(`/table-sessions/${sessionId}/cancel`),
  };
}
