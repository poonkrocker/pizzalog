import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as costEnginePkg from '../dist/index.js';
import * as priceListPkg from '../../price-list/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

function loadToolsTsModule(relPathFromToolsSrc, cache = new Map()) {
  const fullPath = path.resolve(REPO_ROOT, 'frontend/apps/tools/src', relPathFromToolsSrc);
  if (cache.has(fullPath)) return cache.get(fullPath);

  const source = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  const moduleObj = { exports: {} };
  cache.set(fullPath, moduleObj.exports);

  const customRequire = (id) => {
    if (id === '@pizzalog/cost-engine') return costEnginePkg;
    if (id === '@pizzalog/price-list') return priceListPkg;
    if (id.startsWith('./')) {
      const targetRel = id.endsWith('.ts') ? id : `${id}.ts`;
      return loadToolsTsModule(path.join(path.dirname(relPathFromToolsSrc), targetRel), cache);
    }
    throw new Error(`Unsupported require in test loader: ${id}`);
  };

  const fn = new Function('exports', 'require', 'module', transpiled);
  fn(moduleObj.exports, customRequire, moduleObj);
  cache.set(fullPath, moduleObj.exports);
  return moduleObj.exports;
}

const { TOOLS_I18N, AUTH_I18N } = loadToolsTsModule('i18n.ts');
const {
  CostEngine,
  computeUsableIngredientCost,
  formatCalendarDate,
  formatHistoricalDateTime,
  formatLocaleNumber,
  formatMoney,
  generateProfitKitV2WorkbookBytes,
  parseLocaleNumber,
  todayLocalDateString,
  toLocalIsoTimestamp,
} = costEnginePkg;

function extractZipTextEntries(zipBytes) {
  const buf = Buffer.from(zipBytes);
  const entries = {};
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataStart = offset + 30 + nameLen + extraLen;
    const dataEnd = dataStart + compSize;
    entries[name] = buf.subarray(dataStart, dataEnd).toString('utf8');
    offset = dataEnd;
  }
  return entries;
}

test('Bloque 6 (Tareas 6.1 a 6.6): Internacionalización completa, formatos numéricos, monedas explícitas, métrico vs US y fechas locales', async (t) => {
  await t.test('Tareas 6.1 y 6.2: Diccionarios es-AR, pt-BR y en tienen paridad exacta de claves y traducciones reales (UI y Excel v2)', () => {
    const baseToolsKeys = Object.keys(TOOLS_I18N['es-AR']).sort();
    const baseAuthKeys = Object.keys(AUTH_I18N['es-AR']).sort();

    for (const loc of ['es-AR', 'pt-BR', 'en']) {
      assert.deepEqual(Object.keys(TOOLS_I18N[loc]).sort(), baseToolsKeys, `TOOLS_I18N[${loc}] debe tener exactamente las mismas claves`);
      assert.deepEqual(Object.keys(AUTH_I18N[loc]).sort(), baseAuthKeys, `AUTH_I18N[${loc}] debe tener exactamente las mismas claves`);
      for (const k of baseToolsKeys) {
        assert.equal(typeof TOOLS_I18N[loc][k], 'string');
        assert.ok(TOOLS_I18N[loc][k].trim().length > 0, `TOOLS_I18N[${loc}].${k} no debe estar vacío`);
      }
      for (const k of baseAuthKeys) {
        assert.equal(typeof AUTH_I18N[loc][k], 'string');
        assert.ok(AUTH_I18N[loc][k].trim().length > 0, `AUTH_I18N[${loc}].${k} no debe estar vacío`);
      }
    }

    // Verificar que las versiones EN y PT-BR realmente están traducidas en pantalla clave:
    assert.notEqual(TOOLS_I18N.en.tabIngredients, TOOLS_I18N['es-AR'].tabIngredients);
    assert.notEqual(TOOLS_I18N['pt-BR'].tabIngredients, TOOLS_I18N['es-AR'].tabIngredients);
    assert.notEqual(TOOLS_I18N.en.ingTitle, TOOLS_I18N['es-AR'].ingTitle);
    assert.notEqual(TOOLS_I18N['pt-BR'].ingTitle, TOOLS_I18N['es-AR'].ingTitle);
    assert.notEqual(AUTH_I18N.en.signInBtn, AUTH_I18N['es-AR'].signInBtn);
    assert.notEqual(AUTH_I18N['pt-BR'].signInBtn, AUTH_I18N['es-AR'].signInBtn);

    // Verificar que ningún componente UI mantenga textos críticos sin i18n:
    const appSrc = fs.readFileSync(path.resolve(REPO_ROOT, 'frontend/apps/tools/src/App.tsx'), 'utf8');
    const helpSrc = fs.readFileSync(path.resolve(REPO_ROOT, 'frontend/apps/tools/src/ContextualHelpModal.tsx'), 'utf8');
    const reportSrc = fs.readFileSync(path.resolve(REPO_ROOT, 'frontend/apps/tools/src/ExecutiveReportModal.tsx'), 'utf8');
    assert.doesNotMatch(appSrc, /IMPORT_FIELD_LABELS/, 'App.tsx debe usar getImportFieldLabels(t) traducible');
    assert.match(helpSrc, /'pt-BR'/, 'ContextualHelpModal debe soportar pt-BR');
    assert.match(helpSrc, /\ben\b/, 'ContextualHelpModal debe soportar en');
    assert.match(reportSrc, /formatLocaleNumber/, 'ExecutiveReportModal debe usar formatLocaleNumber');
    assert.match(reportSrc, /formatCalendarDate/, 'ExecutiveReportModal debe usar formatCalendarDate');

    // Verificar Excel v2 generado en los 3 idiomas (sin fuga de idioma incorrecto en nombres de hojas):
    const emptyCatalog = { ingredients: [], purchase_prices: [], recipes: [] };
    const wbEs = extractZipTextEntries(generateProfitKitV2WorkbookBytes({ locale: 'es-AR', currency: 'ARS', unitSystem: 'metric', catalog: emptyCatalog }))['xl/workbook.xml'];
    const wbPt = extractZipTextEntries(generateProfitKitV2WorkbookBytes({ locale: 'pt-BR', currency: 'BRL', unitSystem: 'metric', catalog: emptyCatalog }))['xl/workbook.xml'];
    const wbEn = extractZipTextEntries(generateProfitKitV2WorkbookBytes({ locale: 'en', currency: 'USD', unitSystem: 'us_customary', catalog: emptyCatalog }))['xl/workbook.xml'];
    assert.match(wbEs, /02_Ingredientes_Presentaciones/);
    assert.match(wbPt, /02_Ingredientes_Apresentacoes/);
    assert.match(wbEn, /02_Ingredients_Presentations/);
    assert.doesNotMatch(wbEn, /02_Ingredientes/);
  });

  await t.test('Tarea 6.3: Parseo y formateo numérico regional 1.500,50 (es-AR / pt-BR) y 1,500.50 (en)', () => {
    assert.equal(formatLocaleNumber(1500.5, 'es-AR', 2), '1.500,50');
    assert.equal(formatLocaleNumber(1500.5, 'pt-BR', 2), '1.500,50');
    assert.equal(formatLocaleNumber(1500.5, 'en', 2), '1,500.50');

    assert.equal(formatMoney(25000.75, 'ARS', 'es-AR', 2), 'ARS 25.000,75');
    assert.equal(formatMoney(25000.75, 'USD', 'en', 2), 'USD 25,000.75');

    assert.equal(parseLocaleNumber('1.500,50'), 1500.5);
    assert.equal(parseLocaleNumber('1,500.50'), 1500.5);
    assert.equal(parseLocaleNumber('$ 25.000,00'), 25000);
    assert.equal(parseLocaleNumber('R$ 1.234,56'), 1234.56);
    assert.equal(parseLocaleNumber('USD 1,234.56'), 1234.56);
    assert.equal(parseLocaleNumber('1.500', 'comma'), 1500);
    assert.equal(parseLocaleNumber('1,500', 'dot'), 1500);
    assert.equal(parseLocaleNumber('texto inválido'), null);
  });

  await t.test('Tarea 6.4: Monedas distintas nunca realizan conversión implícita 1:1 y requieren ExchangeRate explícito', () => {
    const ingUsd = { id: 'trufa', name: 'Trufa Importada', base_dimension: 'mass', base_unit: 'g', is_active: true };
    const priceUsd = { ingredient_id: 'trufa', purchase_price: 100, currency: 'USD', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 };

    // Sin tipo de cambio debe fallar explícitamente (NO multiplicar x1 silencioso):
    assert.throws(
      () => computeUsableIngredientCost(ingUsd, priceUsd, 'ARS', []),
      /exchange rate|tipo de cambio|USD.*ARS/i
    );

    const catalogNoFx = {
      ingredients: [ingUsd],
      purchase_prices: [priceUsd],
      recipes: [{
        id: 'rec_t',
        name: 'Pizza Trufa',
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        currency: 'ARS',
        components: [{ component_type: 'ingredient', ingredient_id: 'trufa', quantity: 10, unit: 'g' }],
      }],
    };
    assert.throws(
      () => new CostEngine(catalogNoFx).calculateRecipeCost('rec_t'),
      /tipo de cambio|CURRENCY_MISMATCH|USD -> ARS/i
    );

    // Con tipo de cambio explícito 1 USD = 1100 ARS => 1kg USD 100 = ARS 110.000 => 10g = ARS 1.100:
    const resWithFx = new CostEngine({
      ...catalogNoFx,
      exchange_rates: [{ from_currency: 'USD', to_currency: 'ARS', rate: 1100, effective_date: '2026-11-18' }],
    }).calculateRecipeCost('rec_t');
    assert.equal(resWithFx.status, 'complete');
    assert.ok(Math.abs((resWithFx.raw_unit_cost ?? 0) - 1100) < 0.001);

    // La UI bloquea cambiar la moneda base una vez cargados importes financieros:
    const appSrc = fs.readFileSync(path.resolve(REPO_ROOT, 'frontend/apps/tools/src/App.tsx'), 'utf8');
    assert.match(appSrc, /disabled=\{!canChangeCurrency\}/);
    assert.match(appSrc, /ExchangeRatesModal/);
  });

  await t.test('Tarea 6.5: Unidades métricas vs US (kg/g vs lb/oz y L/ml vs fl_oz_us/gal_us) mantienen el costo exacto sin alterar montos', () => {
    const ingMetric = { id: 'cheese_m', name: 'Mozzarella Metric', base_dimension: 'mass', base_unit: 'g', is_active: true };
    const ingUs = { id: 'cheese_us', name: 'Mozzarella US', base_dimension: 'mass', base_unit: 'oz', is_active: true };
    const oilMetric = { id: 'oil_m', name: 'Olive Oil Metric', base_dimension: 'volume', base_unit: 'ml', density_g_per_ml: 0.92, is_active: true };
    const oilUs = { id: 'oil_us', name: 'Olive Oil US', base_dimension: 'volume', base_unit: 'fl_oz_us', density_g_per_ml: 0.92, is_active: true };

    const pricePerLb = 10; // USD 10 per 1 lb
    const pricePerKg = pricePerLb / 0.45359237; // exactamente USD 10 por 0.45359237 kg
    const pricePerGal = 20; // USD 20 per 1 US gal
    const pricePerL = pricePerGal / 3.785411784; // exactamente USD 20 por 3.785411784 L

    const catalog = {
      ingredients: [ingMetric, ingUs, oilMetric, oilUs],
      purchase_prices: [
        { ingredient_id: 'cheese_m', purchase_price: pricePerKg, currency: 'USD', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'cheese_us', purchase_price: pricePerLb, currency: 'USD', pack_quantity: 1, pack_unit: 'lb', yield_pct: 100 },
        { ingredient_id: 'oil_m', purchase_price: pricePerL, currency: 'USD', pack_quantity: 1, pack_unit: 'L', yield_pct: 100 },
        { ingredient_id: 'oil_us', purchase_price: pricePerGal, currency: 'USD', pack_quantity: 1, pack_unit: 'gal_us', yield_pct: 100 },
      ],
      recipes: [
        {
          id: 'rec_metric',
          name: 'Pizza Metric',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          currency: 'USD',
          components: [
            { component_type: 'ingredient', ingredient_id: 'cheese_m', quantity: 226.796185, unit: 'g' }, // 8 oz = 0.5 lb
            { component_type: 'ingredient', ingredient_id: 'oil_m', quantity: 29.5735295625, unit: 'ml' }, // 1 fl_oz_us
          ],
        },
        {
          id: 'rec_us',
          name: 'Pizza US',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          currency: 'USD',
          components: [
            { component_type: 'ingredient', ingredient_id: 'cheese_us', quantity: 8, unit: 'oz' },
            { component_type: 'ingredient', ingredient_id: 'oil_us', quantity: 1, unit: 'fl_oz_us' },
          ],
        },
      ],
    };

    const eng = new CostEngine(catalog);
    const resMetric = eng.calculateRecipeCost('rec_metric');
    const resUs = eng.calculateRecipeCost('rec_us');
    assert.equal(resMetric.status, 'complete');
    assert.equal(resUs.status, 'complete');
    assert.ok(
      Math.abs((resMetric.raw_unit_cost ?? 0) - (resUs.raw_unit_cost ?? 0)) < 0.0001,
      `Costo métrico (${resMetric.raw_unit_cost}) y US (${resUs.raw_unit_cost}) deben ser matemáticamente idénticos`
    );
  });

  await t.test('Tarea 6.6: Fechas calendario y timestamps locales no sufren desplazamiento de día (-1 día en UTC-3)', () => {
    // Una fecha pura YYYY-MM-DD debe formatearse como el mismo día calendario en cualquier locale:
    assert.equal(formatCalendarDate('2026-11-18', 'es-AR'), '18/11/2026');
    assert.equal(formatCalendarDate('2026-11-18', 'pt-BR'), '18/11/2026');
    assert.equal(formatCalendarDate('2026-11-18', 'en'), '11/18/2026');

    // Fecha cercana a medianoche local (23:55 hora local del sistema) no debe retroceder ni avanzar por toISOString().slice(0,10):
    const lateNightLocal = new Date(2026, 10, 18, 23, 55, 0);
    assert.equal(todayLocalDateString(lateNightLocal), '2026-11-18');
    const earlyMorningLocal = new Date(2026, 10, 18, 0, 5, 0);
    assert.equal(todayLocalDateString(earlyMorningLocal), '2026-11-18');
    const localIso = toLocalIsoTimestamp(earlyMorningLocal);
    assert.ok(localIso.startsWith('2026-11-18T00:05:00'));

    const histFormattedEs = formatHistoricalDateTime('2026-11-18T00:05:00-03:00', 'es-AR');
    assert.match(histFormattedEs, /18\/11\/2026/);
    const histDateOnly = formatHistoricalDateTime('2026-11-18', 'es-AR');
    assert.equal(histDateOnly, '18/11/2026');
  });
});
