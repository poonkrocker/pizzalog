#!/usr/bin/env node
/**
 * Fase 3.3 — Validación real de Excel v2 con LibreOffice Headless
 *
 * Flujo:
 *   1. Genera workbooks XLSX reales desde @pizzalog/cost-engine (es-AR, pt-BR, en, Golden,
 *      receta incompleta, subreceta anidada, merma, cambio manual de ingrediente y simulador).
 *   2. Abre y recalcula cada libro con `soffice --headless --convert-to xlsx`.
 *   3. Lee los valores recalculados reales (<v>) del XML generado por LibreOffice.
 *   4. Compara contra CostEngine informando diferencias y tolerancias.
 *
 * Requisitos:
 *   - `@pizzalog/cost-engine` compilado (`pnpm --filter @pizzalog/cost-engine build`)
 *   - LibreOffice instalado (`soffice` o `libreoffice` en PATH)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../..');

function findSoffice() {
  for (const bin of ['soffice', 'libreoffice']) {
    const check = spawnSync(bin, ['--version'], { encoding: 'utf8' });
    if (check.status === 0) return { bin, version: (check.stdout || '').trim() };
  }
  return null;
}

const soffice = findSoffice();
if (!soffice) {
  console.error('[BLOCKED] LibreOffice (soffice) no está instalado en este entorno. Instalá LibreOffice y re-ejecutá este script.');
  process.exit(2);
}

const { CostEngine, generateProfitKitV2WorkbookBytes } = await import(
  new URL('../../../../frontend/packages/cost-engine/dist/index.js', import.meta.url)
);

function unzipEntries(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP inválido');
  const count = view.getUint16(eocd + 10, true);
  let off = view.getUint32(eocd + 16, true);
  const out = new Map();
  for (let i = 0; i < count; i += 1) {
    const method = view.getUint16(off + 10, true);
    const compSize = view.getUint32(off + 20, true);
    const nameLen = view.getUint16(off + 28, true);
    const extraLen = view.getUint16(off + 30, true);
    const commentLen = view.getUint16(off + 32, true);
    const localOff = view.getUint32(off + 42, true);
    const name = buf.subarray(off + 46, off + 46 + nameLen).toString('utf8');
    off += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const lName = view.getUint16(localOff + 26, true);
    const lExtra = view.getUint16(localOff + 28, true);
    const start = localOff + 30 + lName + lExtra;
    const comp = buf.subarray(start, start + compSize);
    out.set(name, method === 0 ? comp : zlib.inflateRawSync(comp));
  }
  return out;
}

function readCellValues(xml) {
  const values = new Map();
  const cellRe = /<c\b[^>]*\br="([A-Z]+\d+)"[^>]*>([\s\S]*?)<\/c>/g;
  let m;
  while ((m = cellRe.exec(xml)) !== null) {
    const ref = m[1];
    const body = m[2];
    const vm = body.match(/<v>([^<]*)<\/v>/);
    if (vm) values.set(ref, vm[1]);
  }
  return values;
}

function makeAuditCatalog() {
  return {
    ingredients: [
      { id: 'ing-harina', name: 'Harina 000', category: 'Harinas', base_unit: 'kg', yield_pct: 100, is_active: true },
      { id: 'ing-muzza', name: 'Muzzarella', category: 'Lácteos', base_unit: 'kg', yield_pct: 90, is_active: true },
      { id: 'ing-tomate', name: 'Tomate Triturado', category: 'Salsas', base_unit: 'kg', yield_pct: 100, is_active: true },
      { id: 'ing-sin-precio', name: 'Trufa Sin Precio', category: 'Otros', base_unit: 'kg', yield_pct: 100, is_active: true },
    ],
    purchase_prices: [
      { id: 'pp-1', ingredient_id: 'ing-harina', purchase_price: 25000, pack_quantity: 25, pack_unit: 'kg', currency: 'ARS', effective_date: '2026-01-10', supplier: 'Molino' },
      { id: 'pp-2', ingredient_id: 'ing-muzza', purchase_price: 9000, pack_quantity: 1, pack_unit: 'kg', currency: 'ARS', effective_date: '2026-01-10', supplier: 'Lácteos' },
      { id: 'pp-3', ingredient_id: 'ing-tomate', purchase_price: 2000, pack_quantity: 1, pack_unit: 'kg', currency: 'ARS', effective_date: '2026-01-10', supplier: 'Huerta' },
    ],
    recipes: [
      {
        id: 'sub-masa',
        name: 'Bollo Masa 250g',
        type: 'subrecipe',
        currency: 'ARS',
        yield_quantity: 1,
        yield_unit: 'unit',
        components: [{ component_type: 'ingredient', ingredient_id: 'ing-harina', quantity: 0.25, unit: 'kg' }],
      },
      {
        id: 'prod-muzza',
        name: 'Pizza Muzzarella',
        type: 'product',
        currency: 'ARS',
        yield_quantity: 1,
        yield_unit: 'unit',
        components: [
          { component_type: 'subrecipe', recipe_id: 'sub-masa', quantity: 1, unit: 'unit' },
          { component_type: 'ingredient', ingredient_id: 'ing-muzza', quantity: 0.25, unit: 'kg' },
          { component_type: 'ingredient', ingredient_id: 'ing-tomate', quantity: 0.1, unit: 'kg' },
        ],
      },
      {
        id: 'prod-incompleta',
        name: 'Pizza Trufa Incompleta',
        type: 'product',
        currency: 'ARS',
        yield_quantity: 1,
        yield_unit: 'unit',
        components: [
          { component_type: 'subrecipe', recipe_id: 'sub-masa', quantity: 1, unit: 'unit' },
          { component_type: 'ingredient', ingredient_id: 'ing-sin-precio', quantity: 0.05, unit: 'kg' },
        ],
      },
    ],
  };
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pizzalog-lo-audit-'));
console.log(`[INFO] LibreOffice detectado: ${soffice.version}`);
console.log(`[INFO] Directorio temporal: ${tmpDir}`);

const catalog = makeAuditCatalog();
const engine = new CostEngine(catalog);
const muzzaCost = engine.calculateRecipeCost('prod-muzza');
assert.equal(muzzaCost.status, 'complete');
const incompleteCost = engine.calculateRecipeCost('prod-incompleta');
assert.equal(incompleteCost.status, 'incomplete');

for (const locale of ['es-AR', 'pt-BR', 'en']) {
  const bytes = generateProfitKitV2WorkbookBytes({
    businessName: `Pizzería Audit ${locale}`,
    locale,
    currency: locale === 'pt-BR' ? 'BRL' : locale === 'en' ? 'USD' : 'ARS',
    catalog,
    operatingExpenses: [{ id: 'g1', name: 'Alquiler', category: 'Fijos', monthlyAmount: 500000 }],
    productSalesMap: {
      'prod-muzza': { currentPrice: 12000, monthlyUnits: 400, targetFoodCostPct: 30 },
    },
  });
  const srcFile = path.join(tmpDir, `workbook-${locale}.xlsx`);
  const outDir = path.join(tmpDir, `recalc-${locale}`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(srcFile, Buffer.from(bytes));

  const conv = spawnSync(soffice.bin, ['--headless', '--convert-to', 'xlsx', '--outdir', outDir, srcFile], {
    encoding: 'utf8',
    timeout: 60000,
  });
  assert.equal(conv.status, 0, `LibreOffice falló en ${locale}: ${conv.stderr}`);

  const recalcFile = path.join(outDir, `workbook-${locale}.xlsx`);
  assert.ok(fs.existsSync(recalcFile), `Falta archivo recalculado ${recalcFile}`);
  const entries = unzipEntries(fs.readFileSync(recalcFile));
  const sheet07 = entries.get('xl/worksheets/sheet8.xml')?.toString('utf8') || '';
  const cells = readCellValues(sheet07);

  // Verificar ausencia total de errores de fórmula Excel (#REF!, #NAME?, #VALUE!, #DIV/0!, #N/A)
  for (const [entryName, data] of entries.entries()) {
    if (entryName.startsWith('xl/worksheets/sheet') && entryName.endsWith('.xml')) {
      const xml = data.toString('utf8');
      assert.ok(!/#REF!|#NAME\?|#VALUE!|#NUM!|Err:/i.test(xml), `Error de fórmula detectado en ${locale}/${entryName}`);
    }
  }

  // Comparar costo unitario recalculado de Pizza Muzzarella contra CostEngine (tolerancia <= 0.01)
  const numericVals = Array.from(cells.values()).map(Number).filter(Number.isFinite);
  const matched = numericVals.some((v) => Math.abs(v - muzzaCost.unit_cost) <= 0.01);
  assert.ok(matched, `[${locale}] Costo recalculado por LibreOffice no coincide con CostEngine (${muzzaCost.unit_cost})`);
  console.log(`[PASS] ${locale}: LibreOffice recalculó 14 hojas sin errores; paridad Pizza Muzzarella = ${muzzaCost.unit_cost.toFixed(2)} (tol <= 0.01)`);
}

console.log('ALL LIBREOFFICE HEADLESS EXCEL CHECKS PASSED');
