import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Outbox, type SaleInput } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';
import { useOnline } from '@/lib/network';
import { DexieOutboxStorage } from './outboxStorage';

const outbox = new Outbox(new DexieOutboxStorage());

interface SyncContextValue {
  pendingCount: number;
  enqueueSale: (sale: SaleInput) => Promise<void>;
  flushNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const online = useOnline();
  const [pendingCount, setPendingCount] = useState(0);
  const flushing = useRef(false);

  const refresh = useCallback(async () => {
    const items = await outbox.pending();
    setPendingCount(items.length);
  }, []);

  // Vacía la cola: reenvía cada venta pendiente. Idempotente por client_uuid,
  // así que reintentar nunca duplica. El guard evita solapamientos.
  const flushNow = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      await outbox.flush(async (item) => {
        await api.sales.create(item.payload as SaleInput);
      });
    } finally {
      flushing.current = false;
      await refresh();
    }
  }, [api, refresh]);

  const enqueueSale = useCallback(
    async (sale: SaleInput) => {
      await outbox.enqueue('sale', sale.client_uuid, sale);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Al recuperar conexión, intentar enviar lo pendiente.
  useEffect(() => {
    if (online) void flushNow();
  }, [online, flushNow]);

  return (
    <SyncContext.Provider value={{ pendingCount, enqueueSale, flushNow }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error('useSync debe usarse dentro de SyncProvider');
  }
  return ctx;
}
