import { useMemo, useRef, useState } from 'react';
import type { StudioRecipe, SupplyItem } from '@pizzalog/shared';

type DraftLine = {
  id: string;
  name: string;
  ingredient: string;
  category: string;
  quantity: string;
  unit: string;
  supplyId: number | null;
};

type ExistingVariant = { variant_id: number; label: string; recipe_id: number | null; recipe_name: string | null };

type RevertResult = {
  dry_run: boolean;
  mode: string;
  date: string;
  recipes_count?: number;
  links_count?: number;
  components_count?: number;
  supplies_count?: number;
  recipes_sample?: string[];
  supplies_sample?: string[];
  deleted_recipes?: number;
  deleted_links?: number;
  deleted_components?: number;
  deleted_supplies?: number;
};

type DraftPizza = {
  id: string;
  name: string;
  price: number;
  lines: DraftLine[];
  include: boolean;
  existing: string | null;
  variantId: number;
  recipeId: number | null;
  sourceLabel: string;
  sourcePeriod: string;
};

type Props = {
  supplies: SupplyItem[];
  recipes: StudioRecipe[];
  variants: ExistingVariant[];
  onCreateSupply: (name: string, unit: string, category: string) => Promise<number>;
  onImport: (recipe: {
    name: string;
    price: number;
    variantId: number;
    recipeId: number | null;
    components: Array<{ component_type: 'supply'; component_id: number; quantity: number; unit: string }>;
  }) => Promise<void>;
  onRevertImport?: (payload: {
    mode: 'date' | 'csv';
    date?: string;
    dry_run?: boolean;
    pizza_names?: string[];
    ingredient_names?: string[];
  }) => Promise<RevertResult>;
};

const cleanPizzaName = (value: string) =>
  value.replace(/\s*\[ingrediente\s*\d+\]\s*$/i, '').trim();

const normalize = (value: string) => cleanPizzaName(value).toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const normalizePizzaBase = (value: string) =>
  normalize(value.replace(/\([^)]*\)/g, '')).replace(/^pizza\s+/, '').trim();

const aliases: Record<string, string[]> = {
  pizza: ['pizza', 'producto', 'product', 'name', 'product name', 'pizza name', 'nombre', 'nombre pizza', 'nombre del producto', 'recipe', 'receta'],
  ingredient: ['ingrediente', 'ingredient', 'insumo', 'nombre ingrediente', 'nombre del ingrediente', 'ingredient name', 'supply', 'supply name'],
  ingredients: ['ingredientes', 'ingredients', 'lista ingredientes', 'ingredient list', 'composicion', 'composición'],
  category: ['categoria', 'category', 'rubro', 'familia', 'grupo', 'tipo insumo'],
  quantity: ['cantidad', 'quantity', 'cant', 'peso', 'gramos', 'cantidad ingrediente'],
  unit: ['unidad', 'unit', 'medida'],
  price: ['precio', 'price', 'importe'],
  from: ['desde', 'from', 'fecha desde', 'vigencia desde'],
  to: ['hasta', 'to', 'fecha hasta', 'vigencia hasta'],
  label: ['tipo', 'etiqueta', 'label', 'tag'],
  sourceId: ['id', 'product id', 'producto id'],
};

export const SUPPLY_CATEGORIES = [
  'Lácteos / Quesos',
  'Fiambres',
  'Carnes / Pescados',
  'Verdulería',
  'Salsas',
  'Despensa Secos',
  'Despensa',
  'Conservas',
  'Aceites y Grasas',
  'Masa / Harinas',
  'Otros',
] as const;

export function inferSupplyCategory(rawName: string): string {
  const n = normalize(rawName);
  if (!n) return 'Otros';

  // 1. Masa / Harinas
  if (/\b(masa|harina|semola|levadura|faina|hojaldre|filo)\b/.test(n)) {
    return 'Masa / Harinas';
  }

  // 2. Aceites y Grasas
  if (/\b(aceite|grasa)\b/.test(n)) {
    return 'Aceites y Grasas';
  }

  // 3. Conservas (encurtidos, confitados, almíbar, aceitunas, alcaparras, chucrut)
  if (
    /\b(confitad|confitado|confitada|confitados|almibar|relish|alcaparra|alcaparras|alcaucil|alcauciles|pepinillo|pepinillos|chucrut|aceituna|aceitunas|oliva|olivas)\b/.test(n) &&
    !/\btierra de\b/.test(n) &&
    !/\baceite\b/.test(n) &&
    !/\balmibar de naranja\b/.test(n)
  ) {
    return 'Conservas';
  }
  if (
    n === 'anchoas' ||
    n === 'anchoa' ||
    n === 'papa confitada' ||
    n === 'cebolla confitada' ||
    n === 'cebolla caramelizada' ||
    n === 'zapallo en almibar' ||
    n === 'alcauciles confitados' ||
    n === 'alcaparras fritas' ||
    n === 'aceituna asada' ||
    n === 'aceitunas negras' ||
    n.includes('cherry') && n.includes('confitad')
  ) {
    return 'Conservas';
  }

  // 4. Salsas, cremas saladas/vegetales, pestos, reducciones, purés, geles y pastas untables
  if (
    /\b(salsa|pesto|cremoso de papa|cremoso de papas|reduccion|vinagreta|glace|guacamole|pico de gallo|muhammara|sriracha|ketchup|mayo|chimichurri|almibar de naranja|ajo sofrito|gel de)\b/.test(n) ||
    /^pure de\b/.test(n) ||
    /^pasta de berenjena\b/.test(n) ||
    (/^crema de\b/.test(n) && !/\b(leche|camembert|provolone|queso)\b/.test(n))
  ) {
    return 'Salsas';
  }

  // 5. Lácteos / Quesos (excluyendo vegetales salteados en manteca o manteca de maní)
  if (
    /\b(muzzarella|mozzarella|muzza|queso|provolone|provoleta|provoletita|provoletas|provoletitas|ricota|ricotta|straciatella|stracciatella|morbier|reggianito|parmesano|camembert|fontina|fonduta|pepato|raclette|cheddar|catupiry|gruyere|brie|romanito|manteca|crema|yogurt|sour cream|epice)\b/.test(n) &&
    !/\bmanteca de mani\b/.test(n) &&
    !/\bsaltead[oa]s? en manteca\b/.test(n)
  ) {
    return 'Lácteos / Quesos';
  }

  // 6. Fiambres y embutidos
  if (
    /\b(jamon|salame|bondiola|cantimpalo|panceta|bacon|salchicha|mortadela|mortadella|pastron|pepperoni|chorizo|lomo|prosciutto|speck|nduja|longaniza)\b/.test(n)
  ) {
    return 'Fiambres';
  }

  // 7. Carnes / Pescados / Mariscos
  if (
    /\b(albondig|albondigas|albondiguitas|camaron|camarones|langostino|milanesa|anchoas fritas|pollo|hamburgues|hamburguesitas|mejillon|mejillones|peceto|chinchulin|atun|katsuobushi|ternera|cordero|carne|pescado)\b/.test(n)
  ) {
    return 'Carnes / Pescados';
  }

  // 8. Despensa Secos (frutos secos, semillas, hongos secos, crocante, chips, totopos, polvos)
  if (
    /\b(nuez|nueces|almendra|almendras|avellana|avellanas|pistacho|pistachos|castana|castanas|mani tostado|garrapinada|praline|semilla|semillas|sesamo|hongos de pino|tomates secos|chips|totopo|totopos|crocante de pasta|socarrat|polvo de|tierra de|petalos de rosa|carbon vegetal)\b/.test(n) &&
    !/\bnuez moscada\b/.test(n)
  ) {
    return 'Despensa Secos';
  }

  // 9. Despensa (especias, condimentos secos, mieles, huevos, aceto, sal)
  if (
    /\b(miel|honey comb|cebolla crispy|oregano|provenzal|pimenton|paprika|ajo frito|caviar de ajo|tomillo|pasta de mani|manteca de mani|pimienta|merken|aceto|azafran|nuez moscada|huevo|huevos|yema|yemas|ositos de goma|sal|azucar|mayonesa)\b/.test(n) &&
    !/\boregano fresco\b/.test(n)
  ) {
    return 'Despensa';
  }

  // 10. Verdulería (vegetales frescos/asados, frutas, hierbas frescas, ralladuras/zest)
  if (
    /\b(albahaca|cebolla|romero|papa|papin|papines|papita|papitas|morron|ciboulette|pera|tomate|tomates|tomatillo|tomatillos|acelga|espinaca|espinacas|naranja|hinojo|arandano|arandanos|perejil|champignon|champignones|champi|portobello|portobellos|choclo|ajo|verdeo|esparrago|esparragos|apio|brocoli|zucchini|zuccini|menta|arveja|arvejas|berenjena|aji|jalapeno|manzana|uva|uvas|frutilla|frutillas|frambuesa|frambuesas|mora|moras|ciruela|rucula|durazno|melon|palta|coliflor|remolacha|calabaza|zapallo|puerro|zest|ralladura|cilantro|limon|lima|boniato|batata|oregano fresco)\b/.test(n)
  ) {
    return 'Verdulería';
  }

  return 'Despensa';
}

function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiters = [',', ';', '\t'];
  const delimiter = delimiters.map((d) => {
    let quoted = false, count = 0;
    for (let i = 0; i < first.length; i += 1) {
      if (first[i] === '"') quoted = !quoted;
      else if (first[i] === d && !quoted) count += 1;
    }
    return { d, count };
  }).sort((a, b) => b.count - a.count)[0]?.d ?? ',';

  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim()); cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('El CSV tiene comillas sin cerrar.');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw new Error('El archivo no contiene encabezados y filas de datos.');
  if (rows.length > 10001) throw new Error('El archivo supera el límite de 10.000 filas.');
  return rows;
}

function column(headers: string[], kind: keyof typeof aliases): number {
  return headers.findIndex((header) => (aliases[kind] ?? []).includes(normalize(header)));
}

function parsePrice(value: string): number {
  const raw = value.trim().replace(/[^0-9,.-]/g, '');
  if (!raw) return 0;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/\.(?=\d{3}(?:\D|$))/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

const SUPPLY_SYNONYMS: Record<string, string[]> = {
  muzzarella: ['muzza', 'mozzarella'],
  straciatella: ['stracciatella'],
  albahaca: ['albahaca fresca'],
  romero: ['romero fresco'],
  anchoas: ['anchoa'],
  'epice ahumado': ['queso epice'],
  'queso morbier': ['morbier'],
};

function matchSupply(name: string, supplies: SupplyItem[]): SupplyItem | undefined {
  const target = normalize(name);
  const exact = supplies.find((s) => normalize(s.name) === target);
  if (exact) return exact;
  for (const [canonical, syns] of Object.entries(SUPPLY_SYNONYMS)) {
    if (target === canonical || syns.includes(target)) {
      const found = supplies.find((s) => {
        const n = normalize(s.name);
        return n === canonical || syns.includes(n);
      });
      if (found) return found;
    }
  }
  return undefined;
}

function matchVariant(originalName: string, variants: ExistingVariant[]): ExistingVariant | undefined {
  const normFull = normalize(originalName);
  const normBase = normalizePizzaBase(originalName);
  return (
    variants.find((v) => normalize(v.label) === normFull) ??
    variants.find((v) => normalizePizzaBase(v.label) === normBase)
  );
}

function buildPizzas(rows: string[][], supplies: SupplyItem[], recipes: StudioRecipe[], variants: ExistingVariant[]): DraftPizza[] {
  const headers = (rows[0] ?? []).map(normalize);
  const pizzaCol = column(headers, 'pizza');
  const ingredientCol = column(headers, 'ingredient');
  const ingredientsCol = column(headers, 'ingredients');
  const categoryCol = column(headers, 'category');
  const quantityCol = column(headers, 'quantity');
  const unitCol = column(headers, 'unit');
  const priceCol = column(headers, 'price');
  const fromCol = column(headers, 'from');
  const toCol = column(headers, 'to');
  const labelCol = column(headers, 'label');
  const sourceIdCol = column(headers, 'sourceId');
  const grouped = new Map<string, DraftPizza>();

  if (pizzaCol < 0 || (ingredientCol < 0 && ingredientsCol < 0)) {
    throw new Error('No pude reconocer las columnas. Se necesitan pizza + ingrediente(s).');
  }

  // Un CSV en formato largo repite el nombre de la pizza una vez por ingrediente.
  // Solo es un duplicado histórico cuando el mismo nombre aparece con distintos IDs de origen (o etiqueta+período).
  const publicationKeysByName = new Map<string, Set<string>>();
  rows.slice(1).forEach((row) => {
    const cleanName = cleanPizzaName(row[pizzaCol] ?? '');
    const name = normalize(cleanName);
    if (!name) return;
    const sourceId = sourceIdCol >= 0 ? (row[sourceIdCol] ?? '').trim() : '';
    const sourceLabel = labelCol >= 0 ? (row[labelCol] ?? '').trim() : '';
    const sourcePeriod = [fromCol >= 0 ? row[fromCol] : '', toCol >= 0 ? row[toCol] : '']
      .map((value) => (value ?? '').trim()).filter(Boolean).join(' → ');
    const publicationKey = sourceId || `${normalize(sourceLabel)}::${sourcePeriod}`;
    const keys = publicationKeysByName.get(name) ?? new Set<string>();
    keys.add(publicationKey);
    publicationKeysByName.set(name, keys);
  });
  const duplicateNames = new Set(
    [...publicationKeysByName.entries()]
      .filter(([, publicationKeys]) => publicationKeys.size > 1)
      .map(([name]) => name),
  );

  rows.slice(1).forEach((row, index) => {
    const originalName = cleanPizzaName(row[pizzaCol] ?? '');
    if (!originalName) return;
    const normalizedName = normalize(originalName);
    const normalizedBase = normalizePizzaBase(originalName);
    const sourceId = sourceIdCol >= 0 ? (row[sourceIdCol] ?? '').trim() : '';
    const sourceLabel = labelCol >= 0 ? (row[labelCol] ?? '').trim() : '';
    const sourcePeriod = [fromCol >= 0 ? row[fromCol] : '', toCol >= 0 ? row[toCol] : '']
      .map(value => (value ?? '').trim()).filter(Boolean).join(' → ');
    const isAmbiguousName = duplicateNames.has(normalizedName);
    const key = sourceId || (isAmbiguousName
      ? `${normalizedName}::${normalize(sourceLabel)}::${sourcePeriod}`
      : normalizedName);
    let pizza = grouped.get(key);
    if (!pizza) {
      const variant = isAmbiguousName ? undefined : matchVariant(originalName, variants);
      const exact = isAmbiguousName ? undefined : (
        (variant?.recipe_id ? recipes.find(r => r.id === variant.recipe_id) : undefined)
        ?? recipes.find(r => normalize(r.name) === normalizedName || normalizePizzaBase(r.name) === normalizedBase)
      );
      const near = !exact && !variant && !isAmbiguousName ? recipes.find(r => {
        const candidate = normalize(r.name);
        return candidate && (candidate.includes(normalizedName) || normalizedName.includes(candidate));
      }) : undefined;
      const displayName = isAmbiguousName && sourceLabel
        ? `${originalName} · ${sourceLabel.replace(/[¡!]/g, '').trim()}`
        : originalName;
      pizza = {
        id: key,
        name: displayName,
        price: priceCol >= 0 ? parsePrice(row[priceCol] ?? '') : 0,
        lines: [],
        include: !exact && !near,
        existing: isAmbiguousName
          ? 'Publicación histórica distinta con el mismo nombre; se importará como receta independiente'
          : exact
            ? `Ya existe una receta «${exact.name}»${variant ? ` vinculada a «${variant.label}»` : ''}; importar actualizará sus ingredientes`
            : variant
              ? `Vinculada automáticamente a la variante histórica «${variant.label}»`
              : near ? `Posible coincidencia: ${near.name}` : null,
        variantId: variant?.variant_id ?? 0,
        recipeId: exact?.id ?? null,
        sourceLabel,
        sourcePeriod,
      };
      grouped.set(key, pizza);
    }

    const ingredientText = (ingredientCol >= 0 ? row[ingredientCol] : row[ingredientsCol]) ?? '';
    const names = ingredientCol >= 0 ? [ingredientText] : ingredientText.split(/[;,|]/).map(value => value.trim()).filter(Boolean);
    const csvCategory = categoryCol >= 0 ? (row[categoryCol] ?? '').trim() : '';
    names.forEach((ingredient, part) => {
      if (!ingredient) return;
      const supply = matchSupply(ingredient, supplies);
      const rawQuantity = quantityCol >= 0 ? (row[quantityCol] ?? '') : '';
      const quantity = Number(rawQuantity.replace(',', '.'));
      const unit = unitCol >= 0 && row[unitCol] ? row[unitCol] : supply?.unit ?? 'g';
      const category = supply?.category || csvCategory || inferSupplyCategory(ingredient);
      pizza!.lines.push({
        id: `${key}-${index}-${part}-${normalize(ingredient)}`,
        name: pizza!.name,
        ingredient,
        category,
        quantity: Number.isFinite(quantity) && quantity > 0 ? String(quantity) : '',
        unit,
        supplyId: supply?.id ?? null,
      });
    });
  });
  return [...grouped.values()];
}

export function SeasonalPizzaCsvImport({ supplies, recipes, variants, onCreateSupply, onImport, onRevertImport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pizzas, setPizzas] = useState<DraftPizza[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [autoCreateSupplies, setAutoCreateSupplies] = useState(true);

  // Estado del Desimportador / Revertir Lote
  const [revertDate, setRevertDate] = useState('2026-11-17');
  const [revertPreview, setRevertPreview] = useState<RevertResult | null>(null);
  const [revertBusy, setRevertBusy] = useState(false);

  const summary = useMemo(() => ({
    total: pizzas.length,
    selected: pizzas.filter((p) => p.include).length,
    matched: pizzas.reduce((n, p) => n + p.lines.filter((l) => l.supplyId !== null).length, 0),
    unmatched: pizzas.reduce((n, p) => n + p.lines.filter((l) => l.supplyId === null).length, 0),
  }), [pizzas]);

  const updateLine = (pizzaId: string, lineId: string, patch: Partial<DraftLine>) => {
    setPizzas((current) => current.map((pizza) => pizza.id !== pizzaId ? pizza : {
      ...pizza, lines: pizza.lines.map((line) => line.id !== lineId ? line : { ...line, ...patch }),
    }));
  };

  const readFile = async (file?: File) => {
    if (!file) return;
    setError(''); setNotice(''); setFileName(file.name); setRevertPreview(null);
    try {
      const rows = parseCsv(await file.text());
      setPizzas(buildPizzas(rows, supplies, recipes, variants));
    } catch (err) {
      setPizzas([]);
      setError(err instanceof Error ? err.message : 'No se pudo leer el CSV.');
    }
  };

  const handlePreviewRevert = async (mode: 'date' | 'csv') => {
    if (!onRevertImport) return;
    setRevertBusy(true); setError(''); setNotice('');
    try {
      const pizzaNames = mode === 'csv' ? [...new Set(pizzas.map((p) => p.name))] : undefined;
      const ingredientNames = mode === 'csv' ? [...new Set(pizzas.flatMap((p) => p.lines.map((l) => l.ingredient)))] : undefined;
      const res = await onRevertImport({
        mode,
        date: revertDate,
        dry_run: true,
        pizza_names: pizzaNames,
        ingredient_names: ingredientNames,
      });
      setRevertPreview(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo previsualizar la reversión.');
    } finally {
      setRevertBusy(false);
    }
  };

  const handleConfirmRevert = async () => {
    if (!onRevertImport || !revertPreview) return;
    const mode = revertPreview.mode === 'csv' ? 'csv' : 'date';
    setRevertBusy(true); setError(''); setNotice('');
    try {
      const pizzaNames = mode === 'csv' ? [...new Set(pizzas.map((p) => p.name))] : undefined;
      const ingredientNames = mode === 'csv' ? [...new Set(pizzas.flatMap((p) => p.lines.map((l) => l.ingredient)))] : undefined;
      const res = await onRevertImport({
        mode,
        date: revertDate,
        dry_run: false,
        pizza_names: pizzaNames,
        ingredient_names: ingredientNames,
      });
      setNotice(
        `✅ Desimportación completada: se eliminaron ${res.deleted_recipes ?? 0} recetas, ${res.deleted_links ?? 0} asociaciones con variantes, ${res.deleted_components ?? 0} componentes y ${res.deleted_supplies ?? 0} insumos huérfanos.`
      );
      setRevertPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo revertir la importación.');
    } finally {
      setRevertBusy(false);
    }
  };

  const importSelected = async () => {
    const selected = pizzas.filter((p) => p.include);
    if (!selected.length) { setError('Seleccioná al menos una pizza para importar.'); return; }
    const invalid = selected.find((p) => !p.lines.length || p.lines.some((l) => !l.ingredient.trim() || !l.unit));
    if (invalid) { setError(`Revisá que todos los ingredientes tengan nombre y unidad en «${invalid.name}».`); return; }
    const hasUnmatched = selected.some((p) => p.lines.some((l) => l.supplyId === null));
    if (hasUnmatched && !autoCreateSupplies) {
      setError('Hay ingredientes sin vincular a un insumo existente. Vinculalos en los desplegables o activá la casilla «Crear automáticamente insumos faltantes con su categoría detectada».');
      return;
    }
    setBusy(true); setError(''); setNotice('');
    let done = 0;
    let createdCount = 0;
    const createdByName = new Map<string, number>();
    try {
      for (const pizza of selected) {
        const components = [];
        for (const line of pizza.lines) {
          let supplyId = line.supplyId;
          if (supplyId === null) {
            const key = normalize(line.ingredient);
            supplyId = createdByName.get(key) ?? await onCreateSupply(line.ingredient.trim(), line.unit, line.category || inferSupplyCategory(line.ingredient));
            if (!createdByName.has(key)) {
              createdByName.set(key, supplyId);
              createdCount += 1;
            }
          }
          components.push({
            component_type: 'supply' as const,
            component_id: supplyId,
            quantity: line.quantity.trim() === '' ? 0 : Number(line.quantity.replace(',', '.')),
            unit: line.unit,
          });
        }
        await onImport({
          name: pizza.name,
          price: pizza.price,
          variantId: pizza.variantId,
          recipeId: pizza.recipeId,
          components,
        });
        done += 1;
      }
      setNotice(`Se importaron ${done} recetas y se agregaron ${createdCount} insumos nuevos clasificados en su categoría. Las cantidades vacías siguen pendientes de completar.`);
      setPizzas((current) => current.map((p) => ({ ...p, include: false })));
    } catch (err) {
      setError(`Se importaron ${done} recetas antes del error. ${err instanceof Error ? err.message : 'Revisá el catálogo e intentá nuevamente.'}`);
    } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {onRevertImport && (
        <div style={{ border: '1px solid #fecaca', borderRadius: 10, padding: '1rem', background: '#fef2f2', display: 'grid', gap: '.75rem' }}>
          <div>
            <h3 style={{ margin: 0, color: '#991b1b', fontSize: '1rem' }}>⏪ Desimportador / Revertir Lote de Importación CSV</h3>
            <p style={{ margin: '.25rem 0 0', color: '#7f1d1d', fontSize: '.84rem' }}>
              Revertí una importación de pizzas de temporada por fecha de carga (ej. 17/11/2026) o usando el archivo CSV cargado abajo. Elimina las asociaciones con variantes, las recetas de temporada creadas y los insumos auto-creados sin costo ni stock que hayan quedado huérfanos.
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.84rem', fontWeight: 600, color: '#7f1d1d' }}>
              Fecha del lote:
              <input
                type="date"
                value={revertDate}
                onChange={(e) => { setRevertDate(e.target.value); setRevertPreview(null); }}
                style={{ padding: '.4rem .6rem', borderRadius: 6, border: '1px solid #fca5a5', background: '#fff' }}
              />
            </label>
            <button
              type="button"
              disabled={revertBusy}
              onClick={() => void handlePreviewRevert('date')}
              style={{ padding: '.48rem .85rem', borderRadius: 7, border: '1px solid #dc2626', background: '#fff', color: '#b91c1c', fontWeight: 700, fontSize: '.83rem', cursor: 'pointer' }}
            >
              {revertBusy ? 'Consultando…' : `🔍 Buscar lote del ${revertDate}`}
            </button>
            {pizzas.length > 0 && (
              <button
                type="button"
                disabled={revertBusy}
                onClick={() => void handlePreviewRevert('csv')}
                style={{ padding: '.48rem .85rem', borderRadius: 7, border: '1px solid #991b1b', background: '#fee2e2', color: '#7f1d1d', fontWeight: 700, fontSize: '.83rem', cursor: 'pointer' }}
              >
                📄 Buscar registros que coincidan con este CSV ({pizzas.length} pizzas)
              </button>
            )}
          </div>

          {revertPreview && (
            <div style={{ background: '#fff', border: '1px solid #f87171', borderRadius: 8, padding: '.85rem', display: 'grid', gap: '.6rem' }}>
              <div style={{ fontWeight: 700, color: '#991b1b', fontSize: '.88rem' }}>
                Resumen de registros detectados para eliminar ({revertPreview.mode === 'csv' ? 'según archivo CSV' : `lote del ${revertPreview.date}`}):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem', fontSize: '.82rem' }}>
                <span style={{ padding: '.3rem .6rem', background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>
                  🍕 <strong>{revertPreview.recipes_count ?? 0}</strong> recetas de temporada
                </span>
                <span style={{ padding: '.3rem .6rem', background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>
                  🔗 <strong>{revertPreview.links_count ?? 0}</strong> asociaciones con variantes
                </span>
                <span style={{ padding: '.3rem .6rem', background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>
                  📋 <strong>{revertPreview.components_count ?? 0}</strong> líneas de ingredientes
                </span>
                <span style={{ padding: '.3rem .6rem', background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>
                  🧀 <strong>{revertPreview.supplies_count ?? 0}</strong> insumos huérfanos sin costo
                </span>
              </div>
              {!!revertPreview.recipes_sample?.length && (
                <div style={{ fontSize: '.78rem', color: '#475569' }}>
                  <strong>Recetas:</strong> {revertPreview.recipes_sample.join(', ')}{(revertPreview.recipes_count ?? 0) > revertPreview.recipes_sample.length ? '…' : ''}
                </div>
              )}
              {!!revertPreview.supplies_sample?.length && (
                <div style={{ fontSize: '.78rem', color: '#475569' }}>
                  <strong>Insumos a limpiar:</strong> {revertPreview.supplies_sample.join(', ')}{(revertPreview.supplies_count ?? 0) > revertPreview.supplies_sample.length ? '…' : ''}
                </div>
              )}
              <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginTop: '.25rem' }}>
                <button
                  type="button"
                  disabled={revertBusy || ((revertPreview.recipes_count ?? 0) === 0 && (revertPreview.supplies_count ?? 0) === 0)}
                  onClick={() => void handleConfirmRevert()}
                  style={{ padding: '.55rem 1rem', borderRadius: 7, border: 0, background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '.84rem', cursor: 'pointer' }}
                >
                  {revertBusy ? 'Eliminando…' : '🗑️ Confirmar y eliminar estos registros ahora'}
                </button>
                <button
                  type="button"
                  disabled={revertBusy}
                  onClick={() => setRevertPreview(null)}
                  style={{ padding: '.5rem .85rem', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: '.82rem', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ border: '1px solid var(--c-border,#ddd)', borderRadius: 10, padding: '1rem', background: 'var(--c-surface,#fff)' }}>
        <h3 style={{ marginTop: 0 }}>Importar pizzas desde CSV</h3>
        <p style={{ color: 'var(--c-muted,#64748b)', fontSize: '.88rem' }}>
          Importá un CSV con columnas de pizza, ingrediente y categoría (si no viene la columna <code>categoria</code>, se detecta automáticamente según el ingrediente).
        </p>
        <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={(e) => void readFile(e.target.files?.[0])} />
        {fileName && <p style={{ fontSize: '.8rem' }}>Archivo: <strong>{fileName}</strong></p>}
        <div style={{ marginTop: '.75rem' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.45rem', fontSize: '.84rem', fontWeight: 600, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoCreateSupplies}
              onChange={(e) => setAutoCreateSupplies(e.target.checked)}
            />
            Crear automáticamente insumos faltantes con su categoría detectada (si está desmarcado, exige vincular cada ingrediente a un insumo existente)
          </label>
        </div>
        <details style={{ marginTop: '.75rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Ver formatos admitidos</summary>
          <pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto', fontSize: '.78rem', background: '#f8fafc', padding: '.65rem', borderRadius: 6 }}>{'pizza,ingrediente,categoria,cantidad,unidad,precio\nPascuapizza,Muzzarella,Lácteos / Quesos,0.1,kg,17000\nPascuapizza,Ricota,Lácteos / Quesos,0.08,kg,17000\nPascuapizza,Acelga,Verdulería,0.08,kg,17000'}</pre>
        </details>
      </div>

      {!!pizzas.length && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
            {[['Pizzas', summary.total], ['Seleccionadas', summary.selected], ['Insumos vinculados', summary.matched], ['Nuevos a crear con categoría', summary.unmatched]].map(([label, value]) => (
              <div key={label} style={{ border: '1px solid var(--c-border,#ddd)', borderRadius: 8, padding: '.55rem .75rem', fontSize: '.82rem' }}>
                <strong>{value}</strong> <span style={{ color: '#64748b' }}>{label}</span>
              </div>
            ))}
          </div>
          {pizzas.map((pizza) => (
            <section key={pizza.id} style={{ border: '1px solid var(--c-border,#ddd)', borderRadius: 10, padding: '.85rem', background: '#fff', display: 'grid', gap: '.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap' }}>
                <div>
                  <strong>{pizza.name}</strong>
                  <div style={{ fontSize: '.78rem', color: pizza.existing ? '#92400e' : '#64748b' }}>{pizza.existing ?? 'Pizza nueva'}</div>
                  {(pizza.sourceLabel || pizza.sourcePeriod) && <div style={{ fontSize: '.75rem', color: '#64748b' }}>{[pizza.sourceLabel, pizza.sourcePeriod].filter(Boolean).join(' · ')}</div>}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.82rem' }}>
                  <input type="checkbox" checked={pizza.include} onChange={(e) => setPizzas((current) => current.map((p) => p.id === pizza.id ? { ...p, include: e.target.checked } : p))} />
                  Importar
                </label>
              </div>
              {pizza.recipeId !== null && recipes.find((r) => r.id === pizza.recipeId) && (
                <div style={{ fontSize: '.78rem', color: '#64748b', background: '#f8fafc', padding: '.55rem', borderRadius: 6 }}>
                  Receta actual: {recipes.find((r) => r.id === pizza.recipeId)!.components.map((component) => component.name).join(', ') || 'sin ingredientes'}
                </div>
              )}
              {pizza.lines.map((line) => (
                <div key={line.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,1.2fr) minmax(130px,.9fr) minmax(85px,.55fr) minmax(60px,.4fr)', gap: '.4rem', alignItems: 'center' }}>
                  <select aria-label={`Insumo para ${line.ingredient}`} value={line.supplyId ?? '__create__'} onChange={(e) => updateLine(pizza.id, line.id, { supplyId: e.target.value === '__create__' ? null : Number(e.target.value) })} style={{ minWidth: 0, padding: '.5rem', border: '1px solid #cbd5e1', borderRadius: 6 }}>
                    <option value="__create__">Agregar: {line.ingredient}</option>
                    {supplies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <select
                    aria-label={`Categoría para ${line.ingredient}`}
                    disabled={line.supplyId !== null}
                    value={line.category}
                    onChange={(e) => updateLine(pizza.id, line.id, { category: e.target.value })}
                    style={{ minWidth: 0, padding: '.5rem', border: '1px solid #cbd5e1', borderRadius: 6, background: line.supplyId !== null ? '#f8fafc' : '#fff', color: line.supplyId !== null ? '#64748b' : '#0f172a' }}
                  >
                    {!SUPPLY_CATEGORIES.includes(line.category as (typeof SUPPLY_CATEGORIES)[number]) && line.category && (
                      <option value={line.category}>{line.category}</option>
                    )}
                    {SUPPLY_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <input aria-label={`Cantidad de ${line.ingredient}`} inputMode="decimal" placeholder="Cantidad" value={line.quantity} onChange={(e) => updateLine(pizza.id, line.id, { quantity: e.target.value })} style={{ minWidth: 0, padding: '.5rem', border: '1px solid #cbd5e1', borderRadius: 6 }} />
                  <input aria-label={`Unidad de ${line.ingredient}`} value={line.unit} onChange={(e) => updateLine(pizza.id, line.id, { unit: e.target.value })} style={{ minWidth: 0, padding: '.5rem', border: '1px solid #cbd5e1', borderRadius: 6 }} />
                </div>
              ))}
            </section>
          ))}
          <button type="button" disabled={busy || summary.selected === 0} onClick={() => void importSelected()} style={{ padding: '.7rem 1rem', border: 0, borderRadius: 8, background: 'var(--c-accent,#c7101b)', color: '#fff', fontWeight: 700, opacity: busy ? .65 : 1 }}>
            {busy ? 'Importando recetas…' : `Importar / actualizar ${summary.selected} pizzas seleccionadas`}
          </button>
        </>
      )}
      {error && <div role="alert" style={{ padding: '.7rem', borderRadius: 7, background: '#fee2e2', color: '#991b1b' }}>{error}</div>}
      {notice && <div role="status" style={{ padding: '.7rem', borderRadius: 7, background: '#dcfce7', color: '#166534' }}>{notice}</div>}
    </div>
  );
}
