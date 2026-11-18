import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CostEngine,
  generateProfitKitV2WorkbookBytes,
} from '../dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const TOLERANCE = 1e-6;

function assertClose(actual, expected, label, tol = TOLERANCE) {
  assert.notEqual(actual, null, `${label}: expected ${expected}, got null`);
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: expected ${expected}, got ${actual} (diff=${Math.abs(actual - expected)})`
  );
}

function extractZipTextEntries(zipBytes) {
  const buf = Buffer.from(zipBytes);
  const entries = {};
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const compMethod = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataStart = offset + 30 + nameLen + extraLen;
    const dataEnd = dataStart + compSize;
    assert.equal(compMethod, 0, `Entry ${name} must be STORED (method 0)`);
    entries[name] = buf.subarray(dataStart, dataEnd).toString('utf8');
    offset = dataEnd;
  }
  return entries;
}

function unescapeXml(str) {
  return String(str ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseSheetCells(sheetXml) {
  const cells = {};
  const cellRegex = /<c r="([A-Z]+\d+)"([^/>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let match;
  while ((match = cellRegex.exec(sheetXml)) !== null) {
    const ref = match[1];
    const attrs = match[2];
    const inner = match[3] ?? '';
    const fMatch = /<f>([\s\S]*?)<\/f>/.exec(inner);
    const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
    const tMatch = /<is><t>([\s\S]*?)<\/t><\/is>/.exec(inner);
    const isStr = attrs.includes('t="str"') || attrs.includes('t="inlineStr"');
    const sMatch = /s="(\d+)"/.exec(attrs);
    let val = null;
    if (tMatch) {
      val = unescapeXml(tMatch[1]);
    } else if (vMatch) {
      const rawV = unescapeXml(vMatch[1]);
      val = isStr ? rawV : Number(rawV);
    }
    cells[ref] = {
      f: fMatch ? unescapeXml(fMatch[1]) : null,
      v: val,
      s: sMatch ? Number(sMatch[1]) : 0,
      isBlankSelfClosed: match[3] === undefined,
    };
  }
  return cells;
}

function buildDemoInput(locale = 'es-AR') {
  return {
    businessName: 'Pizzería Demo — Il Forno',
    currency: 'ARS',
    locale,
    unitSystem: 'metric',
    defaultTargetFoodCostPct: 30,
    defaultRoundingIncrement: 500,
    defaultPackagingCost: 350,
    defaultChannelFeePct: 25,
    catalog: {
      ingredients: [
        { id: 'ing_harina', name: 'Harina 0000 Panadera', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'ing_levadura', name: 'Levadura Fresca', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'ing_sal', name: 'Sal Fina', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'ing_agua', name: 'Agua Filtrada', base_dimension: 'volume', base_unit: 'ml', density_g_per_ml: 1, is_free: true, is_active: true },
        { id: 'ing_tomate', name: 'Tomate Triturado Italiano', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'ing_aceite', name: 'Aceite de Oliva Virgen Extra', base_dimension: 'volume', base_unit: 'ml', density_g_per_ml: 0.92, is_active: true },
        { id: 'ing_mozzarella', name: 'Queso Mozzarella', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'ing_pollo', name: 'Pollo Crudo (con merma de limpieza)', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'ing_garbanzo', name: 'Harina de Garbanzo', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'ing_trufa', name: 'Trufa Negra (Ejemplo sin precio cargado)', base_dimension: 'mass', base_unit: 'g', is_active: true },
      ],
      purchase_prices: [
        { ingredient_id: 'ing_harina', purchase_price: 25000, currency: 'ARS', pack_quantity: 25, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'ing_levadura', purchase_price: 5000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'ing_sal', purchase_price: 300, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'ing_tomate', purchase_price: 8000, currency: 'ARS', pack_quantity: 8, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'ing_aceite', purchase_price: 10000, currency: 'ARS', pack_quantity: 5, pack_unit: 'L', yield_pct: 100 },
        { ingredient_id: 'ing_mozzarella', purchase_price: 2000, currency: 'ARS', pack_quantity: 500, pack_unit: 'g', yield_pct: 100 },
        { ingredient_id: 'ing_pollo', purchase_price: 1000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 90 },
        { ingredient_id: 'ing_garbanzo', purchase_price: 3500, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'ing_trufa', purchase_price: null, currency: 'ARS', pack_quantity: 100, pack_unit: 'g', yield_pct: 100 },
      ],
      recipes: [
        {
          id: 'sub_masa_poolish',
          name: 'Masa con Poolish 70% (Subreceta Demo)',
          recipe_type: 'subrecipe',
          yield_quantity: 1728,
          yield_unit: 'g',
          currency: 'ARS',
          bakers_dough: {
            total_flour_g: 1000,
            hydration_pct: 70,
            yield_basis: 'measured_yield',
            measured_yield_g: 1728,
            flours: [{ ingredient_id: 'ing_harina', share_pct: 100 }],
            poolish: { flour_pct: 30, water_pct: 100, yeast_pct: 1.0, yeast_ingredient_id: 'ing_levadura' },
            salt_pct: 2.5,
            salt_ingredient_id: 'ing_sal',
            water_ingredient_id: 'ing_agua',
          },
        },
        {
          id: 'sub_salsa',
          name: 'Salsa Pomodoro Casa (Subreceta Demo)',
          recipe_type: 'subrecipe',
          yield_quantity: 1000,
          yield_unit: 'g',
          currency: 'ARS',
          components: [
            { component_type: 'ingredient', ingredient_id: 'ing_tomate', quantity: 800, unit: 'g' },
            { component_type: 'ingredient', ingredient_id: 'ing_aceite', quantity: 100, unit: 'ml' },
          ],
        },
        {
          id: 'prod_margherita',
          name: 'Pizza Margherita Clásica (Demo)',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          target_food_cost_pct: 30,
          currency: 'ARS',
          components: [
            { component_type: 'subrecipe', recipe_id: 'sub_masa_poolish', quantity: 220, unit: 'g' },
            { component_type: 'subrecipe', recipe_id: 'sub_salsa', quantity: 100, unit: 'g' },
            { component_type: 'ingredient', ingredient_id: 'ing_mozzarella', quantity: 220, unit: 'g' },
          ],
        },
        {
          id: 'prod_focaccia_a',
          name: 'Focaccia Rellena Producto A (CE-005 Demo)',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          target_food_cost_pct: 30,
          currency: 'ARS',
          components: [
            { component_type: 'subrecipe', recipe_id: 'sub_salsa', quantity: 100, unit: 'g' },
            { component_type: 'ingredient', ingredient_id: 'ing_mozzarella', quantity: 150, unit: 'g' },
          ],
        },
        {
          id: 'prod_pollo_merma',
          name: 'Porción Pollo Grillado 180g con Merma 10% (CE-006 Demo)',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          target_food_cost_pct: 30,
          currency: 'ARS',
          components: [
            { component_type: 'ingredient', ingredient_id: 'ing_pollo', quantity: 180, unit: 'g' },
          ],
        },
        {
          id: 'prod_trufa_incompleta',
          name: 'Pizza Trufa Negra (Alerta Incompleta CE-007 Demo)',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          target_food_cost_pct: 30,
          currency: 'ARS',
          components: [
            { component_type: 'ingredient', ingredient_id: 'ing_harina', quantity: 200, unit: 'g' },
            { component_type: 'ingredient', ingredient_id: 'ing_trufa', quantity: 20, unit: 'g' },
          ],
        },
      ],
    },
    productSalesMap: {
      prod_margherita: { monthlyUnitsSold: 950, sellingPrice: 4200 },
      prod_focaccia_a: { monthlyUnitsSold: 420, sellingPrice: 2600 },
      prod_pollo_merma: { monthlyUnitsSold: 310, sellingPrice: 2200 },
      prod_trufa_incompleta: { monthlyUnitsSold: 45, sellingPrice: null },
    },
    operatingExpenses: [
      { id: 'exp_1', name: 'Alquiler del Local (Demo)', category: 'rent', period: 'monthly', amount: 850000 },
      { id: 'exp_2', name: 'Equipo de Cocina y Salón (Demo)', category: 'payroll', period: 'monthly', amount: 1800000 },
      { id: 'exp_3', name: 'Energía Eléctrica, Gas y Agua (Demo)', category: 'utilities', period: 'monthly', amount: 320000 },
      { id: 'exp_4', name: 'Internet, Software y Contabilidad (Demo)', category: 'software', period: 'monthly', amount: 130000 },
    ],
  };
}

test('Tareas 2.1 a 2.4: Auditoría de Excel v2 independiente (Simulación inicial 0%, Recálculo automático, 14 hojas y Filas adicionales)', async (t) => {
  const demoInput = buildDemoInput('es-AR');
  const bytes = generateProfitKitV2WorkbookBytes(demoInput);
  const entries = extractZipTextEntries(bytes);

  await t.test('Tarea 2.1: Hoja 12 (12_Simulaciones) inicia con 0% en B5:B10 (sin +10% en harina en caché) y coincide con escenario base', () => {
    const s08 = parseSheetCells(entries['xl/worksheets/sheet9.xml']);
    const s11 = parseSheetCells(entries['xl/worksheets/sheet12.xml']);
    const s12 = parseSheetCells(entries['xl/worksheets/sheet13.xml']);

    // Verificar que los 6 parámetros interactivos amarillos (B5..B10) inicien en 0% y tengan estilo editable s="3"
    for (const row of [5, 6, 7, 8, 9, 10]) {
      assert.equal(s12[`B${row}`].v, 0, `Hoja 12 B${row} debe iniciar en 0%`);
      assert.equal(s12[`B${row}`].s, 3, `Hoja 12 B${row} debe tener estilo amarillo editable (s=3)`);
    }

    // Verificar que para cada producto completo (filas 15, 16, 17), Costo Simulado (F) === Costo Base (E) e Incremento (G) === 0
    let sumSimRev = 0;
    let sumSimCogs = 0;
    let sumSimContrib = 0;
    for (const rSim of [15, 16, 17]) {
      assertClose(s12[`F${rSim}`].v, s12[`E${rSim}`].v, `Hoja 12 fila ${rSim}: Costo Simulado (F) === Costo Base (E) en 0%`);
      assertClose(s12[`G${rSim}`].v, 0, `Hoja 12 fila ${rSim}: Incremento Costo (G) === 0 en 0%`);
      assertClose(s12[`I${rSim}`].v, s12[`H${rSim}`].v, `Hoja 12 fila ${rSim}: Precio Simulado (I) === Precio Base (H) en 0%`);
      assertClose(s12[`D${rSim}`].v, s12[`C${rSim}`].v, `Hoja 12 fila ${rSim}: Unidades Simuladas (D) === Unidades Base (C) en 0%`);
      sumSimRev += s12[`J${rSim}`].v;
      sumSimCogs += s12[`K${rSim}`].v;
      sumSimContrib += s12[`L${rSim}`].v;
    }

    // Verificar consistencia interna entre filas de productos (15..33), resumen (fila 12) y fila TOTAL SIMULADO (fila 35)
    assertClose(s12['B12'].v, sumSimRev, 'Hoja 12 B12 (Facturación Simulada) === suma de filas J15:J33');
    assertClose(s12['J35'].v, sumSimRev, 'Hoja 12 J35 (Total Facturación Simulada) === suma de filas J15:J33');
    assertClose(s12['K35'].v, sumSimCogs, 'Hoja 12 K35 (Total CMV Simulado) === suma de filas K15:K33');
    assertClose(s12['L35'].v, sumSimContrib, 'Hoja 12 L35 (Total Contribución Simulada) === suma de filas L15:L33');
    assertClose(s12['D12'].v, s11['B12'].v, 'Hoja 12 D12 (Ganancia Neta Simulada @ 0%) === Hoja 11 B12 (EBITDA Base)');
    assertClose(s12['K35'].v, s08['H25'].v, 'Hoja 12 K35 (CMV Simulado @ 0%) === Hoja 08 H25 (CMV Base)');
  });

  await t.test('Tarea 2.2: xl/workbook.xml incluye calcPr con calcMode="auto", fullCalcOnLoad="1" y forceFullCalc="1" (incluyendo archivos .xlsx estáticos)', () => {
    const wbXml = entries['xl/workbook.xml'];
    assert.ok(
      wbXml.includes('<calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>'),
      'xl/workbook.xml debe incluir <calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>'
    );

    const staticXlsxPaths = [
      'docs/release/Restaurant_Profit_Kit_v1.xlsx',
      'frontend/apps/tools/public/Restaurant_Profit_Kit_v1.xlsx',
      'tools/Restaurant_Profit_Kit_v1.xlsx',
    ];
    for (const relPath of staticXlsxPaths) {
      const fullPath = path.join(REPO_ROOT, relPath);
      assert.ok(fs.existsSync(fullPath), `Debe existir ${relPath}`);
      const fileBytes = fs.readFileSync(fullPath);
      const fileEntries = extractZipTextEntries(fileBytes);
      assert.ok(
        fileEntries['xl/workbook.xml'].includes('fullCalcOnLoad="1" forceFullCalc="1"'),
        `${relPath} debe tener fullCalcOnLoad="1" forceFullCalc="1"`
      );
      const s12Static = parseSheetCells(fileEntries['xl/worksheets/sheet13.xml']);
      assert.equal(s12Static['B7'].v, 0, `${relPath} Hoja 12 B7 debe iniciar en 0%`);
    }
  });

  await t.test('Tarea 2.3: Auditoría sintáctica y referencial de todas las fórmulas en las 14 hojas (es-AR, pt-BR y en)', () => {
    const ALLOWED_FUNCTIONS = new Set([
      'IF', 'AND', 'OR', 'SUM', 'SUMIF', 'SUMIFS', 'COUNTIF', 'COUNTIFS',
      'COUNTA', 'AVERAGEIF', 'INDEX', 'MATCH', 'CEILING', 'ROUND', 'MAX', 'ABS', 'N',
    ]);
    const ERROR_TOKENS = ['#REF!', '#NAME?', '#VALUE!', '#N/A', '#DIV/0!', '#NUM!', '#NULL!', 'Err:'];

    for (const locale of ['es-AR', 'pt-BR', 'en']) {
      const locBytes = generateProfitKitV2WorkbookBytes(buildDemoInput(locale));
      const locEntries = extractZipTextEntries(locBytes);
      const wbXml = locEntries['xl/workbook.xml'];

      // Extraer los 14 nombres de hoja declarados en workbook.xml
      const sheetNames = [];
      const sheetTagRegex = /<sheet name="([^"]+)" sheetId="(\d+)"/g;
      let sm;
      while ((sm = sheetTagRegex.exec(wbXml)) !== null) {
        sheetNames.push(unescapeXml(sm[1]));
      }
      assert.equal(sheetNames.length, 14, `${locale} debe declarar exactamente 14 hojas`);
      const validSheetSet = new Set(sheetNames);

      let totalFormulasChecked = 0;

      for (let i = 1; i <= 14; i++) {
        const sheetKey = `xl/worksheets/sheet${i}.xml`;
        const xml = locEntries[sheetKey];
        assert.ok(xml, `Falta ${sheetKey} en locale ${locale}`);

        for (const errTok of ERROR_TOKENS) {
          assert.ok(!xml.includes(errTok), `${locale} ${sheetKey} no debe contener token de error ${errTok}`);
        }

        const cells = parseSheetCells(xml);
        const cellKeys = Object.keys(cells);
        assert.ok(cellKeys.length > 0, `${locale} ${sheetKey} no puede estar vacía`);

        for (const [ref, cell] of Object.entries(cells)) {
          if (!cell.f) continue;
          totalFormulasChecked++;
          const f = cell.f;

          // 1) Ninguna fórmula OpenXML debe empezar con '='
          assert.ok(!f.startsWith('='), `${locale} ${sheetKey}!${ref}: fórmula no debe iniciar con '=': ${f}`);

          // 2) Paréntesis balanceados
          let depth = 0;
          let inStr = false;
          for (let c = 0; c < f.length; c++) {
            const ch = f[c];
            if (ch === '"') {
              inStr = !inStr;
            } else if (!inStr) {
              if (ch === '(') depth++;
              else if (ch === ')') depth--;
              assert.ok(depth >= 0, `${locale} ${sheetKey}!${ref}: paréntesis desbalanceado en ${f}`);
            }
          }
          assert.equal(inStr, false, `${locale} ${sheetKey}!${ref}: comillas sin cerrar en ${f}`);
          assert.equal(depth, 0, `${locale} ${sheetKey}!${ref}: paréntesis sin cerrar en ${f}`);

          // 3) Todas las referencias entre hojas 'NombreHoja'! deben apuntar a una de las 14 hojas válidas
          const withoutStrings = f.replace(/"[^"]*"/g, '""');
          const sheetRefRegex = /'([^']+)'!/g;
          let srm;
          while ((srm = sheetRefRegex.exec(withoutStrings)) !== null) {
            const targetSheet = srm[1];
            assert.ok(
              validSheetSet.has(targetSheet),
              `${locale} ${sheetKey}!${ref}: referencia a hoja inexistente '${targetSheet}' en ${f}`
            );
          }

          // 4) Todas las funciones utilizadas deben pertenecer al set estándar compatible con Excel y LibreOffice
          const fnRegex = /\b([A-Z][A-Z0-9_.]*)\s*\(/g;
          let fnm;
          while ((fnm = fnRegex.exec(withoutStrings)) !== null) {
            const fnName = fnm[1];
            assert.ok(
              ALLOWED_FUNCTIONS.has(fnName),
              `${locale} ${sheetKey}!${ref}: función '${fnName}' no está en la lista blanca estándar Excel/LibreOffice (${f})`
            );
          }
        }
      }

      assert.ok(totalFormulasChecked > 1200, `${locale}: se verificaron ${totalFormulasChecked} fórmulas en las 14 hojas`);
    }
  });

  await t.test('Tarea 2.4: Probar filas adicionales (agregar ingredientes, subrecetas, pizzas y gastos en filas libres sin editar fórmulas)', () => {
    const s00 = parseSheetCells(entries['xl/worksheets/sheet1.xml']);
    const s02 = parseSheetCells(entries['xl/worksheets/sheet3.xml']);
    const s03 = parseSheetCells(entries['xl/worksheets/sheet4.xml']);
    const s05 = parseSheetCells(entries['xl/worksheets/sheet6.xml']);
    const s06 = parseSheetCells(entries['xl/worksheets/sheet7.xml']);
    const s07 = parseSheetCells(entries['xl/worksheets/sheet8.xml']);
    const s08 = parseSheetCells(entries['xl/worksheets/sheet9.xml']);
    const s09 = parseSheetCells(entries['xl/worksheets/sheet10.xml']);
    const s10 = parseSheetCells(entries['xl/worksheets/sheet11.xml']);
    const s12 = parseSheetCells(entries['xl/worksheets/sheet13.xml']);

    // 1. Verificar filas libres de Ingredientes (Hoja 02 y Hoja 03):
    // Hay 10 ingredientes demo (filas 5..14) y 15 filas libres (filas 15..29).
    for (let r = 15; r <= 29; r++) {
      assert.equal(s02[`A${r}`].isBlankSelfClosed, true, `Hoja 02 A${r} debe ser celda vacía estilizada <c r="A${r}" s="3"/>`);
      assert.ok(
        s02[`I${r}`].f.includes(`INDEX('01_Config_y_Unidades'!$D$16:$D$30,MATCH(H${r},'01_Config_y_Unidades'!$A$16:$A$30,0))`),
        `Hoja 02 I${r} tiene fórmula activa de conversión de envase en fila libre ${r}`
      );
      assert.equal(s03[`F${r}`].v, 100, `Hoja 03 F${r} tiene rendimiento por defecto 100% pre-cargado en fila libre ${r}`);
      assert.ok(
        s03[`J${r}`].f.includes(`I${r}/(F${r}/100)`),
        `Hoja 03 J${r} tiene fórmula activa de costo utilizable con merma en fila libre ${r}`
      );
    }
    // El diagnóstico en Hoja 00 B6 abarca hasta A29:
    assert.equal(s00['B6'].f, "COUNTA('02_Ingredientes_Presentaciones'!A5:A29)");

    // 2. Verificar filas libres de Subrecetas (Hoja 05):
    // Hay 2 subrecetas demo (filas 5..6) y 8 filas libres de cabecera (filas 7..14), más 25 filas libres de componentes (filas 26..50).
    for (let r = 7; r <= 14; r++) {
      assert.equal(s05[`A${r}`].isBlankSelfClosed, true, `Hoja 05 A${r} debe ser celda vacía estilizada`);
      assert.ok(s05[`E${r}`].f.includes('$A$18:$A$48'), `Hoja 05 E${r} suma componentes hasta la fila libre 48`);
      assert.ok(s05[`H${r}`].f.includes(`E${r}/C${r}`), `Hoja 05 H${r} calcula costo unitario de la nueva subreceta`);
      assert.ok(s05[`J${r}`].f.includes('$J$18:$J$48,"flour"'), `Hoja 05 J${r} desglosa rubro harina de la nueva subreceta`);
    }
    for (let r = 24; r <= 48; r++) {
      assert.ok(
        s05[`G${r}`].f.includes(`IF(C${r}="",""`),
        `Hoja 05 línea libre ${r} referencia a su propia fila C${r} y busca hasta la fila libre 29 de Hoja 03`
      );
      assert.ok(
        s05[`G${r}`].f.includes("'03_Rendimientos_y_Mermas'!$A$5:$A$29"),
        `Hoja 05 línea libre ${r} busca insumos hasta la fila libre 29 de Hoja 03`
      );
    }

    // 3. Verificar filas libres de Productos Finales (Hojas 06, 07, 08, 09 y 12):
    // Hay 4 productos demo (filas 5..8) y 15 filas libres de productos (filas 9..23), más 25 filas libres de componentes (filas 35..59).
    for (let r = 9; r <= 23; r++) {
      assert.equal(s06[`A${r}`].isBlankSelfClosed, true, `Hoja 06 A${r} debe ser celda vacía estilizada`);
      assert.ok(s06[`E${r}`].f.includes('$A$27:$A$59'), `Hoja 06 E${r} suma líneas de receta hasta la fila libre 59`);
      assert.ok(s07[`H${r}`].f.includes(`CEILING(G${r},F${r})`), `Hoja 07 H${r} calcula precio sugerido en fila libre ${r}`);
      assert.ok(s08[`G${r}`].f.includes(`C${r}*D${r}`), `Hoja 08 G${r} calcula facturación mensual en fila libre ${r}`);
      assert.ok(s09[`J${r}`].f.includes('"ESTRELLA"'), `Hoja 09 J${r} clasifica matriz BCG en fila libre ${r}`);
      const rSim = 15 + (r - 5);
      assert.ok(s12[`F${rSim}`].f.includes(`'06_Recetas_Productos_Finales'!I${r}`), `Hoja 12 F${rSim} simula sensibilidad para la fila libre ${r}`);
    }
    // Verificar que los totales de Hoja 08 (fila 25) y Hoja 12 (fila 35) abarquen hasta la última fila libre de producto (23 y 33):
    assert.equal(s08['C25'].f, 'SUM(C5:C23)');
    assert.equal(s08['G25'].f, 'SUM(G5:G23)');
    assert.equal(s08['H25'].f, 'SUM(H5:H23)');
    assert.equal(s08['I25'].f, 'SUM(I5:I23)');
    assert.equal(s12['J35'].f, 'SUM(J15:J33)');
    assert.equal(s12['K35'].f, 'SUM(K15:K33)');
    assert.equal(s12['L35'].f, 'SUM(L15:L33)');

    // 4. Verificar filas libres de Gastos Operativos (Hoja 10):
    // Hay 4 gastos demo (filas 5..8) y 10 filas libres (filas 9..18), y el total en G20 suma G5:G18.
    for (let r = 9; r <= 18; r++) {
      assert.equal(s10[`B${r}`].isBlankSelfClosed, true, `Hoja 10 B${r} debe ser celda vacía estilizada`);
      assert.equal(s10[`F${r}`].f, `IF(B${r}="","",IF(D${r}="weekly",52/12,IF(D${r}="yearly",1/12,1)))`);
      assert.equal(s10[`G${r}`].f, `IF(B${r}="","",E${r}*F${r})`);
    }
    assert.equal(s10['G20'].f, 'SUM(G5:G18)');

    // 5. Prueba funcional de extremo a extremo agregando insumos, subreceta, pizza y gasto por encima de los ejemplos iniciales:
    const extendedInput = buildDemoInput('es-AR');
    // Agregar 2 ingredientes adicionales (superando los 10 iniciales)
    extendedInput.catalog.ingredients.push(
      { id: 'ing_extra_provolone', name: 'Queso Provolone Estacionado', base_dimension: 'mass', base_unit: 'g', is_active: true },
      { id: 'ing_extra_panceta', name: 'Panceta Ahumada', base_dimension: 'mass', base_unit: 'g', is_active: true }
    );
    extendedInput.catalog.purchase_prices.push(
      { ingredient_id: 'ing_extra_provolone', purchase_price: 12000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      { ingredient_id: 'ing_extra_panceta', purchase_price: 9000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 90 } // $10/g limpio
    );
    // Agregar 1 subreceta adicional
    extendedInput.catalog.recipes.push({
      id: 'sub_extra_topping',
      name: 'Mix Gratinado Provolone y Panceta',
      recipe_type: 'subrecipe',
      yield_quantity: 200,
      yield_unit: 'g',
      currency: 'ARS',
      components: [
        { component_type: 'ingredient', ingredient_id: 'ing_extra_provolone', quantity: 100, unit: 'g' }, // $1200
        { component_type: 'ingredient', ingredient_id: 'ing_extra_panceta', quantity: 100, unit: 'g' }, // $1000
      ],
    });
    // Agregar 1 pizza adicional que usa la nueva subreceta
    extendedInput.catalog.recipes.push({
      id: 'prod_extra_provoleta',
      name: 'Pizza Provoleta & Panceta Crispy',
      recipe_type: 'product',
      yield_quantity: 1,
      yield_unit: 'unit',
      target_food_cost_pct: 30,
      currency: 'ARS',
      components: [
        { component_type: 'subrecipe', recipe_id: 'sub_masa_poolish', quantity: 220, unit: 'g' }, // 130.179398
        { component_type: 'subrecipe', recipe_id: 'sub_salsa', quantity: 100, unit: 'g' }, // 100
        { component_type: 'subrecipe', recipe_id: 'sub_extra_topping', quantity: 200, unit: 'g' }, // 2200
      ],
    });
    extendedInput.productSalesMap.prod_extra_provoleta = { monthlyUnitsSold: 200, sellingPrice: 9000 };
    // Agregar 1 gasto operativo adicional
    extendedInput.operatingExpenses.push({
      id: 'exp_extra_5',
      name: 'Publicidad Digital Mensual',
      category: 'other',
      period: 'monthly',
      amount: 150000,
    });

    const extBytes = generateProfitKitV2WorkbookBytes(extendedInput);
    const extEntries = extractZipTextEntries(extBytes);
    const extEngine = new CostEngine(extendedInput.catalog);
    const extRes = extEngine.calculateRecipeCost('prod_extra_provoleta');
    const extS06 = parseSheetCells(extEntries['xl/worksheets/sheet7.xml']);
    const extS10 = parseSheetCells(extEntries['xl/worksheets/sheet11.xml']);
    const extS11 = parseSheetCells(extEntries['xl/worksheets/sheet12.xml']);

    // El quinto producto está en la fila 9 de Hoja 06
    assert.equal(extS06['A9'].v, 'prod_extra_provoleta');
    assertClose(extS06['H9'].v, extRes.raw_unit_cost, 'Costo de la nueva pizza en fila 9 de Hoja 06');
    // El nuevo total de gastos fijos mensuales es 3,100,000 + 150,000 = 3,250,000
    assertClose(extS10['G21'].v, 3250000, 'Nuevo total de gastos fijos en Hoja 10');
    assertClose(extS11['B11'].v, 3250000, 'Nuevo total de gastos fijos reflejado en Hoja 11 B11');
  });
});
