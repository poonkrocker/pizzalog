export type CategoryIconName =
  | 'pizza' | 'drinks' | 'desserts' | 'promos' | 'starters'
  | 'sandwiches' | 'hotdogs' | 'coffee' | 'extras' | 'hot-meals'
  | 'salads' | 'sides' | 'breakfast' | 'ice-cream' | 'empanadas'
  | 'pasta' | 'burgers' | 'bakery' | 'other' | 'uncategorized';

const CATEGORY_ICON_BY_KEY: Record<string, CategoryIconName> = {
  pizza: 'pizza', pizzas: 'pizza',
  bebida: 'drinks', bebidas: 'drinks', drink: 'drinks', drinks: 'drinks',
  'bebidas sin alcohol': 'drinks', gaseosas: 'drinks', latas: 'drinks',
  postre: 'desserts', postres: 'desserts', dessert: 'desserts', desserts: 'desserts',
  promo: 'promos', promos: 'promos', promocion: 'promos', promociones: 'promos', combo: 'promos', combos: 'promos',
  entrada: 'starters', entradas: 'starters', picada: 'starters', picadas: 'starters',
  sandwich: 'sandwiches', sandwiches: 'sandwiches', sanguche: 'sandwiches', sanguches: 'sandwiches', 'sandwich de miga': 'sandwiches', 'sandwiches de miga': 'sandwiches',
  pancho: 'hotdogs', panchos: 'hotdogs', hotdog: 'hotdogs', hotdogs: 'hotdogs',
  cafeteria: 'coffee', cafe: 'coffee', cafes: 'coffee',
  extra: 'extras', extras: 'extras', adicional: 'extras', adicionales: 'extras', 'costos extra': 'extras', 'costos extras': 'extras', 'costo extra': 'extras', 'costos adicionales': 'extras',
  plato: 'hot-meals', platos: 'hot-meals', 'platos calientes': 'hot-meals', 'comidas calientes': 'hot-meals',
  ensalada: 'salads', ensaladas: 'salads',
  guarnicion: 'sides', guarniciones: 'sides', papas: 'sides',
  desayuno: 'breakfast', desayunos: 'breakfast',
  helado: 'ice-cream', helados: 'ice-cream', heladeria: 'ice-cream',
  empanada: 'empanadas', empanadas: 'empanadas',
  pasta: 'pasta', pastas: 'pasta',
  hamburguesa: 'burgers', hamburguesas: 'burgers', burger: 'burgers', burgers: 'burgers',
  panaderia: 'bakery', panificados: 'bakery', medialunas: 'bakery', bolleria: 'bakery',
  otros: 'other', otro: 'other',
};

function normalizedCategoryKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export function categoryIconFor(categoryName: string | null | undefined): CategoryIconName {
  if (!categoryName?.trim()) return 'uncategorized';
  return CATEGORY_ICON_BY_KEY[normalizedCategoryKey(categoryName)] ?? 'other';
}

export function categoryIconSrc(categoryName: string | null | undefined): string {
  return `/category-icons/category-${categoryIconFor(categoryName)}.svg`;
}
