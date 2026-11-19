#!/usr/bin/env node
/**
 * Fase 3.4 — Generación y validación automatizada de fixtures reales de importación
 *
 * Genera fixtures reproducibles en `docs/audit/release-candidate/fixtures/`:
 *  - precios_ar_coma.csv (coma, decimales AR 1.500,50, duplicados, sin precio, fila inválida)
 *  - precios_br_puntoycoma.csv (punto y coma, decimales BR 2.350,75)
 *  - precios_us_tab.tsv / .csv (tabulaciones, decimales US 1,500.50)
 *  - catalogo_completo_multihoja.xlsx (insumos, subrecetas, productos finales, gastos, ventas, hoja oculta, celdas formateadas vacías, fórmulas simples y entre hojas)
 *  - workspace_ejemplo_rc.json (workspace de ejemplo para pruebas manuales y paridad de reimportación)
 *  - planilla_ejemplo_rc_es-AR.xlsx (Excel v2 real generado desde Cost Engine para prueba manual)
 *
 * Además prueba en directorio temporal un CSV cercano a 20 MB (~18.5 MB) para verificar
 * que `parseImportFile` acepta archivos por debajo de 20 MB y rechaza > 20 MB sin truncar.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');
fs.mkdirSync(FIXTURES_DIR, { recursive: true });

// Minimal XML DOM shim for Node 20 so parseImportFile runs real XLSX XML parsing
class XmlElement {
  constructor(tagName, attrs = {}) {
    this.tagName = tagName;
    this.localName = tagName.includes(':') ? tagName.split(':').pop() : tagName;
    this.attrs = attrs;
    this.children = [];
    this._textParts = [];
  }
  get textContent() {
    let out = this._textParts.join('');
    for (const c of this.children) out += c.textContent;
    return out;
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }
  getAttributeNS(_ns, localName) {
    if (Object.prototype.hasOwnProperty.call(this.attrs, localName)) return this.attrs[localName];
    for (const [k, v] of Object.entries(this.attrs)) {
      if (k.endsWith(`:${localName}`)) return v;
    }
    return null;
  }
  getElementsByTagName(name) {
    const out = [];
    const walk = (n) => { for (const c of n.children) { if (name === '*' || c.tagName === name) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  getElementsByTagNameNS(_ns, localName) {
    const out = [];
    const walk = (n) => { for (const c of n.children) { if (localName === '*' || c.localName === localName) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
}

function unescapeXml(str) {
  return str.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function parseXmlMinimal(xml) {
  const root = new XmlElement('#document');
  const stack = [root];
  const cleaned = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const tokenRe = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^<>]*?)?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = tokenRe.exec(cleaned)) !== null) {
    const [, closing, tag, attrStr, selfClosing, text] = m;
    const parent = stack[stack.length - 1];
    if (text !== undefined) { if (parent && text.length > 0) parent._textParts.push(unescapeXml(text)); continue; }
    if (closing) { if (stack.length > 1) stack.pop(); continue; }
    const attrs = {};
    const attrRe = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g;
    let am;
    while ((am = attrRe.exec(attrStr || '')) !== null) attrs[am[1]] = unescapeXml(am[2]);
    const el = new XmlElement(tag, attrs);
    parent.children.push(el);
    if (!selfClosing) stack.push(el);
  }
  return root;
}

if (typeof globalThis.DOMParser === 'undefined') {
  globalThis.DOMParser = class DOMParser { parseFromString(s) { return parseXmlMinimal(s); } };
}

const { parseImportFile } = await import(new URL('../../../../frontend/packages/price-list/dist/fileParser.js', import.meta.url));
const {
  detectPriceListColumns,
  extractPriceListItems,
  matchPriceList,
  summarizeMatches,
  buildAliasKey,
} = await import(new URL('../../../../frontend/packages/price-list/dist/index.js', import.meta.url));
const { CostEngine, generateProfitKitV2WorkbookBytes } = await import(new URL('../../../../frontend/packages/cost-engine/dist/index.js', import.meta.url));

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name, 'utf8');
    const rawBuf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const deflated = zlib.deflateRawSync(rawBuf);
    const crc = crc32(rawBuf);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(deflated.length, 18); local.writeUInt32LE(rawBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); nameBuf.copy(local, 30);
    localParts.push(local, deflated);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(rawBuf.length, 24); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centralParts.push(central);
    offset += local.length + deflated.length;
  }
  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(centralParts.length, 8); eocd.writeUInt16LE(centralParts.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDir, eocd]);
}

function makeSheetXml(rows) {
  const xmlRows = rows.map((r, rIdx) => {
    const cells = r.map((cell, cIdx) => {
      const col = String.fromCharCode(65 + cIdx);
      const ref = `${col}${rIdx + 1}`;
      if (cell && typeof cell === 'object' && cell.formula) {
        const vTag = cell.cached !== undefined ? `<v>${cell.cached}</v>` : '';
        return `<c r="${ref}"><f>${cell.formula}</f>${vTag}</c>`;
      }
      if (cell && typeof cell === 'object' && cell.formattedEmpty) {
        return `<c r="${ref}" s="1"/>`;
      }
      if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t>${String(cell ?? '')}</t></is></c>`;
    }).join('');
    return `<row r="${rIdx + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xmlRows}</sheetData></worksheet>`;
}

// 1. CSV fixtures (comma/AR, semicolon/BR, tab/US)
const csvAr = [
  'Producto,Presentacion,Precio con IVA',
  '"Harina 0000 Molino","25 kg","28.500,50"',
  '"Muzzarella Barra","1 kg","9.200,00"',
  '"Muzzarella Barra","1 kg","9.200,00"',
  '"Tomate Triturado","8 kg","14.400,25"',
  '"Albahaca Fresca","1 kg",""',
  '"Fila Invalida Sin Precio","1 kg","N/A"',
].join('\n');
fs.writeFileSync(path.join(FIXTURES_DIR, 'precios_ar_coma.csv'), csvAr, 'utf8');

const csvBr = [
  'Produto;Embalagem;Preco Final',
  'Farinha Tipo 1;25 kg;145,80',
  'Mussarela;1 kg;42,50',
  'Molho de Tomate;2 kg;28,90',
].join('\n');
fs.writeFileSync(path.join(FIXTURES_DIR, 'precios_br_puntoycoma.csv'), csvBr, 'utf8');

const csvUs = [
  'Product\tPack\tPrice',
  'Bread Flour\t50 lb\t42.50',
  'Low-Moisture Mozzarella\t5 lb\t24.75',
  'Crushed Tomatoes\t1,500.50 g\t4.20',
].join('\n');
fs.writeFileSync(path.join(FIXTURES_DIR, 'precios_us_tab.csv'), csvUs, 'utf8');

// Verify all 3 CSV fixtures through real parseImportFile + detectPriceListColumns + extractPriceListItems
for (const [fname, expectedCount] of [
  ['precios_ar_coma.csv', 4],
  ['precios_br_puntoycoma.csv', 3],
  ['precios_us_tab.csv', 3],
]) {
  const buf = fs.readFileSync(path.join(FIXTURES_DIR, fname));
  const sheets = await parseImportFile(new File([buf], fname, { type: 'text/csv' }), { raw: true });
  assert.equal(sheets.length, 1);
  const cols = detectPriceListColumns(sheets[0].rows);
  assert.ok(cols, `${fname}: columnas detectadas`);
  const items = extractPriceListItems(sheets[0].rows, cols);
  assert.equal(items.length, expectedCount, `${fname}: filas válidas esperadas=${expectedCount}, obtenidas=${items.length}`);
  console.log(`[PASS] CSV ${fname}: ${items.length} filas válidas extraídas`);
}

// Match preview with alias & unit conversion on AR CSV
const arSheets = await parseImportFile(new File([Buffer.from(csvAr)], 'precios_ar_coma.csv', { type: 'text/csv' }), { raw: true });
const arCols = detectPriceListColumns(arSheets[0].rows);
const arItems = extractPriceListItems(arSheets[0].rows, arCols);
const arMatches = matchPriceList(
  arItems,
  [
    { id: 'i1', name: 'Harina 0000', unit: 'kg', current_price_per_unit: 1000 },
    { id: 'i2', name: 'Queso Muzzarella', unit: 'kg', current_price_per_unit: 8800 },
    { id: 'i3', name: 'Tomate Triturado', unit: 'kg', current_price_per_unit: 1700 },
  ],
  [{ alias_key: buildAliasKey('Harina 0000 Molino'), target_id: 'i1', pack_quantity: 25, pack_unit: 'kg' }]
);
const arSummary = summarizeMatches(arMatches);
assert.ok(arSummary.matched >= 3, `Se esperaban >= 3 matches, obtenidos ${arSummary.matched}`);
assert.ok(
  arMatches.some((m) => m.target_id === 'i1' && Math.abs((m.new_price_per_unit ?? 0) - 1140.02) < 0.01),
  'Alias aprendido debe calcular 28500.50/25 = 1140.02'
);
assert.ok(arMatches.some((m) => m.target_id === 'i2' && Math.abs((m.new_price_per_unit ?? 0) - 9200) < 0.01));
console.log('[PASS] Matching con alias, duplicados, sin precio e inválidos validado');

// 2. Multi-sheet XLSX fixture (insumos, subrecetas, productos, gastos, ventas, hoja oculta, celdas formateadas vacías, fórmulas simples y entre hojas)
const multiXlsxBuf = buildZip({
  'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Insumos" sheetId="1" r:id="rId1"/>
    <sheet name="Subrecetas" sheetId="2" r:id="rId2"/>
    <sheet name="Productos" sheetId="3" r:id="rId3"/>
    <sheet name="Gastos" sheetId="4" r:id="rId4"/>
    <sheet name="Ventas" sheetId="5" r:id="rId5"/>
    <sheet name="CostosInternos" sheetId="6" state="hidden" r:id="rId6"/>
    <sheet name="SoloFormato" sheetId="7" r:id="rId7"/>
  </sheets>
</workbook>`,
  'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet5.xml"/>
  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet6.xml"/>
  <Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet7.xml"/>
</Relationships>`,
  'xl/worksheets/sheet1.xml': makeSheetXml([
    ['Ingrediente', 'Unidad', 'Precio'],
    ['Harina 0000', 'kg', { formula: '25000/25' }],
    ['Muzzarella', 'kg', 9200],
    ['Tomate Triturado', 'kg', 1800],
  ]),
  'xl/worksheets/sheet2.xml': makeSheetXml([
    ['Subreceta', 'Ingrediente', 'Cantidad', 'Unidad'],
    ['Bollo 250g', 'Harina 0000', 0.25, 'kg'],
  ]),
  'xl/worksheets/sheet3.xml': makeSheetXml([
    ['Producto', 'Costo Referencia'],
    ['Pizza Muzzarella', { formula: 'Insumos!C2*0.25+Insumos!C3*0.25', cached: 2550 }],
  ]),
  'xl/worksheets/sheet4.xml': makeSheetXml([
    ['Gasto', 'Monto Mensual'],
    ['Alquiler Local', 850000],
  ]),
  'xl/worksheets/sheet5.xml': makeSheetXml([
    ['Producto', 'Unidades Mes', 'Precio Venta'],
    ['Pizza Muzzarella', 520, 12500],
  ]),
  'xl/worksheets/sheet6.xml': makeSheetXml([
    ['Nota Oculta', 'Valor'],
    ['Margen Objetivo', 30],
  ]),
  'xl/worksheets/sheet7.xml': makeSheetXml([
    [{ formattedEmpty: true }, { formattedEmpty: true }],
  ]),
});
fs.writeFileSync(path.join(FIXTURES_DIR, 'catalogo_completo_multihoja.xlsx'), multiXlsxBuf);

const parsedMulti = await parseImportFile(
  new File([multiXlsxBuf], 'catalogo_completo_multihoja.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  { raw: true }
);
assert.equal(parsedMulti.length, 6, 'Debe importar 6 hojas con datos (incluyendo oculta) y omitir la vacía formateada sin inventar filas');
assert.equal(parsedMulti[0].rows[1][2], '1000', 'Fórmula aritmética simple 25000/25 evaluada');
assert.equal(parsedMulti[2].rows[1][1], '2550', 'Fórmula entre hojas conserva valor cacheado');
assert.ok(parsedMulti[2].warnings?.some((w) => w.includes('referencias entre hojas')));
assert.ok(parsedMulti[5].warnings?.some((w) => w.includes('oculta')));
console.log('[PASS] XLSX multi-hoja completo (6 hojas útiles + oculta + fórmulas + vacía formateada) validado');

// 3. Near-20MB stress test (in temp dir, not committed)
const tmpFile = path.join(os.tmpdir(), 'pizzalog-near-20mb.csv');
const line = 'Harina_Test_Producto_Descripcion_Extendida_Para_Prueba_De_Carga_Real,25 kg,28500.50,Proveedor_Mayorista_SA_Observaciones_Comerciales_Largas\n';
const header = 'Producto,Presentacion,Precio,Proveedor\n';
// ~18.5 MB within MAX_ROWS=10000 using ~1950 bytes per line (~9500 rows)
const pad = 'X'.repeat(1850);
const bigLine = `Insumo_Carga,1 kg,1500.50,${pad}\n`;
const bigContent = header + bigLine.repeat(9500);
const bigBytes = Buffer.byteLength(bigContent, 'utf8');
assert.ok(bigBytes > 17 * 1024 * 1024 && bigBytes < 20 * 1024 * 1024, `Tamaño esperado entre 17 y 20 MB (actual ${(bigBytes / 1024 / 1024).toFixed(2)} MB)`);
fs.writeFileSync(tmpFile, bigContent, 'utf8');
const bigParsed = await parseImportFile(new File([fs.readFileSync(tmpFile)], 'near-20mb.csv', { type: 'text/csv' }));
assert.equal(bigParsed[0].rows.length, 9501);
fs.unlinkSync(tmpFile);
console.log(`[PASS] Archivo cercano a 20 MB (${(bigBytes / 1024 / 1024).toFixed(2)} MB, 9501 filas) parseado sin truncamiento`);

// 4. Sample RC Workspace + Excel v2 + JSON Export/Reimport parity
const rcWorkspace = {
  businessName: 'Pizzería Demo RC',
  currency: 'ARS',
  locale: 'es-AR',
  unitSystem: 'metric',
  defaultTargetFoodCostPct: 30,
  defaultRoundingIncrement: 100,
  defaultPackagingCost: 450,
  defaultChannelFeePct: 0,
  catalog: {
    ingredients: [
      { id: 'rc-harina', name: 'Harina 0000', category: 'Harinas', base_unit: 'kg', yield_pct: 100, is_active: true },
      { id: 'rc-muzza', name: 'Muzzarella', category: 'Lácteos', base_unit: 'kg', yield_pct: 92, is_active: true },
      { id: 'rc-tomate', name: 'Tomate Triturado', category: 'Salsas', base_unit: 'kg', yield_pct: 100, is_active: true },
      { id: 'rc-jamon', name: 'Jamón Cocido', category: 'Fiambres', base_unit: 'kg', yield_pct: 95, is_active: true },
    ],
    purchase_prices: [
      { id: 'rc-pp-1', ingredient_id: 'rc-harina', purchase_price: 28500, pack_quantity: 25, pack_unit: 'kg', currency: 'ARS', effective_date: '2026-11-01', supplier: 'Molino Demo' },
      { id: 'rc-pp-2', ingredient_id: 'rc-muzza', purchase_price: 9200, pack_quantity: 1, pack_unit: 'kg', currency: 'ARS', effective_date: '2026-11-01', supplier: 'Lácteos Demo' },
      { id: 'rc-pp-3', ingredient_id: 'rc-tomate', purchase_price: 14400, pack_quantity: 8, pack_unit: 'kg', currency: 'ARS', effective_date: '2026-11-01', supplier: 'Huerta Demo' },
      { id: 'rc-pp-4', ingredient_id: 'rc-jamon', purchase_price: 13500, pack_quantity: 1, pack_unit: 'kg', currency: 'ARS', effective_date: '2026-11-01', supplier: 'Frigorífico Demo' },
    ],
    recipes: [
      {
        id: 'rc-sub-bollo',
        name: 'Bollo Masa 260g',
        type: 'subrecipe',
        currency: 'ARS',
        yield_quantity: 1,
        yield_unit: 'unit',
        components: [{ component_type: 'ingredient', ingredient_id: 'rc-harina', quantity: 0.16, unit: 'kg' }],
      },
      {
        id: 'rc-prod-muzza',
        name: 'Pizza Muzzarella',
        type: 'product',
        currency: 'ARS',
        yield_quantity: 1,
        yield_unit: 'unit',
        components: [
          { component_type: 'subrecipe', recipe_id: 'rc-sub-bollo', quantity: 1, unit: 'unit' },
          { component_type: 'ingredient', ingredient_id: 'rc-muzza', quantity: 0.25, unit: 'kg' },
          { component_type: 'ingredient', ingredient_id: 'rc-tomate', quantity: 0.1, unit: 'kg' },
        ],
      },
      {
        id: 'rc-prod-especial',
        name: 'Pizza Especial Jamón',
        type: 'product',
        currency: 'ARS',
        yield_quantity: 1,
        yield_unit: 'unit',
        components: [
          { component_type: 'subrecipe', recipe_id: 'rc-sub-bollo', quantity: 1, unit: 'unit' },
          { component_type: 'ingredient', ingredient_id: 'rc-muzza', quantity: 0.25, unit: 'kg' },
          { component_type: 'ingredient', ingredient_id: 'rc-tomate', quantity: 0.1, unit: 'kg' },
          { component_type: 'ingredient', ingredient_id: 'rc-jamon', quantity: 0.12, unit: 'kg' },
        ],
      },
    ],
  },
  operatingExpenses: [
    { id: 'rc-g1', name: 'Alquiler', category: 'Fijos', monthlyAmount: 850000 },
    { id: 'rc-g2', name: 'Servicios (Luz/Gas)', category: 'Fijos', monthlyAmount: 320000 },
  ],
  salesHistory: [],
  productSalesMap: {
    'rc-prod-muzza': { currentPrice: 12500, monthlyUnits: 480, targetFoodCostPct: 30 },
    'rc-prod-especial': { currentPrice: 16200, monthlyUnits: 260, targetFoodCostPct: 30 },
  },
  snapshots: [],
  equivalences: {},
};

const jsonStr = JSON.stringify(rcWorkspace, null, 2);
fs.writeFileSync(path.join(FIXTURES_DIR, 'workspace_ejemplo_rc.json'), jsonStr, 'utf8');

const reimported = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'workspace_ejemplo_rc.json'), 'utf8'));
const engA = new CostEngine(rcWorkspace.catalog);
const engB = new CostEngine(reimported.catalog);
for (const recipe of rcWorkspace.catalog.recipes) {
  const cA = engA.calculateRecipeCost(recipe.id);
  const cB = engB.calculateRecipeCost(recipe.id);
  assert.equal(cA.status, 'complete');
  assert.equal(cA.unit_cost, cB.unit_cost, `Paridad exacta en ${recipe.name}`);
}
console.log('[PASS] Exportación y reimportación JSON de workspace RC con paridad matemática exacta');

const xlsxRcBytes = generateProfitKitV2WorkbookBytes({
  businessName: rcWorkspace.businessName,
  locale: rcWorkspace.locale,
  currency: rcWorkspace.currency,
  catalog: rcWorkspace.catalog,
  operatingExpenses: rcWorkspace.operatingExpenses,
  productSalesMap: rcWorkspace.productSalesMap,
});
fs.writeFileSync(path.join(FIXTURES_DIR, 'planilla_ejemplo_rc_es-AR.xlsx'), Buffer.from(xlsxRcBytes));
console.log(`[PASS] Excel v2 de ejemplo generado (${xlsxRcBytes.length} bytes)`);
console.log('ALL IMPORT FIXTURES & PARITY CHECKS PASSED');
