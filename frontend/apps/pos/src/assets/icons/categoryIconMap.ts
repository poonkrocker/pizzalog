import type { Product } from '@pizzalog/shared';

export type CategoryIconName =
  | 'pizza' | 'drinks' | 'desserts' | 'promos' | 'starters'
  | 'sandwiches' | 'hotdogs' | 'coffee' | 'extras' | 'hot-meals'
  | 'salads' | 'sides' | 'breakfast' | 'ice-cream' | 'other';

const CATEGORY_ICON_BY_KEY: Record<string, CategoryIconName> = {
  pizza: 'pizza', pizzas: 'pizza',
  bebida: 'drinks', bebidas: 'drinks', drinks: 'drinks',
  postre: 'desserts', postres: 'desserts', dessert: 'desserts', desserts: 'desserts',
  promo: 'promos', promos: 'promos', promoción: 'promos', promociones: 'promos',
  entrada: 'starters', entradas: 'starters',
  sandwich: 'sandwiches', sandwiches: 'sandwiches', sándwich: 'sandwiches', sándwiches: 'sandwiches',
  pancho: 'hotdogs', panchos: 'hotdogs', hotdog: 'hotdogs', hotdogs: 'hotdogs',
  cafetería: 'coffee', cafeteria: 'coffee', café: 'coffee', cafe: 'coffee',
  extra: 'extras', extras: 'extras', adicional: 'extras', adicionales: 'extras',
  plato: 'hot-meals', platos: 'hot-meals', 'platos calientes': 'hot-meals',
  ensalada: 'salads', ensaladas: 'salads',
  guarnición: 'sides', guarniciones: 'sides', papas: 'sides',
  desayuno: 'breakfast', desayunos: 'breakfast',
  helado: 'ice-cream', helados: 'ice-cream',
  otros: 'other', otro: 'other',
};

export function categoryIconFor(categoryName: string | null | undefined): CategoryIconName {
  const key = (categoryName ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return CATEGORY_ICON_BY_KEY[key] ?? 'other';
}
