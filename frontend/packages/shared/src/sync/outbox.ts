import type { OutboxItem, OutboxStorage } from './types';

export type OutboxHandler = (item: OutboxItem) => Promise<void>;

export interface FlushResult {
  sent: number;
  failed: number;
}

// Cola de operaciones que mutan, para el TPV. Hoy la usamos solo para ventas:
// si el cobro ocurre sin red, se encola y se reenvía al reconectar. El handler
// hace la llamada real (idempotente por el id/client_uuid).
export class Outbox {
  constructor(private readonly storage: OutboxStorage) {}

  async enqueue(kind: string, id: string, payload: unknown): Promise<void> {
    await this.storage.add({ id, kind, payload, createdAt: Date.now(), attempts: 0 });
  }

  pending(): Promise<OutboxItem[]> {
    return this.storage.all();
  }

  async flush(handler: OutboxHandler): Promise<FlushResult> {
    const items = await this.storage.all();
    let sent = 0;
    let failed = 0;
    for (const item of items) {
      try {
        await handler(item);
        await this.storage.remove(item.id);
        sent++;
      } catch (e) {
        await this.storage.update({
          ...item,
          attempts: item.attempts + 1,
          lastError: e instanceof Error ? e.message : String(e),
        });
        failed++;
      }
    }
    return { sent, failed };
  }
}
