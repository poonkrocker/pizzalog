// Una operación pendiente de enviar al servidor. El id ES la clave de
// idempotencia (client_uuid), de modo que reenviar nunca duplica.
export interface OutboxItem<T = unknown> {
  id: string;
  kind: string;
  payload: T;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

// Persistencia de la cola, abstracta. El TPV la implementa sobre IndexedDB
// (Dexie); en tests puede ser en memoria.
export interface OutboxStorage {
  add(item: OutboxItem): Promise<void>;
  all(): Promise<OutboxItem[]>;
  update(item: OutboxItem): Promise<void>;
  remove(id: string): Promise<void>;
}
