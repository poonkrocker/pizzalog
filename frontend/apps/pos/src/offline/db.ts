import Dexie, { type Table } from 'dexie';
import type { Category, OutboxItem, Product } from '@pizzalog/shared';

// Base local del TPV (IndexedDB vía Dexie). Guarda el catálogo cacheado para
// operar sin red, y la cola de ventas pendientes de enviar.
export class PosDB extends Dexie {
  products!: Table<Product, number>;
  categories!: Table<Category, number>;
  outbox!: Table<OutboxItem, string>;

  constructor() {
    super('pizzalog-pos');
    this.version(1).stores({
      products: 'id, category_id',
      categories: 'id, sort_order',
      outbox: 'id, createdAt',
    });
  }
}

export const db = new PosDB();
