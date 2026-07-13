import type { Category, Product } from '@pizzalog/shared';
import { db } from './db';

// Reemplaza el catálogo cacheado por el más reciente del servidor.
export async function cacheCatalog(products: Product[], categories: Category[]): Promise<void> {
  await db.transaction('rw', db.products, db.categories, async () => {
    await db.products.clear();
    await db.products.bulkPut(products);
    await db.categories.clear();
    await db.categories.bulkPut(categories);
  });
}

// Lee el catálogo cacheado (para operar sin conexión).
export async function readCachedCatalog(): Promise<{
  products: Product[];
  categories: Category[];
}> {
  const [products, categories] = await Promise.all([
    db.products.toArray(),
    db.categories.orderBy('sort_order').toArray(),
  ]);
  return { products, categories };
}
