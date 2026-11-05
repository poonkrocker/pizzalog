/**
 * Pizzalog Price List — motor compartido (Tools + App) para actualizar precios
 * de insumos a partir de listas de proveedores (XLSX/CSV).
 *
 * Responsabilidades:
 *  1. Detectar columnas (producto, precio, código, presentación) de una planilla.
 *  2. Extraer ítems con precio y presentación ("x 10 kg", "6 x 1 L", "x 12 u").
 *  3. Matchear cada ítem contra el catálogo de insumos (alias aprendidos → código →
 *     nombre exacto → similitud difusa) con un puntaje de confianza.
 *  4. Calcular el precio por unidad del insumo y la variación contra el precio vigente.
 *
 * Nunca inventa datos: si no hay presentación se asume que el precio corresponde a la
 * unidad del insumo y se emite una advertencia; si las unidades son incompatibles el
 * precio queda en null para que la persona lo revise.
 */

export type PriceUnit = 'kg' | 'g' | 'l' | 'ml' | 'u';
export type PriceDimension = 'mass' | 'volume' | 'count';

export interface Presentation {
  quantity: number;
  unit: PriceUnit;
  label: string;
}

export interface PriceListColumns {
  header_row_index: number;
  name: number;
  price: number;
  code: number | null;
  presentation: number | null;
  /** Columnas alternativas que también parecen contener precios (ej. s/IVA, c/IVA). */
  price_candidates: number[];
  headers: string[];
}

export interface PriceListItem {
  row_index: number;
  raw_name: string;
  code: string | null;
  presentation: Presentation | null;
  price: number;
  alias_key: string;
}

export interface CatalogEntry {
  id: string;
  name: string;
  /** Unidad en la que se expresa el precio vigente del insumo (kg, g, l, ml, u...). */
  unit: string;
  /** Precio vigente por `unit`, o null si nunca tuvo precio. */
  current_price_per_unit: number | null;
}

export interface SupplierAlias {
  alias_key: string;
  target_id: string;
  pack_quantity?: number | null;
  pack_unit?: string | null;
}

export type MatchSource = 'alias' | 'code' | 'exact' | 'fuzzy' | 'none';

export interface MatchCandidate {
  target_id: string;
  name: string;
  score: number;
}

export interface PriceListMatch {
  item: PriceListItem;
  target_id: string | null;
  source: MatchSource;
  confidence: number;
  candidates: MatchCandidate[];
  presentation: Presentation | null;
  new_price_per_unit: number | null;
  old_price_per_unit: number | null;
  variation_pct: number | null;
  warnings: string[];
}

export interface MatchOptions {
  /** Puntaje mínimo para proponer un match difuso (0..1). Por defecto 0.5. */
  min_confidence?: number;
  /** Variación porcentual a partir de la cual se advierte una suba inusual. Por defecto 40. */
  max_increase_pct?: number;
  /** Variación porcentual (negativa) a partir de la cual se advierte una baja inusual. Por defecto -30. */
  max_decrease_pct?: number;
}

// ---------------------------------------------------------------------------
// Normalización de texto
// ---------------------------------------------------------------------------

const TOKEN_SYNONYMS: Record<string, string> = {
  muzza: 'mozzarella',
  muzzarella: 'mozzarella',
  muzarella: 'mozzarella',
  mozarella: 'mozzarella',
  mozarela: 'mozzarella',
  mozzarela: 'mozzarella',
  hna: 'harina',
  har: 'harina',
  jam: 'jamon',
  acte: 'aceite',
  tom: 'tomate',
  tomates: 'tomate',
  aceitunas: 'aceituna',
  anchoas: 'anchoa',
  cebollas: 'cebolla',
  morrones: 'morron',
  champignones: 'champignon',
  hongos: 'hongo',
  huevos: 'huevo',
  quesos: 'queso',
};

const UNIT_SYNONYMS: Record<string, PriceUnit> = {
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg', kilogramos: 'kg',
  g: 'g', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g',
  l: 'l', lt: 'l', lts: 'l', litro: 'l', litros: 'l',
  ml: 'ml', cc: 'ml', cm3: 'ml',
  u: 'u', un: 'u', und: 'u', unid: 'u', unids: 'u', unidad: 'u', unidades: 'u', uds: 'u', ud: 'u', unit: 'u',
};

const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'x', 'por', 'con', 'en', 'y', 'a', 'al', 'tipo',
  'caja', 'bolsa', 'paquete', 'pack', 'bulto', 'horma', 'barra', 'balde', 'lata', 'frasco',
  'bidon', 'botella', 'sachet', 'pote', 'envase', 'cja', 'bsa', 'paq', 'precio', 'oferta',
]);

export function normalizeText(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Tokens significativos para matching: sin unidades, cantidades ni palabras de envase. */
export function nameTokens(value: string): string[] {
  const tokens = normalizeText(value)
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .split(' ')
    .filter(Boolean);
  const result: string[] = [];
  for (const token of tokens) {
    if (/^\d+$/.test(token)) continue;
    if (UNIT_SYNONYMS[token]) continue;
    if (STOPWORDS.has(token)) continue;
    if (token.length < 2) continue;
    const mapped = TOKEN_SYNONYMS[token] ?? token;
    if (!result.includes(mapped)) result.push(mapped);
  }
  return result;
}

export function normalizeUnit(unit: string | null | undefined): PriceUnit | null {
  const key = normalizeText(String(unit ?? '')).replace(/\s+/g, '');
  if (!key) return null;
  if (key === 'unidad' || key === 'unit') return 'u';
  return UNIT_SYNONYMS[key] ?? null;
}

export function unitDimension(unit: PriceUnit): PriceDimension {
  if (unit === 'kg' || unit === 'g') return 'mass';
  if (unit === 'l' || unit === 'ml') return 'volume';
  return 'count';
}

const CANONICAL_FACTOR: Record<PriceUnit, number> = { kg: 1000, g: 1, l: 1000, ml: 1, u: 1 };

/** Convierte una cantidad entre unidades de la misma dimensión; null si son incompatibles. */
export function convertUnits(quantity: number, from: PriceUnit, to: PriceUnit): number | null {
  if (unitDimension(from) !== unitDimension(to)) return null;
  return (quantity * CANONICAL_FACTOR[from]) / CANONICAL_FACTOR[to];
}

// ---------------------------------------------------------------------------
// Números y presentaciones
// ---------------------------------------------------------------------------

/**
 * Interpreta importes en formato argentino ("$ 6.850,50"), anglosajón ("6,850.50")
 * o numérico de Excel ("6850.5"). Devuelve null si no es un importe positivo.
 */
export function parseMoney(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  let text = String(value ?? '').trim();
  if (!text) return null;
  // Solo se admiten símbolos de moneda; cualquier otra letra indica que no es un importe.
  if (/[a-z]/i.test(text.replace(/u\$s|ars|usd|pesos|\$/gi, ''))) return null;
  text = text.replace(/[^\d.,-]/g, '');
  if (!text || /^[.,-]+$/.test(text) || text.includes('-')) return null;
  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const parts = text.split(',');
    text = parts.length > 2 ? parts.join('') : text.replace(',', '.');
  } else if (lastDot >= 0) {
    if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 10000) / 10000 : null;
}

const UNIT_PATTERN = 'kgs?|kilos?|kilogramos?|grs?|gramos?|g|lts?|litros?|l|ml|cc|cm3|unidades|unidad|unids?|und|uds?|un|u';
const NUMBER_PATTERN = '\\d+(?:[.,]\\d+)?';

function toNumber(text: string): number {
  return Number(text.replace(',', '.'));
}

/**
 * Detecta la presentación de compra dentro de un texto libre.
 * Ejemplos: "Muzza x 10 kg" → 10 kg · "Aceite 6x1L" → 6 L · "Huevos x 30 u" → 30 u ·
 * "Harina 000 25kg" → 25 kg · "Tomate 1/2 kg" → 0,5 kg.
 */
export function parsePresentation(text: string | null | undefined): Presentation | null {
  const source = String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/(\d+)\s*\/\s*(\d+)/g, (_, a: string, b: string) => {
      const value = Number(a) / Number(b);
      return Number.isFinite(value) ? String(value) : `${a}/${b}`;
    });
  if (!source.trim()) return null;

  const multipack = new RegExp(`(\\d+)\\s*[x\\*]\\s*(${NUMBER_PATTERN})\\s*(${UNIT_PATTERN})(?![a-z])`);
  const multi = source.match(multipack);
  if (multi) {
    const count = Number(multi[1]);
    const each = toNumber(multi[2] ?? '');
    const unit = normalizeUnit(multi[3]);
    if (unit && count > 0 && each > 0) {
      return { quantity: round(count * each, 6), unit, label: multi[0].trim() };
    }
  }

  const single = new RegExp(`(${NUMBER_PATTERN})\\s*(${UNIT_PATTERN})(?![a-z0-9])`, 'g');
  let last: Presentation | null = null;
  for (const match of source.matchAll(single)) {
    const quantity = toNumber(match[1] ?? '');
    const unit = normalizeUnit(match[2]);
    if (unit && quantity > 0) last = { quantity, unit, label: match[0].trim() };
  }
  if (last) return last;

  // Presentación expresada solo como unidad ("kg", "Kilo", "Unidad") → cantidad 1.
  const bareUnit = normalizeUnit(source.trim());
  return bareUnit ? { quantity: 1, unit: bareUnit, label: source.trim() } : null;
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Detección de columnas y extracción
// ---------------------------------------------------------------------------

const HEADER_KEYWORDS = {
  name: ['producto', 'descripcion', 'articulo', 'detalle', 'item', 'nombre', 'insumo', 'mercaderia', 'concepto'],
  price: ['precio', 'importe', 'valor', 'costo', 'p unit', 'unitario', 'lista', 'neto', 'final', 'total'],
  code: ['codigo', 'cod', 'sku', 'ean', 'art', 'id'],
  presentation: ['presentacion', 'envase', 'unidad', 'um', 'u m', 'medida', 'contenido', 'formato', 'peso', 'bulto'],
};

function headerMatches(header: string, keywords: string[]): boolean {
  const normalized = ` ${normalizeText(header)} `;
  return keywords.some((keyword) => normalized.includes(` ${keyword} `) || normalized.trim().startsWith(keyword));
}

function pricePreference(header: string): number {
  const h = normalizeText(header);
  if (/(c iva|con iva|final|iva incl)/.test(h)) return 3;
  if (/(unit|unitario|lista)/.test(h)) return 2;
  if (/(s iva|sin iva|neto)/.test(h)) return 1;
  return 0;
}

/**
 * Detecta la fila de encabezados y las columnas relevantes de una lista de precios.
 * Si no hay encabezados reconocibles, infiere las columnas a partir de los datos.
 */
export function detectPriceListColumns(rows: string[][]): PriceListColumns | null {
  const scanLimit = Math.min(rows.length, 25);
  for (let r = 0; r < scanLimit; r += 1) {
    const row = rows[r] ?? [];
    let name = -1;
    let code: number | null = null;
    let presentation: number | null = null;
    const prices: number[] = [];
    row.forEach((cell, index) => {
      const header = String(cell ?? '');
      if (!header.trim() || parseMoney(header) !== null && !/[a-z]/i.test(header)) return;
      if (headerMatches(header, HEADER_KEYWORDS.price) && !headerMatches(header, ['codigo', 'cod'])) {
        prices.push(index);
      } else if (name < 0 && headerMatches(header, HEADER_KEYWORDS.name)) {
        name = index;
      } else if (code === null && headerMatches(header, HEADER_KEYWORDS.code)) {
        code = index;
      } else if (presentation === null && headerMatches(header, HEADER_KEYWORDS.presentation)) {
        presentation = index;
      }
    });
    if (name >= 0 && prices.length) {
      const sorted = [...prices].sort((a, b) =>
        pricePreference(row[b] ?? '') - pricePreference(row[a] ?? '') || b - a);
      return {
        header_row_index: r,
        name,
        price: sorted[0] ?? prices[0]!,
        code,
        presentation,
        price_candidates: prices,
        headers: row.map((cell) => String(cell ?? '')),
      };
    }
  }
  return inferColumnsFromData(rows);
}

function inferColumnsFromData(rows: string[][]): PriceListColumns | null {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (!width) return null;
  const textScore = new Array<number>(width).fill(0);
  const moneyScore = new Array<number>(width).fill(0);
  for (const row of rows.slice(0, 200)) {
    for (let c = 0; c < width; c += 1) {
      const cell = String(row[c] ?? '').trim();
      if (!cell) continue;
      if (/[a-z]{3,}/i.test(cell) && parseMoney(cell) === null) textScore[c] = (textScore[c] ?? 0) + 1;
      else if (parseMoney(cell) !== null) moneyScore[c] = (moneyScore[c] ?? 0) + 1;
    }
  }
  let name = -1;
  textScore.forEach((score, index) => { if (score > 0 && (name < 0 || score > (textScore[name] ?? 0))) name = index; });
  if (name < 0) return null;
  const prices = moneyScore
    .map((score, index) => ({ score, index }))
    .filter((entry) => entry.index !== name && entry.score > 0);
  if (!prices.length) return null;
  const maxScore = Math.max(...prices.map((entry) => entry.score));
  const best = prices.filter((entry) => entry.score >= maxScore * 0.8).sort((a, b) => b.index - a.index)[0]!;
  return {
    header_row_index: -1,
    name,
    price: best.index,
    code: null,
    presentation: null,
    price_candidates: prices.map((entry) => entry.index),
    headers: [],
  };
}

export function buildAliasKey(rawName: string, code?: string | null): string {
  const normalizedCode = normalizeText(String(code ?? '')).replace(/\s+/g, '');
  if (normalizedCode) return `code:${normalizedCode}`;
  return `name:${normalizeText(rawName)}`;
}

/** Extrae los ítems con nombre y precio válido según las columnas detectadas o elegidas. */
export function extractPriceListItems(rows: string[][], columns: PriceListColumns): PriceListItem[] {
  const items: PriceListItem[] = [];
  for (let r = columns.header_row_index + 1; r < rows.length; r += 1) {
    const row = rows[r] ?? [];
    const rawName = String(row[columns.name] ?? '').trim();
    if (!rawName || !/[a-z]/i.test(rawName)) continue;
    const price = parseMoney(row[columns.price]);
    if (price === null) continue;
    const code = columns.code !== null ? String(row[columns.code] ?? '').trim() || null : null;
    const presentationText = columns.presentation !== null ? String(row[columns.presentation] ?? '') : '';
    const presentation = parsePresentation(presentationText) ?? parsePresentation(rawName);
    items.push({ row_index: r, raw_name: rawName, code, presentation, price, alias_key: buildAliasKey(rawName, code) });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function tokensEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  return false;
}

/** Similitud 0..1 entre el nombre del proveedor y el nombre del insumo del catálogo. */
export function nameSimilarity(supplierName: string, catalogName: string): number {
  const a = nameTokens(supplierName);
  const b = nameTokens(catalogName);
  if (!a.length || !b.length) return 0;
  let common = 0;
  for (const token of b) if (a.some((other) => tokensEqual(token, other))) common += 1;
  const dice = (2 * common) / (a.length + b.length);
  const containment = common / b.length;
  // Un nombre de catálogo corto ("Mozzarella") contenido en uno largo del proveedor
  // ("Muzzarella Barraza x 10 kg") es una señal fuerte, pero no perfecta.
  return round(Math.max(dice, containment * 0.9), 4);
}

function presentationForAlias(item: PriceListItem, alias: SupplierAlias | undefined): Presentation | null {
  if (alias?.pack_quantity && alias.pack_quantity > 0) {
    const unit = normalizeUnit(alias.pack_unit);
    if (unit) return { quantity: alias.pack_quantity, unit, label: `${alias.pack_quantity} ${unit} (guardado)` };
  }
  return item.presentation;
}

/** Precio por unidad del insumo a partir del precio de la presentación del proveedor. */
export function computePricePerUnit(
  price: number,
  presentation: Presentation | null,
  targetUnit: string,
): { value: number | null; warning: string | null } {
  const unit = normalizeUnit(targetUnit);
  if (!unit) return { value: null, warning: `Unidad del insumo no reconocida ("${targetUnit}")` };
  if (!presentation) {
    return { value: round(price, 4), warning: `Sin presentación detectada: se asume que el precio es por ${unit}` };
  }
  const quantityInTarget = convertUnits(presentation.quantity, presentation.unit, unit);
  if (quantityInTarget === null || quantityInTarget <= 0) {
    return {
      value: null,
      warning: `La presentación (${presentation.quantity} ${presentation.unit}) no es compatible con la unidad del insumo (${unit})`,
    };
  }
  return { value: round(price / quantityInTarget, 4), warning: null };
}

export function variationPct(oldValue: number | null, newValue: number | null): number | null {
  if (oldValue === null || newValue === null || oldValue <= 0) return null;
  return round(((newValue - oldValue) / oldValue) * 100, 2);
}

/**
 * Matchea los ítems de una lista de proveedor contra el catálogo de insumos.
 * Prioridad: alias aprendido → código → nombre exacto → similitud difusa.
 */
export function matchPriceList(
  items: PriceListItem[],
  catalog: CatalogEntry[],
  aliases: SupplierAlias[] = [],
  options: MatchOptions = {},
): PriceListMatch[] {
  const minConfidence = options.min_confidence ?? 0.5;
  const maxIncrease = options.max_increase_pct ?? 40;
  const maxDecrease = options.max_decrease_pct ?? -30;
  const byId = new Map(catalog.map((entry) => [entry.id, entry]));
  const byExactName = new Map<string, CatalogEntry>();
  for (const entry of catalog) {
    const key = normalizeText(entry.name);
    if (key && !byExactName.has(key)) byExactName.set(key, entry);
  }
  const aliasByKey = new Map(aliases.map((alias) => [alias.alias_key, alias]));

  return items.map((item) => {
    const warnings: string[] = [];
    const scored = catalog
      .map((entry) => ({ target_id: entry.id, name: entry.name, score: nameSimilarity(item.raw_name, entry.name) }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    let target: CatalogEntry | null = null;
    let source: MatchSource = 'none';
    let confidence = 0;

    const alias = aliasByKey.get(item.alias_key)
      ?? (item.code ? aliasByKey.get(buildAliasKey(item.raw_name, null)) : undefined);
    if (alias && byId.has(alias.target_id)) {
      target = byId.get(alias.target_id)!;
      source = item.code && alias.alias_key.startsWith('code:') ? 'code' : 'alias';
      confidence = 1;
    } else {
      const exact = byExactName.get(normalizeText(item.raw_name));
      if (exact) {
        target = exact;
        source = 'exact';
        confidence = 1;
      } else if (scored[0] && scored[0].score >= minConfidence) {
        target = byId.get(scored[0].target_id) ?? null;
        source = 'fuzzy';
        confidence = scored[0].score;
        const second = scored[1];
        if (second && scored[0].score - second.score < 0.05) {
          confidence = round(confidence * 0.85, 4);
          warnings.push(`Match ambiguo: también podría ser "${second.name}"`);
        }
      }
    }

    const presentation = presentationForAlias(item, alias);
    let newPrice: number | null = null;
    let oldPrice: number | null = null;
    if (target) {
      const computed = computePricePerUnit(item.price, presentation, target.unit);
      newPrice = computed.value;
      if (computed.warning) warnings.push(computed.warning);
      oldPrice = target.current_price_per_unit;
    }
    const variation = variationPct(oldPrice, newPrice);
    if (variation !== null && variation > maxIncrease) {
      warnings.push(`Suba inusual (+${variation}%): revisá la presentación o el insumo vinculado`);
    } else if (variation !== null && variation < maxDecrease) {
      warnings.push(`Baja inusual (${variation}%): revisá la presentación o el insumo vinculado`);
    }

    return {
      item,
      target_id: target?.id ?? null,
      source,
      confidence: round(confidence, 4),
      candidates: scored.slice(0, 3),
      presentation,
      new_price_per_unit: newPrice,
      old_price_per_unit: oldPrice,
      variation_pct: variation,
      warnings,
    };
  });
}

/**
 * Recalcula un match cuando la persona cambia el insumo vinculado o la presentación
 * desde la pantalla de revisión.
 */
export function rematch(
  match: PriceListMatch,
  catalog: CatalogEntry[],
  changes: { target_id?: string | null; presentation?: Presentation | null },
  options: MatchOptions = {},
): PriceListMatch {
  const targetId = changes.target_id !== undefined ? changes.target_id : match.target_id;
  const presentation = changes.presentation !== undefined ? changes.presentation : match.presentation;
  const target = targetId ? catalog.find((entry) => entry.id === targetId) ?? null : null;
  const warnings: string[] = [];
  let newPrice: number | null = null;
  let oldPrice: number | null = null;
  if (target) {
    const computed = computePricePerUnit(match.item.price, presentation, target.unit);
    newPrice = computed.value;
    if (computed.warning) warnings.push(computed.warning);
    oldPrice = target.current_price_per_unit;
  }
  const variation = variationPct(oldPrice, newPrice);
  if (variation !== null && variation > (options.max_increase_pct ?? 40)) {
    warnings.push(`Suba inusual (+${variation}%): revisá la presentación o el insumo vinculado`);
  } else if (variation !== null && variation < (options.max_decrease_pct ?? -30)) {
    warnings.push(`Baja inusual (${variation}%): revisá la presentación o el insumo vinculado`);
  }
  return {
    ...match,
    target_id: target?.id ?? null,
    source: target ? (targetId === match.target_id ? match.source : 'alias') : 'none',
    confidence: target ? (targetId === match.target_id ? match.confidence : 1) : 0,
    presentation,
    new_price_per_unit: newPrice,
    old_price_per_unit: oldPrice,
    variation_pct: variation,
    warnings,
  };
}

export interface PriceListSummary {
  total: number;
  matched: number;
  unmatched: number;
  increases: number;
  decreases: number;
  unchanged: number;
  with_warnings: number;
  average_variation_pct: number | null;
}

export function summarizeMatches(matches: PriceListMatch[]): PriceListSummary {
  const variations = matches.map((m) => m.variation_pct).filter((v): v is number => v !== null);
  return {
    total: matches.length,
    matched: matches.filter((m) => m.target_id).length,
    unmatched: matches.filter((m) => !m.target_id).length,
    increases: variations.filter((v) => v > 0.005).length,
    decreases: variations.filter((v) => v < -0.005).length,
    unchanged: variations.filter((v) => Math.abs(v) <= 0.005).length,
    with_warnings: matches.filter((m) => m.warnings.length).length,
    average_variation_pct: variations.length
      ? round(variations.reduce((sum, v) => sum + v, 0) / variations.length, 2)
      : null,
  };
}
