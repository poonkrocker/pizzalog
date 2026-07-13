import type { OutboxItem, OutboxStorage } from '@pizzalog/shared';
import { db } from './db';

// Implementación de la cola sobre Dexie. El Outbox de shared maneja la lógica
// idempotente; acá solo persistimos.
export class DexieOutboxStorage implements OutboxStorage {
  async add(item: OutboxItem): Promise<void> {
    await db.outbox.put(item);
  }
  async all(): Promise<OutboxItem[]> {
    return db.outbox.orderBy('createdAt').toArray();
  }
  async update(item: OutboxItem): Promise<void> {
    await db.outbox.put(item);
  }
  async remove(id: string): Promise<void> {
    await db.outbox.delete(id);
  }
}
