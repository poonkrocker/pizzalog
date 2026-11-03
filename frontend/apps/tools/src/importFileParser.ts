export interface ParsedDoughProfile {
  name: string;
  unit_weight_g: number;
  hydration_pct: number;
  flours: Array<{ name: string; weight_kg: number }>;
  biga?: { flour_pct: number; water_pct: number; yeast_pct: number; yeast_ingredient_name: string };
  poolish?: { flour_pct: number; water_pct: number; yeast_pct: number; yeast_ingredient_name: string };
  direct_yeast_pct?: number;
  yeast_ingredient_name?: string;
  salt_pct?: number;
  salt_ingredient_name?: string;
  sugar_pct?: number;
  sugar_ingredient_name?: string;
  oil_pct?: number;
  oil_ingredient_name?: string;
}

export interface ParsedImportSheet {
  name: string;
  rows: string[][];
  warnings?: string[];
  doughProfiles?: ParsedDoughProfile[];
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_SHEETS = 30;
const MAX_ROWS = 10_000;
const MAX_COLUMNS = 200;

function detectDelimiter(line: string): string {
  const candidates = [',', ';', '\t'];
  const countOutsideQuotes = (delimiter: string) => {
    let quoted = false;
    let count = 0;
    for (let index = 0; index < line.length; index += 1) {
      if (line[index] === '"') {
        if (quoted && line[index + 1] === '"') index += 1;
        else quoted = !quoted;
      } else if (!quoted && line[index] === delimiter) {
        count += 1;
      }
    }
    return count;
  };
  return candidates
    .map((delimiter) => ({ delimiter, count: countOutsideQuotes(delimiter) }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ',';
}
function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (quoted) {
        quoted = false;
      } else if (cell.length === 0) {
        quoted = true;
      } else {
        throw new Error('El CSV contiene comillas fuera de lugar; corregí el formato antes de importar.');
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error('El CSV contiene comillas sin cerrar; corregí el formato antes de importar.');
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);

  if (rows.some((values) => values.length > MAX_COLUMNS)) {
    throw new Error(`El CSV supera el límite de ${MAX_COLUMNS} columnas; no se recortaron datos.`);
  }
  if (rows.length > MAX_ROWS) throw new Error(`El CSV supera el límite de ${MAX_ROWS} filas.`);
  return rows.map((values) => values.map((value) => value.trim()));
}

function xmlDocument(source: string, name: string): XMLDocument {
  const document = new DOMParser().parseFromString(source, 'application/xml');
  if (document.getElementsByTagName('parsererror').length > 0) {
    throw new Error(`El archivo XLSX contiene XML inválido en ${name}`);
  }
  return document;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const stream = new Blob([bytes]).stream().pipeThrough(
    new DecompressionStream('deflate-raw' as CompressionFormat)
  );
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 16 * 1024 * 1024) {
        await reader.cancel();
        throw new Error('Una entrada interna del XLSX supera 16 MB descomprimidos');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
async function unzip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  const searchStart = Math.max(0, bytes.length - 65_557);
  for (let i = bytes.length - 22; i >= searchStart; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('El archivo no parece ser un XLSX válido');

  const entryCount = view.getUint16(eocd + 10, true);
  if (entryCount > 4000) throw new Error('El XLSX contiene demasiadas entradas internas');
  const centralOffset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const files = new Map<string, Uint8Array>();
  let offset = centralOffset;
  let totalUncompressed = 0;

  for (let i = 0; i < entryCount; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('Directorio ZIP inválido dentro del XLSX');
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    totalUncompressed += uncompressedSize;
    if (uncompressedSize > 16 * 1024 * 1024 || totalUncompressed > 128 * 1024 * 1024) {
      throw new Error('El XLSX supera el límite seguro de contenido descomprimido (128 MB)');
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith('/')) continue;
    if (view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error('Entrada ZIP inválida dentro del XLSX');
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);

    let data: Uint8Array;
    if (method === 0) data = compressed;
    else if (method === 8) data = await inflateRaw(compressed);
    else throw new Error('El XLSX usa un método de compresión no compatible');
    if (data.length !== uncompressedSize) throw new Error('El XLSX contiene una entrada ZIP truncada o inconsistente');

    files.set(name, data);
  }
  return files;
}

function decodeXml(files: Map<string, Uint8Array>, path: string): XMLDocument {
  const data = files.get(path);
  if (!data) throw new Error(`Falta ${path} dentro del XLSX`);
  return xmlDocument(new TextDecoder().decode(data), path);
}

function columnIndex(reference: string): number {
  const letters = reference.replace(/[0-9]/g, '').toUpperCase();
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

function elementText(element: Element, localName: string): string {
  return Array.from(element.getElementsByTagNameNS('*', localName))
    .map((node) => node.textContent ?? '')
    .join('');
}


function normalizeRecipeMatrix(rows: string[][]): string[][] | null {
  const norm = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const productRowIndex = rows.findIndex((row) => norm(row[1] ?? row[0] ?? '') === 'producto');
  const ingredientHeaderIndex = rows.findIndex((row) =>
    norm(row[1] ?? row[0] ?? '') === 'ingrediente' &&
    row.some((value) => norm(value) === 'unidad')
  );
  if (productRowIndex < 0 || ingredientHeaderIndex <= productRowIndex) return null;

  const productRow = rows[productRowIndex];
  const typeRow = rows[productRowIndex + 1] ?? [];
  const ingredientHeader = rows[ingredientHeaderIndex];
  const ingredientNameColumn = ingredientHeader.findIndex((value) => norm(value) === 'ingrediente');
  const unitColumn = ingredientHeader.findIndex((value) => norm(value) === 'unidad');
  if (ingredientNameColumn < 0 || unitColumn < 0) return null;

  const output = [[
    'Nombre de receta', 'Tipo de receta', 'Rendimiento', 'Unidad de rendimiento',
    'Ingrediente', 'Cantidad', 'Unidad del componente',
  ]];
  for (let productColumn = Math.max(ingredientNameColumn, unitColumn) + 1;
    productColumn < productRow.length; productColumn += 1) {
    const recipeName = (productRow[productColumn] ?? '').trim();
    if (!recipeName) continue;
    const rawType = norm(typeRow[productColumn] ?? '');
    const recipeType = /subreceta|sub.?recipe|preparacion/.test(rawType) ? 'subrecipe' : 'product';

    for (let rowIndex = ingredientHeaderIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      const ingredient = (row[ingredientNameColumn] ?? '').trim();
      const unit = (row[unitColumn] ?? '').trim();
      const quantity = (row[productColumn] ?? '').trim();
      if (!ingredient || !unit || !quantity) continue;
      const numeric = Number(quantity.replace(',', '.'));
      if (!Number.isFinite(numeric) || numeric <= 0) continue;
      output.push([recipeName, recipeType, '1', 'unit', ingredient, quantity, unit]);
    }
  }
  return output.length > 1 ? output : null;
}


function normalizeIngredientPriceRows(rows: string[][]): string[][] | null {
  const norm = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const headerIndex = rows.findIndex((row) =>
    row.some((value) => norm(value) === 'ingrediente') &&
    row.some((value) => norm(value) === 'unidad') &&
    row.some((value) => norm(value).includes('precio'))
  );
  if (headerIndex < 0) return null;
  const header = rows[headerIndex];
  const nameColumn = header.findIndex((value) => norm(value) === 'ingrediente');
  const unitColumn = header.findIndex((value) => norm(value) === 'unidad');
  const priceColumn = header.findIndex((value) => norm(value).includes('precio'));
  const output = [['Nombre del insumo', 'Unidad base', 'Precio de compra']];
  for (const row of rows.slice(headerIndex + 1)) {
    const name = (row[nameColumn] ?? '').trim();
    const unit = (row[unitColumn] ?? '').trim();
    const price = (row[priceColumn] ?? '').trim();
    if (name && unit) output.push([name, unit, price]);
  }
  return output.length > 1 ? output : null;
}



function extractDoughProfiles(rows: string[][]): ParsedDoughProfile[] {
  const norm = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const number = (value: string): number | null => {
    const parsed = Number((value ?? '').trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const pct = (value: string): number | null => {
    const parsed = number(value);
    return parsed === null ? null : (Math.abs(parsed) <= 1 ? parsed * 100 : parsed);
  };
  const rowWithLabel = (label: string) => rows.find((row) => norm(row[1] ?? row[0] ?? '') === norm(label));
  const parameter = (label: string) => {
    const row = rowWithLabel(label);
    return row ? number(row[3] ?? '') : null;
  };
  const parameterPct = (label: string) => {
    const row = rowWithLabel(label);
    return row ? pct(row[3] ?? '') : null;
  };
  const flourHeading = rows.findIndex((row) => norm(row[1] ?? '') === 'harinas de la masa de pizza');
  const massesHeading = rows.findIndex((row) => norm(row[1] ?? '') === 'masas');
  const parameterHeading = rows.findIndex((row) => norm(row[1] ?? '') === 'parametro');
  if (flourHeading < 0 || massesHeading <= flourHeading || parameterHeading < 0) return [];

  const flours: Array<{ name: string; weight_kg: number }> = [];
  for (const row of rows.slice(flourHeading + 1, massesHeading)) {
    const rawName = (row[1] ?? '').trim();
    const weight = number(row[2] ?? '');
    if (!rawName || weight === null || weight <= 0 || norm(rawName) === 'harina total de la tanda') continue;
    const name = rawName.replace(/\s*\(resto\)\s*$/i, '').trim();
    flours.push({ name, weight_kg: weight });
  }
  const unitWeight = parameter('Peso por unidad (harina + agua)');
  const hydration = parameterPct('Hidratación total (agua ÷ harina)');
  if (!flours.length || unitWeight === null || unitWeight <= 0 || hydration === null) return [];

  const auxiliaryNames = rows.map((row) => (row[6] ?? '').trim()).filter(Boolean);
  const findAuxiliary = (pattern: RegExp) => auxiliaryNames.find((name) => pattern.test(norm(name))) ?? '';
  const yeastName = findAuxiliary(/levadura/);
  const saltName = findAuxiliary(/sal/);
  const sugarName = findAuxiliary(/azucar/);
  const oilName = findAuxiliary(/aceite/);

  const bigaFlour = parameterPct('Biga') ?? 0;
  const bigaWater = parameterPct('Agua de la biga') ?? 0;
  const bigaYeast = parameterPct('Levadura en la biga') ?? 0;
  const poolishFlour = parameterPct('Poolish') ?? 0;
  const poolishWater = parameterPct('Agua del poolish') ?? 0;
  const poolishYeast = parameterPct('Levadura en el poolish') ?? 0;
  const directYeast = parameterPct('Levadura directa') ?? 0;
  const salt = parameterPct('Sal') ?? 0;
  const sugar = parameterPct('Azúcar') ?? 0;
  const oil = parameterPct('Aceite de oliva') ?? 0;

  const profile: ParsedDoughProfile = {
    name: 'Masa',
    unit_weight_g: unitWeight,
    hydration_pct: hydration,
    flours,
    ...(bigaFlour > 0 ? { biga: { flour_pct: bigaFlour, water_pct: bigaWater, yeast_pct: bigaYeast, yeast_ingredient_name: yeastName } } : {}),
    ...(poolishFlour > 0 ? { poolish: { flour_pct: poolishFlour, water_pct: poolishWater, yeast_pct: poolishYeast, yeast_ingredient_name: yeastName } } : {}),
    ...(directYeast > 0 ? { direct_yeast_pct: directYeast, yeast_ingredient_name: yeastName } : {}),
    ...(salt > 0 ? { salt_pct: salt, salt_ingredient_name: saltName } : {}),
    ...(sugar > 0 ? { sugar_pct: sugar, sugar_ingredient_name: sugarName } : {}),
    ...(oil > 0 ? { oil_pct: oil, oil_ingredient_name: oilName } : {}),
  };
  return [profile];
}

function evaluateSafeArithmeticFormula(formula: string): string | null {
  const source = formula.trim().replace(/^=/, '');
  if (!source || !/^[0-9+*/().\s-]+$/.test(source)) return null;
  let index = 0;
  const skip = () => { while (/\s/.test(source[index] ?? '')) index += 1; };
  const number = (): number | null => {
    skip();
    const start = index;
    while (/[0-9.]/.test(source[index] ?? '')) index += 1;
    if (start === index) return null;
    const raw = source.slice(start, index);
    if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  const factor = (): number | null => {
    skip();
    if (source[index] === '+') { index += 1; return factor(); }
    if (source[index] === '-') { index += 1; const value = factor(); return value === null ? null : -value; }
    if (source[index] === '(') {
      index += 1;
      const value = expression();
      skip();
      if (source[index] !== ')') return null;
      index += 1;
      return value;
    }
    return number();
  };
  const term = (): number | null => {
    let value = factor();
    if (value === null) return null;
    while (true) {
      skip();
      const op = source[index];
      if (op !== '*' && op !== '/') break;
      index += 1;
      const rhs = factor();
      if (rhs === null || (op === '/' && rhs === 0)) return null;
      value = op === '*' ? value * rhs : value / rhs;
      if (!Number.isFinite(value)) return null;
    }
    return value;
  };
  const expression = (): number | null => {
    let value = term();
    if (value === null) return null;
    while (true) {
      skip();
      const op = source[index];
      if (op !== '+' && op !== '-') break;
      index += 1;
      const rhs = term();
      if (rhs === null) return null;
      value = op === '+' ? value + rhs : value - rhs;
      if (!Number.isFinite(value)) return null;
    }
    return value;
  };
  const result = expression();
  skip();
  return result !== null && index === source.length ? String(result) : null;
}

async function parseXlsx(buffer: ArrayBuffer): Promise<ParsedImportSheet[]> {
  const files = await unzip(buffer);
  const fileNames = Array.from(files.keys()).map((name) => name.toLowerCase());
  if (fileNames.some((name) => name.includes('vbaproject') || name.startsWith('xl/externallinks/'))) {
    throw new Error('No se admiten archivos XLSX con macros o vínculos externos');
  }
  const workbook = decodeXml(files, 'xl/workbook.xml');
  const rels = decodeXml(files, 'xl/_rels/workbook.xml.rels');
  const relationships = new Map<string, string>();

  for (const rel of Array.from(rels.getElementsByTagNameNS('*', 'Relationship'))) {
    if ((rel.getAttribute('TargetMode') ?? '').toLowerCase() === 'external') {
      throw new Error('El XLSX contiene relaciones externas y no se puede importar de forma segura');
    }
    relationships.set(rel.getAttribute('Id') ?? '', rel.getAttribute('Target') ?? '');
  }

  let sharedStrings: string[] = [];
  if (files.has('xl/sharedStrings.xml')) {
    const shared = decodeXml(files, 'xl/sharedStrings.xml');
    sharedStrings = Array.from(shared.getElementsByTagNameNS('*', 'si'))
      .map((item) => elementText(item, 't'));
  }

  const allSheetNodes = Array.from(workbook.getElementsByTagNameNS('*', 'sheet'));
  if (allSheetNodes.length > MAX_SHEETS) throw new Error(`El XLSX supera el límite seguro de ${MAX_SHEETS} hojas; no se omitieron hojas automáticamente.`);
  const sheetNodes = allSheetNodes;
  const sheets: ParsedImportSheet[] = [];
  let totalRows = 0;

  for (const sheet of sheetNodes) {
    const name = sheet.getAttribute('name') ?? `Hoja ${sheets.length + 1}`;
    const relationId =
      sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ??
      sheet.getAttribute('r:id') ??
      '';
    const target = relationships.get(relationId);
    if (!target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const document = decodeXml(files, path);
    const rows: string[][] = [];
    let hasFormulaCells = false;
    let evaluatedArithmeticFormulas = 0;
    let formulasWithoutCachedValues = 0;

    for (const rowNode of Array.from(document.getElementsByTagNameNS('*', 'row'))) {
      const values: string[] = [];
      for (const cell of Array.from(rowNode.getElementsByTagNameNS('*', 'c'))) {
        const index = columnIndex(cell.getAttribute('r') ?? '');
        if (index < 0) continue;
        const type = cell.getAttribute('t');
        const formulaNode = cell.getElementsByTagNameNS('*', 'f')[0];
        const hasFormula = Boolean(formulaNode);
        const valueNode = cell.getElementsByTagNameNS('*', 'v')[0];
        const inlineText = type === 'inlineStr' ? elementText(cell, 't') : '';
        if (!hasFormula && !valueNode?.textContent && !inlineText) continue;
        if (index >= MAX_COLUMNS) throw new Error(`El XLSX supera el límite seguro de ${MAX_COLUMNS} columnas; no se recortaron datos.`);
        if (hasFormula) hasFormulaCells = true;
        let value = valueNode?.textContent ?? '';
        if (hasFormula && !value) {
          const evaluated = evaluateSafeArithmeticFormula(formulaNode?.textContent ?? '');
          if (evaluated !== null) { value = evaluated; evaluatedArithmeticFormulas += 1; }
          else formulasWithoutCachedValues += 1;
        }
        if (type === 's' && value !== '') value = sharedStrings[Number(value)] ?? '';
        else if (type === 'inlineStr') value = inlineText;
        if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE';
        values[index] = value;
      }
      if (values.some((value) => (value ?? '').trim() !== '')) {
        if (totalRows >= MAX_ROWS) throw new Error(`El XLSX supera el límite seguro de ${MAX_ROWS} filas; no se truncó información.`);
        rows.push(Array.from({ length: values.length }, (_, index) => (values[index] ?? '').trim()));
        totalRows += 1;
      }
    }
    if (rows.length) {
      const matrixRows = normalizeRecipeMatrix(rows);
      const ingredientPriceRows = matrixRows ? null : normalizeIngredientPriceRows(rows);
      const normalizedRows = matrixRows ?? ingredientPriceRows ?? rows;
      const doughProfiles = name.toLowerCase().includes('masa') ? extractDoughProfiles(rows) : [];
      sheets.push({
        name: matrixRows
          ? `${name} — recetas normalizadas`
          : ingredientPriceRows ? `${name} — insumos normalizados` : name,
        rows: normalizedRows,
        ...(doughProfiles.length ? { doughProfiles } : {}),
        ...((hasFormulaCells || matrixRows || ingredientPriceRows || doughProfiles.length) ? { warnings: [
          ...(hasFormulaCells ? ['La hoja contiene fórmulas; se conservaron sus valores guardados y se evaluaron únicamente fórmulas aritméticas simples sin referencias externas.'] : []),
          ...(evaluatedArithmeticFormulas ? [`Se calcularon ${evaluatedArithmeticFormulas} fórmulas aritméticas simples sin valor guardado.`] : []),
          ...(formulasWithoutCachedValues ? [`Quedaron ${formulasWithoutCachedValues} fórmulas sin valor guardado que requieren revisar sus dependencias entre hojas.`] : []),
          ...(matrixRows ? ['Se detectó una matriz de recetas por producto y se normalizó a filas de ingredientes sin modificar cantidades.'] : []),
          ...(ingredientPriceRows ? ['Se detectó una tabla de precios por unidad y se normalizó para importar insumos y sus precios unitarios.'] : []),
          ...(doughProfiles.length ? ['Se detectó un perfil de masa con fórmula de panadería; se conservarán sus parámetros como subreceta calculada.'] : []),
        ] } : {}),
      });
    }
  }
  return sheets;
}

export async function parseImportFile(file: File): Promise<ParsedImportSheet[]> {
  if (file.size === 0) throw new Error('El archivo está vacío');
  if (file.size > MAX_FILE_BYTES) throw new Error('El archivo supera el límite seguro de 20 MB');
  const extension = file.name.toLowerCase().split('.').pop();

  if (extension === 'csv') {
    const sample = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    if (sample.some((byte) => byte === 0)) throw new Error('El archivo CSV parece contener datos binarios');
    const csvText = (await file.text()).replace(/^\uFEFF/, '');
    const rows = parseCsv(csvText);
    if (rows.length > MAX_ROWS) throw new Error(`El CSV supera el límite de ${MAX_ROWS} filas`);
    return [{ name: file.name, rows }];
  }
  if (extension === 'xlsx') {
    const sheets = await parseXlsx(await file.arrayBuffer());
    if (!sheets.length) throw new Error('No se encontraron hojas con datos en el XLSX');
    return sheets;
  }
  throw new Error('Formato no compatible. Usá archivos .xlsx o .csv (no se admiten macros)');
}
