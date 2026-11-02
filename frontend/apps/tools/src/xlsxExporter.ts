import {
  CostEngine,
  calculatePricingScenario,
  computeUsableIngredientCost,
  selectEffectivePurchasePrice,
} from '@pizzalog/cost-engine';
import type { ToolsWorkspaceState } from './demoData';

function escapeXml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colLetter(colIdx1Based: number): string {
  let n = colIdx1Based;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function writeUInt16LE(buf: Uint8Array, value: number, offset: number) {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
}

function writeUInt32LE(buf: Uint8Array, value: number, offset: number) {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
  buf[offset + 2] = (value >>> 16) & 0xff;
  buf[offset + 3] = (value >>> 24) & 0xff;
}

/**
 * Empaqueta un mapa de archivos XML en un contenedor ZIP OpenXML (.xlsx) estándar en el navegador.
 */
function buildBrowserZip(filesMap: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;
  const entries = Object.entries(filesMap);

  for (const [filePath, xmlContent] of entries) {
    const nameBytes = encoder.encode(filePath);
    const dataBytes = encoder.encode(xmlContent);
    const crc = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    writeUInt32LE(localHeader, 0x04034b50, 0);
    writeUInt16LE(localHeader, 20, 4);
    writeUInt16LE(localHeader, 0x0800, 6); // UTF-8
    writeUInt16LE(localHeader, 0, 8); // STORED (sin compresión, 100% compatible con Excel y Calc)
    writeUInt16LE(localHeader, 0, 10);
    writeUInt16LE(localHeader, 0x5ac2, 12);
    writeUInt32LE(localHeader, crc, 14);
    writeUInt32LE(localHeader, dataBytes.length, 18);
    writeUInt32LE(localHeader, dataBytes.length, 22);
    writeUInt16LE(localHeader, nameBytes.length, 26);
    writeUInt16LE(localHeader, 0, 28);
    localHeader.set(nameBytes, 30);

    chunks.push(localHeader, dataBytes);

    const central = new Uint8Array(46 + nameBytes.length);
    writeUInt32LE(central, 0x02014b50, 0);
    writeUInt16LE(central, 20, 4);
    writeUInt16LE(central, 20, 6);
    writeUInt16LE(central, 0x0800, 8);
    writeUInt16LE(central, 0, 10);
    writeUInt16LE(central, 0, 12);
    writeUInt16LE(central, 0x5ac2, 14);
    writeUInt32LE(central, crc, 16);
    writeUInt32LE(central, dataBytes.length, 20);
    writeUInt32LE(central, dataBytes.length, 24);
    writeUInt16LE(central, nameBytes.length, 28);
    writeUInt16LE(central, 0, 30);
    writeUInt16LE(central, 0, 32);
    writeUInt16LE(central, 0, 34);
    writeUInt16LE(central, 0, 36);
    writeUInt32LE(central, 0, 38);
    writeUInt32LE(central, offset, 42);
    central.set(nameBytes, 46);

    centralHeaders.push(central);
    offset += localHeader.length + dataBytes.length;
  }

  const centralSize = centralHeaders.reduce((acc, c) => acc + c.length, 0);
  const eocd = new Uint8Array(22);
  writeUInt32LE(eocd, 0x06054b50, 0);
  writeUInt16LE(eocd, 0, 4);
  writeUInt16LE(eocd, 0, 6);
  writeUInt16LE(eocd, entries.length, 8);
  writeUInt16LE(eocd, entries.length, 10);
  writeUInt32LE(eocd, centralSize, 12);
  writeUInt32LE(eocd, offset, 16);
  writeUInt16LE(eocd, 0, 20);

  const totalLength = offset + centralSize + eocd.length;
  const out = new Uint8Array(totalLength);
  let pos = 0;
  for (const ch of chunks) {
    out.set(ch, pos);
    pos += ch.length;
  }
  for (const ch of centralHeaders) {
    out.set(ch, pos);
    pos += ch.length;
  }
  out.set(eocd, pos);
  return out;
}

interface CellSpec {
  v?: string | number | null;
  f?: string;
  s?: number;
}

function buildWorksheetXml(rows: Array<Array<CellSpec | string | number | null>>, colWidths: number[] = []): string {
  const colsXml =
    colWidths.length > 0
      ? `<cols>${colWidths
          .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
          .join('')}</cols>`
      : '';

  const rowsXml: string[] = [];
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    if (!row || row.length === 0) continue;
    const rNum = rIdx + 1;
    const cellsXml: string[] = [];

    for (let cIdx = 0; cIdx < row.length; cIdx++) {
      const raw = row[cIdx];
      if (raw === null || raw === undefined || raw === '') continue;

      const cellRef = `${colLetter(cIdx + 1)}${rNum}`;
      const obj: CellSpec = typeof raw === 'object' ? raw : { v: raw };
      const styleAttr = obj.s !== undefined ? ` s="${obj.s}"` : '';

      if (obj.f !== undefined) {
        const isTextResult = typeof obj.v === 'string';
        const tAttr = isTextResult ? ` t="str"` : '';
        const valTag = obj.v !== undefined && obj.v !== null ? `<v>${escapeXml(obj.v)}</v>` : '';
        cellsXml.push(`<c r="${cellRef}"${styleAttr}${tAttr}><f>${escapeXml(obj.f)}</f>${valTag}</c>`);
      } else if (typeof obj.v === 'number') {
        cellsXml.push(`<c r="${cellRef}"${styleAttr}><v>${obj.v}</v></c>`);
      } else {
        cellsXml.push(
          `<c r="${cellRef}"${styleAttr} t="inlineStr"><is><t>${escapeXml(obj.v)}</t></is></c>`
        );
      }
    }

    if (cellsXml.length > 0) {
      rowsXml.push(`<row r="${rNum}">${cellsXml.join('')}</row>`);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${colsXml}
  <sheetData>${rowsXml.join('')}</sheetData>
</worksheet>`;
}

function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3">
    <numFmt numFmtId="164" formatCode="#,##0.00"/>
    <numFmt numFmtId="165" formatCode="#,##0.0000"/>
    <numFmt numFmtId="166" formatCode="0.0&quot;%&quot;"/>
  </numFmts>
  <fonts count="5">
    <font><sz val="10"/><color rgb="FF1F1F1F"/><name val="Calibri"/></font>
    <font><b/><sz val="14"/><color rgb="FF7C1D1D"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF0B4F6C"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF991B1B"/><name val="Calibri"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF2A1E17"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF8DC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFCE8E6"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEFEBE7"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD0C8C0"/></left>
      <right style="thin"><color rgb="FFD0C8C0"/></right>
      <top style="thin"><color rgb="FFD0C8C0"/></top>
      <bottom style="thin"><color rgb="FFD0C8C0"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="9">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
  </cellXfs>
</styleSheet>`;
}

/**
 * Genera y descarga un archivo .xlsx personalizado con todos los datos actuales del usuario en Pizzalog Tools.
 */
export function downloadCustomProfitKitXlsx(state: ToolsWorkspaceState): void {
  const engine = new CostEngine(state.catalog);

  // Hoja 1: Configuración Global
  const sheet1: Array<Array<CellSpec | null>> = [
    [{ v: `PIZZALOG TOOLS — PROFIT KIT PERSONALIZADO (${state.businessName})`, s: 1 }],
    [{ v: 'Planilla generada dinámicamente con tus insumos, mermas, subrecetas, recetas, ventas mensuales y costos fijos.', s: 0 }],
    [],
    [{ v: 'PARÁMETRO GLOBAL', s: 8 }, { v: 'VALOR', s: 8 }, { v: 'NOTAS', s: 8 }],
    [{ v: 'Nombre del Negocio', s: 0 }, { v: state.businessName, s: 3 }, { v: 'Personalizado desde Pizzalog Tools Web', s: 0 }],
    [{ v: 'Moneda', s: 0 }, { v: state.currency, s: 3 }, { v: 'Moneda activa del proyecto', s: 0 }],
    [{ v: 'Food Cost Objetivo (%)', s: 0 }, { v: state.defaultTargetFoodCostPct, s: 3 }, { v: 'Objetivo general de costo de mercadería', s: 0 }],
    [{ v: 'Incremento de Redondeo', s: 0 }, { v: state.defaultRoundingIncrement, s: 3 }, { v: 'Redondeo hacia arriba del Precio Sugerido', s: 0 }],
    [{ v: 'Costo Packaging Delivery', s: 0 }, { v: state.defaultPackagingCost, s: 3 }, { v: 'Costo de envase/caja por unidad', s: 0 }],
    [{ v: 'Comisión App Delivery (%)', s: 0 }, { v: state.defaultChannelFeePct, s: 3 }, { v: 'Comisión porcentual de plataforma', s: 0 }],
  ];

  // Hoja 2: Insumos y Merma
  const sheet2: Array<Array<CellSpec | null>> = [
    [{ v: '02. CATÁLOGO DE INSUMOS Y MERMA UTILIZABLE', s: 1 }],
    [],
    [
      { v: 'ID', s: 2 },
      { v: 'Ingrediente', s: 2 },
      { v: 'Dimensión', s: 2 },
      { v: 'Unidad Base', s: 2 },
      { v: 'Precio Compra', s: 2 },
      { v: 'Cant. Envase', s: 2 },
      { v: 'Unidad Envase', s: 2 },
      { v: 'Rendimiento (%)', s: 2 },
      { v: 'Costo Bruto / Base', s: 2 },
      { v: 'Costo Utilizable / Base', s: 2 },
      { v: 'Estado', s: 2 },
    ],
  ];

  state.catalog.ingredients.forEach((ing, idx) => {
    const r = idx + 4;
    const priceRec = selectEffectivePurchasePrice(ing.id, state.catalog.purchase_prices, state.catalog.as_of_date);
    let info: ReturnType<typeof computeUsableIngredientCost> | null = null;
    try {
      info = computeUsableIngredientCost(ing, priceRec, state.currency, state.catalog.exchange_rates, state.catalog.as_of_date);
    } catch {
      info = null;
    }
    const isComplete = info?.status === 'complete';
    const numPrice = ing.is_free ? 0 : Number(priceRec?.purchase_price ?? 0);
    const yieldPct = priceRec?.yield_pct ?? 100;

    sheet2.push([
      { v: ing.id, s: 0 },
      { v: ing.name, s: 3 },
      { v: ing.base_dimension, s: 0 },
      { v: ing.base_unit, s: 0 },
      { v: numPrice, s: 3 },
      { v: priceRec?.pack_quantity ?? 1, s: 3 },
      { v: priceRec?.pack_unit ?? ing.base_unit, s: 3 },
      { v: yieldPct, s: 3 },
      { v: isComplete && info?.grossUnitCostInBase !== null ? info!.grossUnitCostInBase : '', s: 5 },
      {
        f: isComplete ? `I${r}/(H${r}/100)` : undefined,
        v: isComplete && info?.usableUnitCostInBase !== null ? info!.usableUnitCostInBase : '',
        s: 5,
      },
      {
        v: isComplete ? 'COMPLETO' : 'INCOMPLETO: FALTA PRECIO',
        s: isComplete ? 0 : 7,
      },
    ]);
  });

  // Hoja 3: Masas y Subrecetas
  const sheet3: Array<Array<CellSpec | null>> = [
    [{ v: '03. MASAS PANADERAS Y SUBRECETAS REUTILIZABLES', s: 1 }],
    [],
    [
      { v: 'ID Subreceta', s: 2 },
      { v: 'Nombre Subreceta', s: 2 },
      { v: 'Tipo', s: 2 },
      { v: 'Rendimiento Batch', s: 2 },
      { v: 'Unidad Rend.', s: 2 },
      { v: 'Costo Batch', s: 2 },
      { v: 'Costo por Unidad Rend.', s: 2 },
      { v: 'Costo por kg', s: 2 },
      { v: 'Estado', s: 2 },
    ],
  ];

  const subrecipes = state.catalog.recipes.filter((r) => r.recipe_type === 'subrecipe');
  subrecipes.forEach((sub, idx) => {
    const r = idx + 4;
    let res: ReturnType<CostEngine['calculateRecipeCost']> | null = null;
    try {
      res = engine.calculateRecipeCost(sub.id);
    } catch {
      res = null;
    }
    const ok = res?.status === 'complete' && res.raw_batch_cost !== null;
    sheet3.push([
      { v: sub.id, s: 0 },
      { v: sub.name, s: 3 },
      { v: sub.bakers_dough ? `Masa (${sub.bakers_dough.hydration_pct}% hidr)` : 'Subreceta', s: 0 },
      { v: sub.yield_quantity, s: 3 },
      { v: sub.yield_unit, s: 0 },
      { v: ok ? res!.raw_batch_cost : '', s: 4 },
      { f: ok ? `F${r}/D${r}` : undefined, v: ok ? res!.raw_unit_cost : '', s: 5 },
      { v: ok && res?.cost_per_kg ? res.cost_per_kg : '', s: 4 },
      { v: ok ? 'COMPLETO' : 'INCOMPLETO', s: ok ? 0 : 7 },
    ]);
  });

  // Hoja 4: Recetas, Precios, Unidades Vendidas/Mes y Contribución Marginal
  const sheet4: Array<Array<CellSpec | null>> = [
    [{ v: '04. ESCANDALLO DE PRODUCTOS, PRECIOS, VENTAS MENSUALES E INGENIERÍA DE MENÚ', s: 1 }],
    [],
    [
      { v: 'ID', s: 2 },
      { v: 'Producto', s: 2 },
      { v: 'Estado', s: 2 },
      { v: 'Costo Ingredientes ($)', s: 2 },
      { v: 'Food Cost Obj (%)', s: 2 },
      { v: 'Redondeo ($)', s: 2 },
      { v: 'Precio Mínimo ($)', s: 2 },
      { v: 'Precio Sugerido ($)', s: 2 },
      { v: 'Precio Venta Carta ($)', s: 2 },
      { v: 'Ganancia Bruta Unit. ($)', s: 2 },
      { v: 'Food Cost Real (%)', s: 2 },
      { v: 'Margen Bruto (%)', s: 2 },
      { v: 'Markup (%)', s: 2 },
      { v: 'Unidades Vendidas / Mes', s: 2 },
      { v: 'Facturación Mensual ($)', s: 2 },
      { v: 'Contribución Marginal Mes ($)', s: 2 },
    ],
  ];

  const products = state.catalog.recipes.filter((r) => r.recipe_type === 'product');
  let totalMonthlyRevenue = 0;
  let totalMonthlyContribution = 0;

  products.forEach((prod, idx) => {
    const r = idx + 4;
    let res: ReturnType<CostEngine['calculateRecipeCost']> | null = null;
    try {
      res = engine.calculateRecipeCost(prod.id);
    } catch {
      res = null;
    }
    const targetFc = prod.target_food_cost_pct ?? state.defaultTargetFoodCostPct;
    const pricing = res
      ? calculatePricingScenario({
          unit_cost: res.raw_unit_cost,
          status: res.status,
          currency: state.currency,
          target_food_cost_pct: targetFc,
          rounding_increment: state.defaultRoundingIncrement,
          rounding_mode: 'ceil',
          selling_price: state.productSalesMap?.[prod.id]?.sellingPrice || undefined,
          packaging_cost: state.defaultPackagingCost,
          channel_fee_pct: state.defaultChannelFeePct,
        })
      : null;

    const ok = res?.status === 'complete' && pricing?.status === 'complete';
    const unitCost = ok ? res!.raw_unit_cost! : 0;
    const evalPrice = ok ? pricing!.raw_evaluated_price! : 0;
    const grossProfit = ok ? pricing!.raw_gross_profit! : 0;
    const unitsSold = state.productSalesMap?.[prod.id]?.monthlyUnitsSold ?? 120;
    const monthlyRev = ok ? evalPrice * unitsSold : 0;
    const monthlyContrib = ok ? grossProfit * unitsSold : 0;

    if (ok) {
      totalMonthlyRevenue += monthlyRev;
      totalMonthlyContribution += monthlyContrib;
    }

    sheet4.push([
      { v: prod.id, s: 0 },
      { v: prod.name, s: 3 },
      { v: ok ? 'COMPLETO' : 'INCOMPLETO', s: ok ? 0 : 7 },
      { v: ok ? unitCost : 0, s: 4 },
      { v: targetFc, s: 6 },
      { v: state.defaultRoundingIncrement, s: 4 },
      { f: `IF(C${r}<>"COMPLETO","",D${r}/(E${r}/100))`, v: ok ? pricing!.raw_minimum_price : '', s: 4 },
      { f: `IF(C${r}<>"COMPLETO","",CEILING(G${r},F${r}))`, v: ok ? pricing!.raw_suggested_price : '', s: 4 },
      { v: evalPrice, s: 3 },
      { f: `IF(C${r}<>"COMPLETO",0,I${r}-D${r})`, v: grossProfit, s: 4 },
      { f: `IF(OR(C${r}<>"COMPLETO",I${r}<=0),0,(D${r}/I${r})*100)`, v: ok ? pricing!.food_cost_pct : 0, s: 6 },
      { f: `IF(OR(C${r}<>"COMPLETO",I${r}<=0),0,(J${r}/I${r})*100)`, v: ok ? pricing!.gross_margin_pct : 0, s: 6 },
      { f: `IF(OR(C${r}<>"COMPLETO",D${r}<=0),0,(J${r}/D${r})*100)`, v: ok ? pricing!.markup_pct : 0, s: 6 },
      { v: unitsSold, s: 3 },
      { f: `I${r}*N${r}`, v: monthlyRev, s: 4 },
      { f: `J${r}*N${r}`, v: monthlyContrib, s: 4 },
    ]);
  });

  const lastProdRow = Math.max(4, products.length + 3);
  sheet4.push([]);
  sheet4.push([
    { v: 'TOTALES MENSUALES PROYECTADOS', s: 8 },
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    { f: `SUM(N4:N${lastProdRow})`, v: products.reduce((a, p) => a + (state.productSalesMap?.[p.id]?.monthlyUnitsSold ?? 120), 0), s: 4 },
    { f: `SUM(O4:O${lastProdRow})`, v: totalMonthlyRevenue, s: 4 },
    { f: `SUM(P4:P${lastProdRow})`, v: totalMonthlyContribution, s: 4 },
  ]);

  // Hoja 5: Gastos Operativos y Rentabilidad Neta
  const sheet5: Array<Array<CellSpec | null>> = [
    [{ v: '05. GASTOS OPERATIVOS FIJOS, PUNTO DE EQUILIBRIO Y RENTABILIDAD NETA REAL', s: 1 }],
    [],
    [
      { v: 'Rubro Operativo', s: 2 },
      { v: 'Categoría', s: 2 },
      { v: 'Período', s: 2 },
      { v: 'Importe ($)', s: 2 },
      { v: 'Factor Mensual', s: 2 },
      { v: 'Total Mensual ($)', s: 2 },
    ],
  ];

  const factorMap: Record<string, number> = { monthly: 1, weekly: 52 / 12, yearly: 1 / 12 };
  let totalFixed = 0;

  state.operatingExpenses.forEach((exp, idx) => {
    const r = idx + 4;
    const fac = factorMap[exp.period] ?? 1;
    const mTotal = exp.amount * fac;
    totalFixed += mTotal;
    sheet5.push([
      { v: exp.name, s: 3 },
      { v: exp.category, s: 0 },
      { v: exp.period, s: 0 },
      { v: exp.amount, s: 3 },
      { v: fac, s: 4 },
      { f: `D${r}*E${r}`, v: mTotal, s: 4 },
    ]);
  });

  const lastExpRow = Math.max(4, state.operatingExpenses.length + 3);
  const totalFixedRow = lastExpRow + 2;
  const contribRow = totalFixedRow + 1;
  const netResultRow = totalFixedRow + 2;

  sheet5.push([]);
  sheet5.push([
    { v: 'TOTAL GASTOS FIJOS OPERATIVOS MENSUALES', s: 8 },
    null,
    null,
    null,
    null,
    { f: `SUM(F4:F${lastExpRow})`, v: totalFixed, s: 4 },
  ]);
  sheet5.push([
    { v: 'CONTRIBUCIÓN MARGINAL MENSUAL (Desde Hoja 04)', s: 8 },
    null,
    null,
    null,
    null,
    { f: `'04_Recetas_y_Precios'!P${lastProdRow + 2}`, v: totalMonthlyContribution, s: 4 },
  ]);
  sheet5.push([
    { v: 'RESULTADO OPERATIVO NETO MENSUAL (GANANCIA REAL BOLSILLO)', s: 8 },
    null,
    null,
    null,
    null,
    { f: `F${contribRow}-F${totalFixedRow}`, v: totalMonthlyContribution - totalFixed, s: 4 },
  ]);

  const files: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet5.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="01_Guia_y_Config" sheetId="1" r:id="rId1"/>
    <sheet name="02_Insumos_y_Merma" sheetId="2" r:id="rId2"/>
    <sheet name="03_Masas_y_Subrecetas" sheetId="3" r:id="rId3"/>
    <sheet name="04_Recetas_y_Precios" sheetId="4" r:id="rId4"/>
    <sheet name="05_Gastos_y_Resultado" sheetId="5" r:id="rId5"/>
  </sheets>
</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet5.xml"/>
  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    'xl/styles.xml': buildStylesXml(),
    'xl/worksheets/sheet1.xml': buildWorksheetXml(sheet1, [40, 28, 52]),
    'xl/worksheets/sheet2.xml': buildWorksheetXml(sheet2, [14, 32, 12, 12, 16, 14, 14, 18, 20, 22, 26]),
    'xl/worksheets/sheet3.xml': buildWorksheetXml(sheet3, [16, 34, 24, 18, 14, 18, 22, 18, 18]),
    'xl/worksheets/sheet4.xml': buildWorksheetXml(sheet4, [14, 34, 16, 20, 16, 16, 18, 18, 18, 20, 16, 16, 16, 22, 22, 24]),
    'xl/worksheets/sheet5.xml': buildWorksheetXml(sheet5, [38, 18, 16, 22, 16, 24]),
  };

  const zipBytes = buildBrowserZip(files);
  const blob = new Blob([zipBytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = state.businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'mi-restaurante';
  a.href = url;
  a.download = `Profit_Kit_${safeName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
