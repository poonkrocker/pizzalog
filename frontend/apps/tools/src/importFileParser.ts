export interface ParsedImportSheet {
  name: string;
  rows: string[][];
  warnings?: string[];
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_SHEETS = 5;
const MAX_ROWS = 500;
const MAX_COLUMNS = 25;

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
    throw new Error('El CSV supera el límite de 25 columnas; no se recortaron datos.');
  }
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
      if (total > 8 * 1024 * 1024) {
        await reader.cancel();
        throw new Error('Una entrada interna del XLSX supera 8 MB descomprimidos');
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
  if (entryCount > 2000) throw new Error('El XLSX contiene demasiadas entradas internas');
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
    if (uncompressedSize > 8 * 1024 * 1024 || totalUncompressed > 32 * 1024 * 1024) {
      throw new Error('El XLSX supera el límite de contenido descomprimido');
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
  if (allSheetNodes.length > MAX_SHEETS) throw new Error('El XLSX supera el límite de 5 hojas; no se omitieron hojas automáticamente.');
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

    for (const rowNode of Array.from(document.getElementsByTagNameNS('*', 'row'))) {
      const values: string[] = [];
      for (const cell of Array.from(rowNode.getElementsByTagNameNS('*', 'c'))) {
        const index = columnIndex(cell.getAttribute('r') ?? '');
        if (index < 0) continue;
        if (index >= MAX_COLUMNS) throw new Error('El XLSX supera el límite de 25 columnas; no se recortaron datos.');
        const type = cell.getAttribute('t');
        if (cell.getElementsByTagNameNS('*', 'f').length > 0) hasFormulaCells = true;
        const valueNode = cell.getElementsByTagNameNS('*', 'v')[0];
        let value = valueNode?.textContent ?? '';
        if (type === 's' && value !== '') value = sharedStrings[Number(value)] ?? '';
        else if (type === 'inlineStr') value = elementText(cell, 't');
        if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE';
        values[index] = value;
      }
      if (values.some((value) => (value ?? '').trim() !== '')) {
        if (totalRows >= MAX_ROWS) throw new Error('El XLSX supera el límite de 500 filas; no se truncó información.');
        rows.push(Array.from({ length: values.length }, (_, index) => (values[index] ?? '').trim()));
        totalRows += 1;
      }
    }
    if (rows.length) sheets.push({
      name,
      rows,
      ...(hasFormulaCells ? { warnings: ['La hoja contiene fórmulas. Se leyeron únicamente los valores guardados en el archivo; no se ejecutaron fórmulas.'] } : {}),
    });
  }
  return sheets;
}

export async function parseImportFile(file: File): Promise<ParsedImportSheet[]> {
  if (file.size === 0) throw new Error('El archivo está vacío');
  if (file.size > MAX_FILE_BYTES) throw new Error('El archivo supera el límite de 8 MB');
  const extension = file.name.toLowerCase().split('.').pop();

  if (extension === 'csv') {
    const sample = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    if (sample.some((byte) => byte === 0)) throw new Error('El archivo CSV parece contener datos binarios');
    const csvText = (await file.text()).replace(/^\\uFEFF/, '');
    const rows = parseCsv(csvText);
    if (rows.length > MAX_ROWS) throw new Error('El CSV supera el límite de 500 filas');
    return [{ name: file.name, rows }];
  }
  if (extension === 'xlsx') {
    const sheets = await parseXlsx(await file.arrayBuffer());
    if (!sheets.length) throw new Error('No se encontraron hojas con datos en el XLSX');
    return sheets;
  }
  throw new Error('Formato no compatible. Usá archivos .xlsx o .csv (no se admiten macros)');
}
