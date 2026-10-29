export type CategoryIconName =
  | 'pizza' | 'drinks' | 'desserts' | 'promos' | 'starters'
  | 'sandwiches' | 'hotdogs' | 'coffee' | 'extras' | 'hot-meals'
  | 'salads' | 'sides' | 'breakfast' | 'ice-cream' | 'empanadas'
  | 'pasta' | 'burgers' | 'bakery' | 'beer' | 'slice' | 'other' | 'uncategorized';

const CATEGORY_ICON_BY_KEY: Record<string, CategoryIconName> = {
  pizza: 'pizza', pizzas: 'pizza',
  porcion: 'slice', porciones: 'slice',
  cerveza: 'beer', cervezas: 'beer', birra: 'beer', birras: 'beer', artesanal: 'beer',
  bebida: 'drinks', bebidas: 'drinks', drink: 'drinks', drinks: 'drinks',
  'bebidas sin alcohol': 'drinks', gaseosas: 'drinks', latas: 'drinks',
  postre: 'desserts', postres: 'desserts', dessert: 'desserts', desserts: 'desserts',
  promo: 'promos', promos: 'promos', promocion: 'promos', promociones: 'promos', combo: 'promos', combos: 'promos',
  entrada: 'starters', entradas: 'starters', picada: 'starters', picadas: 'starters',
  sandwich: 'sandwiches', sandwiches: 'sandwiches', sanguche: 'sandwiches', sanguches: 'sandwiches', 'sandwich de miga': 'sandwiches', 'sandwiches de miga': 'sandwiches', lomito: 'sandwiches', lomitos: 'sandwiches',
  pancho: 'hotdogs', panchos: 'hotdogs', hotdog: 'hotdogs', hotdogs: 'hotdogs',
  cafeteria: 'coffee', cafe: 'coffee', cafes: 'coffee',
  extra: 'extras', extras: 'extras', adicional: 'extras', adicionales: 'extras', 'costos extra': 'extras', 'costos extras': 'extras', 'costo extra': 'extras', 'costos adicionales': 'extras',
  plato: 'hot-meals', platos: 'hot-meals', 'platos calientes': 'hot-meals', 'comidas calientes': 'hot-meals', lasagna: 'hot-meals',
  ensalada: 'salads', ensaladas: 'salads',
  guarnicion: 'sides', guarniciones: 'sides', papas: 'sides', 'papas fritas': 'sides',
  desayuno: 'breakfast', desayunos: 'breakfast', merienda: 'breakfast', meriendas: 'breakfast',
  helado: 'ice-cream', helados: 'ice-cream', heladeria: 'ice-cream',
  empanada: 'empanadas', empanadas: 'empanadas',
  pasta: 'pasta', pastas: 'pasta', fideos: 'pasta',
  hamburguesa: 'burgers', hamburguesas: 'burgers', burger: 'burgers', burgers: 'burgers',
  panaderia: 'bakery', panificados: 'bakery', medialunas: 'bakery', bolleria: 'bakery', pan: 'bakery',
  otros: 'other', otro: 'other',
  'sin categoria': 'uncategorized', 'sin asignar': 'uncategorized', 'sin categoria asignada': 'uncategorized',
};

function normalizedCategoryKey(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

export function categoryIconFor(categoryName: string | null | undefined): CategoryIconName {
  if (!categoryName?.trim()) return 'uncategorized';
  return CATEGORY_ICON_BY_KEY[normalizedCategoryKey(categoryName)] ?? 'other';
}

/**
 * Retorna la ruta al ícono SVG pixel art correspondiente.
 * Si se provee productName, busca además si el producto corresponde a una sub-variedad específica
 * (ej: Cerveza dentro de Bebidas, Porción dentro de Pizzas, Helado dentro de Postres, etc.).
 */
export function categoryIconSrc(categoryName?: string | null, productName?: string | null): string {
  if (productName) {
    const p = normalizedCategoryKey(productName);
    if (p.includes('cerve') || p.includes('birra') || p.includes('chopp')) return '/category-icons/cerveza.svg';
    if (p.includes('porci')) return '/category-icons/porcion-pizza.svg';
    if (p.includes('hamburg') || p.includes('burger')) return '/category-icons/hamburguesa.svg';
    if (p.includes('pancho') || p.includes('hot dog') || p.includes('hotdog')) return '/category-icons/pancho.svg';
    if (p.includes('helad')) return '/category-icons/helado.svg';
    if (p.includes('tiramis')) return '/category-icons/tiramisu.svg';
    if (p.includes('lasagn')) return '/category-icons/lasagna.svg';
    if (p.includes('fideo') || p.includes('pasta') || p.includes('raviol') || p.includes('tallar')) return '/category-icons/fideos.svg';
    if (p.includes('papa')) return '/category-icons/papas-fritas.svg';
    if (p.includes('empanad')) return '/category-icons/empanada.svg';
    if (p.includes('ensalad')) return '/category-icons/ensalada.svg';
    if (p.includes('brochet') || p.includes('picad')) return '/category-icons/brochette.svg';
    if (p.includes('sandwich') || p.includes('sangu') || p.includes('lomit') || p.includes('tostad')) return '/category-icons/sandwich.svg';
    if (p.includes('medialun')) return '/category-icons/medialuna-y-cafe.svg';
    if (p.includes('cafe') || p.includes('cortado') || p.includes('lagrima') || p.includes('capuccino')) return '/category-icons/cafe.svg';
    if (p.includes('lata') || p.includes('gaseosa') || p.includes('coca') || p.includes('sprite') || p.includes('fanta') || p.includes('agua') || p.includes('soda')) return '/category-icons/lata-gaseosa.svg';
    if (p.includes('promo') || p.includes('combo')) return '/category-icons/porcion-y-gaseosa.svg';
    if (p.includes('pizza')) return '/category-icons/pizza-entera.svg';
  }

  const iconName = categoryIconFor(categoryName);
  switch (iconName) {
    case 'pizza': return '/category-icons/pizza-entera.svg';
    case 'slice': return '/category-icons/porcion-pizza.svg';
    case 'beer': return '/category-icons/cerveza.svg';
    case 'drinks': return '/category-icons/lata-gaseosa.svg';
    case 'desserts': return '/category-icons/tiramisu.svg';
    case 'ice-cream': return '/category-icons/helado.svg';
    case 'promos': return '/category-icons/porcion-y-gaseosa.svg';
    case 'starters': return '/category-icons/brochette.svg';
    case 'sandwiches': return '/category-icons/sandwich.svg';
    case 'burgers': return '/category-icons/hamburguesa.svg';
    case 'hotdogs': return '/category-icons/pancho.svg';
    case 'coffee': return '/category-icons/cafe.svg';
    case 'breakfast': return '/category-icons/medialuna-y-cafe.svg';
    case 'bakery': return '/category-icons/pan.svg';
    case 'pasta': return '/category-icons/fideos.svg';
    case 'hot-meals': return '/category-icons/lasagna.svg';
    case 'salads': return '/category-icons/ensalada.svg';
    case 'sides': return '/category-icons/papas-fritas.svg';
    case 'empanadas': return '/category-icons/empanada.svg';
    case 'extras': return '/category-icons/dinero.svg';
    case 'other':
    case 'uncategorized':
    default:
      return '/category-icons/caja-misteriosa.svg';
  }
}
