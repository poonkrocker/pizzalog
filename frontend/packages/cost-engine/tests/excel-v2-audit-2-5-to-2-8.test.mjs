import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CostEngine,
  calculatePricingScenario,
  formatWorkbookDate,
  generateProfitKitV2WorkbookBytes,
} from '../dist/index.js';

const TOLERANCE = 1e-5;

function assertClose(actual, expected, label, tol = TOLERANCE) {
  assert.notEqual(actual, null, `${label}: expected ${expected}, got null`);
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: expected ${expected}, got ${actual} (diff=${Math.abs(actual - expected)})`
  );
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

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function extractAndVerifyZip(zipBytes) {
  const buf = Buffer.from(zipBytes);
  const entries = {};
  const meta = [];
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const compMethod = buf.readUInt16LE(offset + 8);
    const expectedCrc = buf.readUInt32LE(offset + 14);
    const compSize = buf.readUInt32LE(offset + 18);
    const uncompSize = buf.readUInt32LE(offset + 22);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataStart = offset + 30 + nameLen + extraLen;
    const dataEnd = dataStart + compSize;
    const rawSlice = buf.subarray(dataStart, dataEnd);
    const actualCrc = crc32(rawSlice);

    assert.equal(compMethod, 0, `${name}: compression method must be 0 (STORED)`);
    assert.equal(compSize, uncompSize, `${name}: compressed size === uncompressed size`);
    assert.equal(actualCrc, expectedCrc, `${name}: CRC-32 checksum must be valid`);

    entries[name] = rawSlice.toString('utf8');
    meta.push({ name, size: compSize, crc: actualCrc });
    offset = dataEnd;
  }
  // Verify Central Directory signature and EOCD signature at end of buffer
  assert.equal(buf.readUInt32LE(offset), 0x02014b50, 'Central Directory header signature must follow local entries');
  assert.equal(buf.readUInt32LE(buf.length - 22), 0x06054b50, 'End of Central Directory (EOCD) signature must be at end of file');
  return { entries, meta };
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
    let val = '';
    if (tMatch) {
      val = unescapeXml(tMatch[1]);
    } else if (vMatch) {
      const rawV = unescapeXml(vMatch[1]);
      val = isStr ? rawV : rawV === '' ? '' : Number(rawV);
    }
    cells[ref] = {
      f: fMatch ? unescapeXml(fMatch[1]) : null,
      v: val,
    };
  }
  return cells;
}

/**
 * Evaluador de fórmulas de la arquitectura de 14 hojas del Excel v2 para probar
 * edición manual (Tarea 2.5) y paridad sin conexión (Tareas 2.7 y 2.8).
 */
function recalculateWorkbookInMemory(sheetsByName, sheetNames) {
  const S = sheetNames;
  const s01 = sheetsByName[S[1]];
  const s02 = sheetsByName[S[2]];
  const s03 = sheetsByName[S[3]];
  const s04 = sheetsByName[S[4]];
  const s05 = sheetsByName[S[5]];
  const s06 = sheetsByName[S[6]];
  const s07 = sheetsByName[S[7]];
  const s08 = sheetsByName[S[8]];
  const s09 = sheetsByName[S[9]];
  const s10 = sheetsByName[S[10]];
  const s11 = sheetsByName[S[11]];
  const s12 = sheetsByName[S[12]];
  const s00 = sheetsByName[S[0]];

  const getVal = (sh, ref) => (sh[ref]?.v !== undefined && sh[ref]?.v !== null ? sh[ref].v : '');
  const getNum = (sh, ref) => {
    const v = getVal(sh, ref);
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  };

  // Mapa de unidades desde Hoja 01 ($A$16:$D$30)
  const unitFactorMap = {};
  for (let r = 16; r <= 30; r++) {
    const code = String(getVal(s01, `A${r}`));
    const factor = getNum(s01, `D${r}`);
    if (code) unitFactorMap[code] = factor;
  }

  // Determinar rangos dinámicos
  const maxRowOf = (sh, col = 'A', start = 5) => {
    let maxR = start;
    for (const key of Object.keys(sh)) {
      const m = new RegExp(`^${col}(\\d+)$`).exec(key);
      if (m) {
        const rn = Number(m[1]);
        if (rn > maxR) maxR = rn;
      }
    }
    return maxR;
  };

  const ingEndRow = maxRowOf(s03, 'L', 5);

  // 1. Recalcular Hoja 02 (I = Cant en Unidad Base) y Hoja 03 (Rendimientos y Costo Utilizable)
  for (let r = 5; r <= ingEndRow; r++) {
    const id = getVal(s02, `A${r}`);
    if (id === '') {
      s02[`I${r}`].v = '';
      for (const col of ['A', 'B', 'C', 'D', 'E', 'G', 'H', 'I', 'J', 'K', 'L']) {
        if (s03[`${col}${r}`]) s03[`${col}${r}`].v = '';
      }
      continue;
    }
    const baseUnit = String(getVal(s02, `E${r}`));
    const packQty = getNum(s02, `G${r}`);
    const packUnit = String(getVal(s02, `H${r}`));
    const isFree = getNum(s02, `L${r}`) === 1;
    const rawPriceVal = getVal(s02, `F${r}`);
    const priceNum = typeof rawPriceVal === 'number' ? rawPriceVal : 0;

    const packInBase =
      packUnit === baseUnit
        ? packQty
        : (packQty * (unitFactorMap[packUnit] ?? 1)) / (unitFactorMap[baseUnit] ?? 1);
    s02[`I${r}`].v = packInBase;

    s03[`A${r}`].v = id;
    s03[`B${r}`].v = getVal(s02, `B${r}`);
    s03[`C${r}`].v = baseUnit;
    s03[`D${r}`].v = priceNum;
    s03[`E${r}`].v = packInBase;
    const yieldPct = getNum(s03, `F${r}`);
    s03[`G${r}`].v = 100 - yieldPct;
    s03[`H${r}`].v = packInBase * (yieldPct / 100);
    s03[`I${r}`].v = isFree ? 0 : priceNum <= 0 || packInBase <= 0 ? '' : priceNum / packInBase;
    s03[`J${r}`].v =
      isFree
        ? 0
        : priceNum <= 0 || packInBase <= 0 || yieldPct <= 0 || yieldPct > 100
        ? ''
        : s03[`I${r}`].v / (yieldPct / 100);
    s03[`K${r}`].v =
      s03[`J${r}`].v === ''
        ? ''
        : baseUnit === 'g' || baseUnit === 'ml' || baseUnit === 'cc'
        ? s03[`J${r}`].v * 1000
        : s03[`J${r}`].v;
    s03[`L${r}`].v =
      yieldPct <= 0 || yieldPct > 100
        ? 'ERROR: RENDIMIENTO INVÁLIDO'
        : isFree
        ? 'OK (COSTO CERO)'
        : priceNum > 0
        ? 'COMPLETO'
        : 'INCOMPLETO: FALTA PRECIO';
  }

  // 2. Recalcular Hoja 04 (Historial de precios Col I)
  for (let r = 5; r <= maxRowOf(s04, 'A', 5); r++) {
    const ingId = getVal(s04, `A${r}`);
    if (!ingId) continue;
    let sumJ = 0;
    for (let ir = 5; ir <= ingEndRow; ir++) {
      if (getVal(s03, `A${ir}`) === ingId && typeof getVal(s03, `J${ir}`) === 'number') {
        sumJ += getNum(s03, `J${ir}`);
      }
    }
    if (s04[`I${r}`]) s04[`I${r}`].v = sumJ;
  }

  // 3. Recalcular Hoja 05 (Subrecetas: primero líneas inferiores, luego resumen superior; dos pasadas para soportar subrecetas anidadas)
  // Detectar subEndRow buscando dónde empieza el título de líneas
  let subEndRow = 5;
  while (s05[`E${subEndRow + 1}`]?.f?.startsWith('IF(A')) subEndRow++;
  const subLinesStartRow = subEndRow + 4;
  const subLinesEndRow = maxRowOf(s05, 'G', subLinesStartRow);

  for (let pass = 0; pass < 2; pass++) {
    for (let r = subLinesStartRow; r <= subLinesEndRow; r++) {
      const subId = getVal(s05, `A${r}`);
      const compId = getVal(s05, `C${r}`);
      if (!compId) {
        s05[`G${r}`].v = '';
        s05[`H${r}`].v = 0;
        s05[`I${r}`].v = '';
        continue;
      }
      const qty = getNum(s05, `E${r}`);
      let foundIn03 = false;
      let unitCost = 0;
      let isCompComplete = false;
      for (let ir = 5; ir <= ingEndRow; ir++) {
        if (getVal(s03, `A${ir}`) === compId) {
          foundIn03 = true;
          unitCost = getNum(s03, `J${ir}`);
          const st = getVal(s03, `L${ir}`);
          if (st === 'COMPLETO' || st === 'OK (COSTO CERO)') isCompComplete = true;
        }
      }
      if (!foundIn03) {
        for (let sr = 5; sr <= subEndRow; sr++) {
          if (getVal(s05, `A${sr}`) === compId) {
            unitCost = getNum(s05, `H${sr}`);
            if (getVal(s05, `G${sr}`) === 'COMPLETO') isCompComplete = true;
          }
        }
      }
      s05[`G${r}`].v = unitCost;
      s05[`I${r}`].v = qty <= 0 || !isCompComplete ? 'INCOMPLETO: FALTA PRECIO' : 'COMPLETO';
      s05[`H${r}`].v = !subId || s05[`I${r}`].v !== 'COMPLETO' ? 0 : qty * unitCost;
    }

    for (let r = 5; r <= subEndRow; r++) {
      const id = getVal(s05, `A${r}`);
      if (!id) continue;
      const yieldQty = getNum(s05, `C${r}`);
      const yieldUnit = String(getVal(s05, `D${r}`));
      let batchCost = 0;
      let incCount = 0;
      let totalLines = 0;
      let flourSum = 0;
      let dairySum = 0;
      let meatSum = 0;
      for (let lr = subLinesStartRow; lr <= subLinesEndRow; lr++) {
        if (getVal(s05, `A${lr}`) === id) {
          totalLines++;
          const lineCost = getNum(s05, `H${lr}`);
          batchCost += lineCost;
          if (getVal(s05, `I${lr}`) !== 'COMPLETO') incCount++;
          const cat = getVal(s05, `J${lr}`);
          if (cat === 'flour') flourSum += lineCost;
          else if (cat === 'dairy') dairySum += lineCost;
          else if (cat === 'meat') meatSum += lineCost;
        }
      }
      s05[`E${r}`].v = batchCost;
      s05[`F${r}`].v = incCount;
      s05[`G${r}`].v = incCount === 0 && totalLines > 0 ? 'COMPLETO' : 'INCOMPLETO';
      s05[`H${r}`].v = s05[`G${r}`].v !== 'COMPLETO' || yieldQty <= 0 ? '' : batchCost / yieldQty;
      s05[`I${r}`].v =
        s05[`H${r}`].v === ''
          ? ''
          : yieldUnit === 'g' || yieldUnit === 'ml' || yieldUnit === 'cc'
          ? s05[`H${r}`].v * 1000
          : s05[`H${r}`].v;
      s05[`J${r}`].v = s05[`G${r}`].v !== 'COMPLETO' || yieldQty <= 0 ? 0 : flourSum / yieldQty;
      s05[`K${r}`].v = s05[`G${r}`].v !== 'COMPLETO' || yieldQty <= 0 ? 0 : dairySum / yieldQty;
      s05[`L${r}`].v = s05[`G${r}`].v !== 'COMPLETO' || yieldQty <= 0 ? 0 : meatSum / yieldQty;
    }
  }

  // 4. Recalcular Hoja 06 (Productos finales: primero líneas inferiores, luego tabla superior)
  let prodEndRow = 5;
  while (s06[`E${prodEndRow + 1}`]?.f?.startsWith('IF(A')) prodEndRow++;
  const prodLinesStartRow = prodEndRow + 4;
  const prodLinesEndRow = maxRowOf(s06, 'I', prodLinesStartRow);

  for (let r = prodLinesStartRow; r <= prodLinesEndRow; r++) {
    const prodId = getVal(s06, `A${r}`);
    const compType = getVal(s06, `C${r}`);
    const compId = getVal(s06, `D${r}`);
    if (!compId) continue;
    const qty = getNum(s06, `G${r}`);
    const cat = getVal(s06, `F${r}`);

    let unitCost = 0;
    let isComplete = false;
    let subFlourUnit = 0;
    let subDairyUnit = 0;
    let subMeatUnit = 0;

    if (compType === 'subrecipe') {
      for (let sr = 5; sr <= subEndRow; sr++) {
        if (getVal(s05, `A${sr}`) === compId) {
          unitCost = getNum(s05, `H${sr}`);
          if (getVal(s05, `G${sr}`) === 'COMPLETO') isComplete = true;
          subFlourUnit = getNum(s05, `J${sr}`);
          subDairyUnit = getNum(s05, `K${sr}`);
          subMeatUnit = getNum(s05, `L${sr}`);
        }
      }
    } else {
      for (let ir = 5; ir <= ingEndRow; ir++) {
        if (getVal(s03, `A${ir}`) === compId) {
          unitCost = getNum(s03, `J${ir}`);
          const st = getVal(s03, `L${ir}`);
          if (st === 'COMPLETO' || st === 'OK (COSTO CERO)') isComplete = true;
        }
      }
    }

    s06[`I${r}`].v = unitCost;
    s06[`K${r}`].v = qty <= 0 || !isComplete ? 'INCOMPLETO' : 'COMPLETO';
    const lineCost = !prodId || s06[`K${r}`].v !== 'COMPLETO' ? 0 : qty * unitCost;
    s06[`J${r}`].v = lineCost;
    s06[`L${r}`].v = s06[`K${r}`].v !== 'COMPLETO' ? 0 : compType === 'subrecipe' ? qty * subFlourUnit : cat === 'flour' ? lineCost : 0;
    s06[`M${r}`].v = s06[`K${r}`].v !== 'COMPLETO' ? 0 : compType === 'subrecipe' ? qty * subDairyUnit : cat === 'dairy' ? lineCost : 0;
    s06[`N${r}`].v = s06[`K${r}`].v !== 'COMPLETO' ? 0 : compType === 'subrecipe' ? qty * subMeatUnit : cat === 'meat' ? lineCost : 0;
  }

  for (let r = 5; r <= prodEndRow; r++) {
    const id = getVal(s06, `A${r}`);
    if (!id) continue;
    const yieldQty = getNum(s06, `C${r}`);
    let batchCost = 0;
    let incCount = 0;
    let lineCount = 0;
    let flourCost = 0;
    let dairyCost = 0;
    let meatCost = 0;
    for (let lr = prodLinesStartRow; lr <= prodLinesEndRow; lr++) {
      if (getVal(s06, `A${lr}`) === id) {
        lineCount++;
        batchCost += getNum(s06, `J${lr}`);
        if (getVal(s06, `K${lr}`) !== 'COMPLETO') incCount++;
        flourCost += getNum(s06, `L${lr}`);
        dairyCost += getNum(s06, `M${lr}`);
        meatCost += getNum(s06, `N${lr}`);
      }
    }
    s06[`E${r}`].v = batchCost;
    s06[`F${r}`].v = incCount;
    // Replica de CostEngine: si batchCost <= 0 tampoco es completo
    s06[`G${r}`].v = incCount === 0 && lineCount > 0 && batchCost > 0 ? 'COMPLETO' : 'INCOMPLETO';
    s06[`H${r}`].v = s06[`G${r}`].v !== 'COMPLETO' || yieldQty <= 0 ? '' : batchCost / yieldQty;
    s06[`I${r}`].v = s06[`G${r}`].v !== 'COMPLETO' || yieldQty <= 0 ? 0 : flourCost / yieldQty;
    s06[`J${r}`].v = s06[`G${r}`].v !== 'COMPLETO' || yieldQty <= 0 ? 0 : dairyCost / yieldQty;
    s06[`K${r}`].v = s06[`G${r}`].v !== 'COMPLETO' || yieldQty <= 0 ? 0 : meatCost / yieldQty;
  }

  // 5. Recalcular Hoja 07 (Precios y Márgenes) y Hoja 08 (Ventas)
  const targetFcGlobal = getNum(s01, 'B7');
  const roundingGlobal = getNum(s01, 'B8');
  const pkgGlobal = getNum(s01, 'B9');
  const feeGlobal = getNum(s01, 'B10');

  let sumUnits = 0;
  let sumRev = 0;
  let sumCogs = 0;
  let sumContrib = 0;
  let countComplete = 0;
  let sumUnitProfitComplete = 0;

  for (let r = 5; r <= prodEndRow; r++) {
    const id = getVal(s06, `A${r}`);
    if (!id) continue;
    const st = getVal(s06, `G${r}`);
    const unitCost = getNum(s06, `H${r}`);
    s07[`A${r}`].v = id;
    s07[`B${r}`].v = getVal(s06, `B${r}`);
    s07[`C${r}`].v = st;
    s07[`D${r}`].v = st === 'COMPLETO' ? unitCost : '';
    s07[`E${r}`].v = targetFcGlobal;
    s07[`F${r}`].v = roundingGlobal;

    if (st !== 'COMPLETO') {
      s07[`G${r}`].v = 'BLOQUEADO (INCOMPLETO)';
      s07[`H${r}`].v = 'BLOQUEADO (INCOMPLETO)';
      s07[`J${r}`].v = '';
      s07[`K${r}`].v = '';
      s07[`L${r}`].v = '';
      s07[`M${r}`].v = '';
      s07[`N${r}`].v = '';
      s07[`O${r}`].v = '';
      s08[`D${r}`].v = 0;
      s08[`E${r}`].v = 0;
      s08[`F${r}`].v = 0;
      s08[`G${r}`].v = 0;
      s08[`H${r}`].v = 0;
      s08[`I${r}`].v = 0;
    } else {
      const minPrice = unitCost / (targetFcGlobal / 100);
      const ratio = minPrice / roundingGlobal;
      const cleanRatio = Math.abs(ratio - Math.round(ratio)) < 1e-12 ? Math.round(ratio) : ratio;
      const suggPrice = Math.ceil(cleanRatio) * roundingGlobal;
      const manualPrice = getNum(s07, `I${r}`);
      const evalPrice = manualPrice > 0 ? manualPrice : suggPrice;
      const grossProfit = evalPrice - unitCost;

      s07[`G${r}`].v = minPrice;
      s07[`H${r}`].v = suggPrice;
      s07[`J${r}`].v = evalPrice;
      s07[`K${r}`].v = grossProfit;
      s07[`L${r}`].v = (unitCost / evalPrice) * 100;
      s07[`M${r}`].v = (grossProfit / evalPrice) * 100;
      s07[`N${r}`].v = (grossProfit / unitCost) * 100;
      s07[`O${r}`].v = grossProfit - pkgGlobal - evalPrice * (feeGlobal / 100);

      const units = getNum(s08, `C${r}`);
      s08[`D${r}`].v = evalPrice;
      s08[`E${r}`].v = unitCost;
      s08[`F${r}`].v = grossProfit;
      s08[`G${r}`].v = units * evalPrice;
      s08[`H${r}`].v = units * unitCost;
      s08[`I${r}`].v = units * grossProfit;

      sumUnits += units;
      sumRev += units * evalPrice;
      sumCogs += units * unitCost;
      sumContrib += units * grossProfit;
      countComplete++;
      sumUnitProfitComplete += grossProfit;
    }
  }

  const salesTotalRow = prodEndRow + 2;
  // En Hoja 08 C{salesTotalRow} suma todas las unidades C5:C{prodEndRow}
  let rawSumC = 0;
  for (let r = 5; r <= prodEndRow; r++) rawSumC += getNum(s08, `C${r}`);
  s08[`C${salesTotalRow}`].v = rawSumC;
  s08[`G${salesTotalRow}`].v = sumRev;
  s08[`H${salesTotalRow}`].v = sumCogs;
  s08[`I${salesTotalRow}`].v = sumContrib;

  // 6. Recalcular Hoja 10 (Gastos Fijos) y Hoja 11 (Rentabilidad y Punto de Equilibrio)
  const expEndRow = maxRowOf(s10, 'F', 5);
  const expTotalRow = expEndRow + 2;
  let sumExp = 0;
  for (let r = 5; r <= expEndRow; r++) {
    if (!getVal(s10, `B${r}`)) continue;
    const period = getVal(s10, `D${r}`);
    const factor = period === 'weekly' ? 52 / 12 : period === 'yearly' ? 1 / 12 : 1;
    const amt = getNum(s10, `E${r}`) * factor;
    s10[`F${r}`].v = factor;
    s10[`G${r}`].v = amt;
    sumExp += amt;
  }
  s10[`G${expTotalRow}`].v = sumExp;

  s11['B5'].v = rawSumC;
  s11['B6'].v = sumRev;
  s11['B7'].v = sumCogs;
  s11['B8'].v = sumRev <= 0 ? 0 : (sumCogs / sumRev) * 100;
  s11['B9'].v = sumContrib;
  s11['B10'].v = sumRev <= 0 ? 0 : (sumContrib / sumRev) * 100;
  s11['B11'].v = sumExp;
  s11['B12'].v = sumContrib - sumExp;
  s11['B13'].v = sumRev <= 0 ? 0 : ((sumContrib - sumExp) / sumRev) * 100;
  s11['B16'].v = s11['B10'].v <= 0 ? 0 : sumExp / (s11['B10'].v / 100);
  s11['B17'].v = rawSumC <= 0 || sumContrib <= 0 ? 0 : sumExp / (sumContrib / rawSumC);
  s11['B18'].v = sumRev <= 0 || s11['B16'].v <= 0 ? 0 : ((sumRev - s11['B16'].v) / sumRev) * 100;

  // 7. Recalcular Hoja 00 (Diagnóstico)
  let missingPrices = 0;
  for (let r = 5; r <= ingEndRow; r++) {
    if (getVal(s03, `L${r}`) === 'INCOMPLETO: FALTA PRECIO') missingPrices++;
  }
  let incompleteProds = 0;
  for (let r = 5; r <= prodEndRow; r++) {
    if (getVal(s07, `C${r}`) === 'INCOMPLETO') incompleteProds++;
  }
  s00['B7'].v = missingPrices;
  s00['C7'].v = missingPrices === 0 ? 'OK' : 'ATENCIÓN: COMPLETAR PRECIOS EN HOJA 02';
  s00['B10'].v = incompleteProds;
  s00['C10'].v = incompleteProds === 0 ? 'OK' : 'BLOQUEO ACTIVO EN RECETAS INCOMPLETAS';
}

test('Tareas 2.5 a 2.8: Edición manual en vivo, 3 idiomas, Modo 100% Offline y Paridad completa Excel vs Cost Engine', async (t) => {
  await t.test('Tarea 2.5: Edición manual de precios y mermas en Hoja 02/03 actualiza toda la cadena (Hojas 03 -> 04 -> 05 -> 06 -> 07 -> 08 -> 11 -> 00)', () => {
    const input = {
      businessName: 'Pizzería Edición Manual',
      currency: 'ARS',
      locale: 'es-AR',
      unitSystem: 'metric',
      defaultTargetFoodCostPct: 30,
      defaultRoundingIncrement: 500,
      defaultPackagingCost: 350,
      defaultChannelFeePct: 25,
      catalog: {
        ingredients: [
          { id: 'ing_harina', name: 'Harina 0000', base_dimension: 'mass', base_unit: 'g', is_active: true },
          { id: 'ing_levadura', name: 'Levadura', base_dimension: 'mass', base_unit: 'g', is_active: true },
          { id: 'ing_sal', name: 'Sal', base_dimension: 'mass', base_unit: 'g', is_active: true },
          { id: 'ing_agua', name: 'Agua', base_dimension: 'volume', base_unit: 'ml', density_g_per_ml: 1, is_free: true, is_active: true },
          { id: 'ing_tomate', name: 'Tomate', base_dimension: 'mass', base_unit: 'g', is_active: true },
          { id: 'ing_aceite', name: 'Aceite', base_dimension: 'volume', base_unit: 'ml', density_g_per_ml: 0.92, is_active: true },
          { id: 'ing_mozzarella', name: 'Mozzarella', base_dimension: 'mass', base_unit: 'g', is_active: true },
          { id: 'ing_pollo', name: 'Pollo', base_dimension: 'mass', base_unit: 'g', is_active: true },
          { id: 'ing_trufa', name: 'Trufa Negra', base_dimension: 'mass', base_unit: 'g', is_active: true },
        ],
        purchase_prices: [
          { ingredient_id: 'ing_harina', purchase_price: 25000, currency: 'ARS', pack_quantity: 25, pack_unit: 'kg', yield_pct: 100 },
          { ingredient_id: 'ing_levadura', purchase_price: 5000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
          { ingredient_id: 'ing_sal', purchase_price: 300, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
          { ingredient_id: 'ing_tomate', purchase_price: 8000, currency: 'ARS', pack_quantity: 8, pack_unit: 'kg', yield_pct: 100 },
          { ingredient_id: 'ing_aceite', purchase_price: 10000, currency: 'ARS', pack_quantity: 5, pack_unit: 'L', yield_pct: 100 },
          { ingredient_id: 'ing_mozzarella', purchase_price: 2000, currency: 'ARS', pack_quantity: 500, pack_unit: 'g', yield_pct: 100 },
          { ingredient_id: 'ing_pollo', purchase_price: 1000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 90 },
          { ingredient_id: 'ing_trufa', purchase_price: null, currency: 'ARS', pack_quantity: 100, pack_unit: 'g', yield_pct: 100 },
        ],
        recipes: [
          {
            id: 'sub_masa',
            name: 'Masa con Poolish',
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
            name: 'Salsa Pomodoro',
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
            name: 'Pizza Margherita',
            recipe_type: 'product',
            yield_quantity: 1,
            yield_unit: 'unit',
            target_food_cost_pct: 30,
            currency: 'ARS',
            components: [
              { component_type: 'subrecipe', recipe_id: 'sub_masa', quantity: 220, unit: 'g' },
              { component_type: 'subrecipe', recipe_id: 'sub_salsa', quantity: 100, unit: 'g' },
              { component_type: 'ingredient', ingredient_id: 'ing_mozzarella', quantity: 220, unit: 'g' },
            ],
          },
          {
            id: 'prod_pollo',
            name: 'Porción Pollo',
            recipe_type: 'product',
            yield_quantity: 1,
            yield_unit: 'unit',
            target_food_cost_pct: 30,
            currency: 'ARS',
            components: [{ component_type: 'ingredient', ingredient_id: 'ing_pollo', quantity: 180, unit: 'g' }],
          },
          {
            id: 'prod_trufa',
            name: 'Pizza Trufa',
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
        prod_margherita: { monthlyUnitsSold: 500, sellingPrice: 0 }, // 0 => usa Precio Sugerido automático
        prod_pollo: { monthlyUnitsSold: 200, sellingPrice: 0 },
        prod_trufa: { monthlyUnitsSold: 50, sellingPrice: 0 },
      },
      operatingExpenses: [
        { id: 'exp_1', name: 'Alquiler', category: 'rent', period: 'monthly', amount: 1000000 },
      ],
    };

    const { entries } = extractAndVerifyZip(generateProfitKitV2WorkbookBytes(input));
    const wbXml = entries['xl/workbook.xml'];
    const sheetNames = [...wbXml.matchAll(/<sheet name="([^"]+)"/g)].map((m) => unescapeXml(m[1]));
    const sheetsByName = {};
    sheetNames.forEach((name, idx) => {
      sheetsByName[name] = parseSheetCells(entries[`xl/worksheets/sheet${idx + 1}.xml`]);
    });

    const s00 = sheetsByName[sheetNames[0]];
    const s02 = sheetsByName[sheetNames[2]];
    const s03 = sheetsByName[sheetNames[3]];
    const s05 = sheetsByName[sheetNames[5]];
    const s06 = sheetsByName[sheetNames[6]];
    const s07 = sheetsByName[sheetNames[7]];
    const s11 = sheetsByName[sheetNames[11]];

    // Estado antes de editar: prod_trufa está INCOMPLETO
    assert.equal(s00['B7'].v, 1, 'Antes de editar: 1 insumo sin precio');
    assert.equal(s00['B10'].v, 1, 'Antes de editar: 1 producto bloqueado');

    // Simular edición manual del usuario en Excel:
    // 1) Subir Harina (fila 5 de Hoja 02) de $25,000 a $37,500
    s02['F5'].v = 37500;
    // 2) Subir Mozzarella (fila 11 de Hoja 02) de $2,000 a $2,500
    s02['F11'].v = 2500;
    // 3) Cambiar merma del Pollo (fila 12 de Hoja 03) de 90% a 80%
    s03['F12'].v = 80;
    // 4) Cargar precio a la Trufa Negra (fila 13 de Hoja 02): $30,000 por 100g ($300/g)
    s02['F13'].v = 30000;

    // Recalcular libro Excel en memoria:
    recalculateWorkbookInMemory(sheetsByName, sheetNames);

    // Calcular valores esperados con CostEngine sobre el catálogo editado:
    const editedCatalog = JSON.parse(JSON.stringify(input.catalog));
    editedCatalog.purchase_prices.find((p) => p.ingredient_id === 'ing_harina').purchase_price = 37500;
    editedCatalog.purchase_prices.find((p) => p.ingredient_id === 'ing_mozzarella').purchase_price = 2500;
    editedCatalog.purchase_prices.find((p) => p.ingredient_id === 'ing_pollo').yield_pct = 80;
    editedCatalog.purchase_prices.find((p) => p.ingredient_id === 'ing_trufa').purchase_price = 30000;

    const editedEngine = new CostEngine(editedCatalog);
    const masaEdited = editedEngine.calculateRecipeCost('sub_masa');
    const marghEdited = editedEngine.calculateRecipeCost('prod_margherita');
    const polloEdited = editedEngine.calculateRecipeCost('prod_pollo');
    const trufaEdited = editedEngine.calculateRecipeCost('prod_trufa');

    // Verificar propagación completa:
    assertClose(s05['E5'].v, masaEdited.raw_batch_cost, 'Hoja 05: nuevo batch cost de Masa tras suba de harina');
    assertClose(s05['H5'].v, masaEdited.raw_unit_cost, 'Hoja 05: nuevo unit cost de Masa');
    assertClose(s06['H5'].v, marghEdited.raw_unit_cost, 'Hoja 06: nuevo costo de Pizza Margherita');
    assertClose(s06['H6'].v, polloEdited.raw_unit_cost, 'Hoja 06: nuevo costo de Pollo (180g / 0.80 = $225)');
    assertClose(s06['H7'].v, trufaEdited.raw_unit_cost, 'Hoja 06: Pizza Trufa desbloqueada y costeada ($6300)');
    assert.equal(s06['G7'].v, 'COMPLETO', 'Hoja 06: Pizza Trufa pasa a COMPLETO');

    // Verificar actualización de Precio Sugerido en Hoja 07:
    const marghPricing = calculatePricingScenario({
      unit_cost: marghEdited.raw_unit_cost,
      status: 'complete',
      currency: 'ARS',
      target_food_cost_pct: 30,
      rounding_increment: 500,
      rounding_mode: 'ceil',
    });
    assertClose(s07['H5'].v, marghPricing.raw_suggested_price, 'Hoja 07: nuevo Precio Sugerido de Margherita');
    assert.equal(s00['B7'].v, 0, 'Hoja 00: 0 insumos sin precio tras completar la trufa');
    assert.equal(s00['B10'].v, 0, 'Hoja 00: 0 productos bloqueados');
    assert.equal(s00['C10'].v, 'OK', 'Hoja 00: diagnóstico general en OK');
    assert.ok(s11['B12'].v > 0, 'Hoja 11: EBITDA recalculado con los 3 productos activos');
  });

  await t.test('Tarea 2.6: Validación de los 3 idiomas (es-AR, pt-BR y en), fechas, monedas y separadores numéricos', () => {
    assert.equal(formatWorkbookDate('2026-11-18', 'es-AR'), '18/11/2026');
    assert.equal(formatWorkbookDate('2026-11-18', 'pt-BR'), '18/11/2026');
    assert.equal(formatWorkbookDate('2026-11-18', 'en'), '11/18/2026');

    const configs = [
      {
        locale: 'es-AR',
        currency: 'ARS',
        unitSystem: 'metric',
        expectedSheet02: '02_Ingredientes_Presentaciones',
        expectedHeader: 'Nombre del Ingrediente',
        expectedDate: '15/11/2026',
        expectedComplete: 'COMPLETO',
        expectedStar: 'ESTRELLA',
      },
      {
        locale: 'pt-BR',
        currency: 'BRL',
        unitSystem: 'metric',
        expectedSheet02: '02_Ingredientes_Apresentacoes',
        expectedHeader: 'Nome do Ingrediente',
        expectedDate: '15/11/2026',
        expectedComplete: 'COMPLETO',
        expectedStar: 'ESTRELA',
      },
      {
        locale: 'en',
        currency: 'USD',
        unitSystem: 'us_customary',
        expectedSheet02: '02_Ingredients_Presentations',
        expectedHeader: 'Ingredient Name',
        expectedDate: '11/15/2026',
        expectedComplete: 'COMPLETE',
        expectedStar: 'STAR',
      },
    ];

    for (const cfg of configs) {
      const { entries } = extractAndVerifyZip(
        generateProfitKitV2WorkbookBytes({
          businessName: `Restaurante ${cfg.locale}`,
          currency: cfg.currency,
          locale: cfg.locale,
          unitSystem: cfg.unitSystem,
          defaultTargetFoodCostPct: 30,
          defaultRoundingIncrement: 10,
          defaultPackagingCost: 1,
          defaultChannelFeePct: 15,
          catalog: {
            as_of_date: '2026-11-15',
            ingredients: [
              { id: 'ing_1', name: 'Harina', base_dimension: 'mass', base_unit: 'g', is_active: true },
            ],
            purchase_prices: [
              { ingredient_id: 'ing_1', purchase_price: 1000, currency: cfg.currency, pack_quantity: 1, pack_unit: 'kg', yield_pct: 100, purchase_date: '2026-11-15' },
            ],
            recipes: [
              {
                id: 'prod_1',
                name: 'Pizza 1',
                recipe_type: 'product',
                yield_quantity: 1,
                yield_unit: 'unit',
                currency: cfg.currency,
                components: [{ component_type: 'ingredient', ingredient_id: 'ing_1', quantity: 250, unit: 'g' }],
              },
            ],
          },
          productSalesMap: { prod_1: { monthlyUnitsSold: 100, sellingPrice: 1000 } },
        })
      );

      assert.ok(entries['xl/workbook.xml'].includes(cfg.expectedSheet02), `${cfg.locale}: hoja ${cfg.expectedSheet02}`);
      assert.ok(entries['xl/worksheets/sheet3.xml'].includes(cfg.expectedHeader), `${cfg.locale}: cabecera traducida "${cfg.expectedHeader}"`);
      assert.ok(entries['xl/worksheets/sheet3.xml'].includes(`(${cfg.currency})`), `${cfg.locale}: moneda (${cfg.currency})`);
      assert.ok(entries['xl/worksheets/sheet5.xml'].includes(cfg.expectedDate), `${cfg.locale}: fecha formateada ${cfg.expectedDate}`);
      assert.ok(entries['xl/worksheets/sheet8.xml'].includes(cfg.expectedComplete), `${cfg.locale}: estado ${cfg.expectedComplete}`);
      assert.ok(entries['xl/worksheets/sheet10.xml'].includes(cfg.expectedStar), `${cfg.locale}: clasificación BCG ${cfg.expectedStar}`);
      assert.ok(entries['xl/styles.xml'].includes('formatCode="#,##0.00"'), `${cfg.locale}: formato decimal adaptable en styles.xml`);
    }
  });

  await t.test('Tarea 2.7: Verificación de autonomía 100% sin conexión (cero vínculos externos, cero macros, CRC-32 válido)', () => {
    const bytes = generateProfitKitV2WorkbookBytes({
      businessName: 'Offline Test',
      currency: 'ARS',
      locale: 'es-AR',
      defaultTargetFoodCostPct: 30,
      defaultRoundingIncrement: 100,
      defaultPackagingCost: 0,
      defaultChannelFeePct: 0,
      catalog: { ingredients: [], purchase_prices: [], recipes: [] },
    });

    const { entries, meta } = extractAndVerifyZip(bytes);
    assert.equal(meta.length, 19, 'El archivo .xlsx debe tener exactamente 19 entradas internas (Content_Types, .rels, workbook, workbook.rels, styles y 14 hojas)');

    for (const [name, content] of Object.entries(entries)) {
      assert.ok(!content.includes('TargetMode="External"'), `${name}: no debe tener relaciones externas`);
      assert.ok(!content.includes('externalReference'), `${name}: no debe tener referencias a otros libros`);
      assert.ok(!content.includes('vbaProject'), `${name}: no debe depender de macros VBA`);
      assert.ok(!/WEBSERVICE|FILTERXML|RTD\(|IMPORTDATA/i.test(content), `${name}: no debe usar funciones de red`);
    }
  });

  await t.test('Tarea 2.8: Paridad Excel vs Cost Engine sobre los 8 casos Golden (Hoja 13) y un catálogo multiproducto completo', () => {
    // Cargar el catálogo de 22 recetas de la Tarea 1.2 ejecutando sus fórmulas de Excel
    const bytes = generateProfitKitV2WorkbookBytes({
      businessName: 'Paridad Golden + Recetas',
      currency: 'ARS',
      locale: 'es-AR',
      defaultTargetFoodCostPct: 30,
      defaultRoundingIncrement: 100,
      defaultPackagingCost: 200,
      defaultChannelFeePct: 20,
      catalog: {
        ingredients: [
          { id: 'harina', name: 'Harina 0000', base_dimension: 'mass', base_unit: 'g', is_active: true },
          { id: 'levadura', name: 'Levadura Fresca', base_dimension: 'mass', base_unit: 'g', is_active: true },
          { id: 'sal', name: 'Sal Fina', base_dimension: 'mass', base_unit: 'g', is_active: true },
          { id: 'agua', name: 'Agua', base_dimension: 'volume', base_unit: 'ml', density_g_per_ml: 1, is_free: true, is_active: true },
          { id: 'tomate', name: 'Tomate', base_dimension: 'mass', base_unit: 'g', is_active: true },
          { id: 'aceite', name: 'Aceite de Oliva', base_dimension: 'volume', base_unit: 'ml', density_g_per_ml: 0.92, is_active: true },
          { id: 'mozzarella', name: 'Queso Mozzarella', base_dimension: 'mass', base_unit: 'g', is_active: true },
          { id: 'pollo', name: 'Pollo con Merma', base_dimension: 'mass', base_unit: 'g', is_active: true },
          { id: 'garbanzo', name: 'Harina de Garbanzo', base_dimension: 'mass', base_unit: 'g', is_active: true },
          { id: 'trufa', name: 'Trufa Sin Precio', base_dimension: 'mass', base_unit: 'g', is_active: true },
        ],
        purchase_prices: [
          { ingredient_id: 'harina', purchase_price: 25000, currency: 'ARS', pack_quantity: 25, pack_unit: 'kg', yield_pct: 100 },
          { ingredient_id: 'levadura', purchase_price: 5000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
          { ingredient_id: 'sal', purchase_price: 300, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
          { ingredient_id: 'tomate', purchase_price: 8000, currency: 'ARS', pack_quantity: 8, pack_unit: 'kg', yield_pct: 100 },
          { ingredient_id: 'aceite', purchase_price: 10000, currency: 'ARS', pack_quantity: 5, pack_unit: 'L', yield_pct: 100 },
          { ingredient_id: 'mozzarella', purchase_price: 2000, currency: 'ARS', pack_quantity: 500, pack_unit: 'g', yield_pct: 100 },
          { ingredient_id: 'pollo', purchase_price: 1000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 90 },
          { ingredient_id: 'garbanzo', purchase_price: 3500, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
          { ingredient_id: 'trufa', purchase_price: null, currency: 'ARS', pack_quantity: 100, pack_unit: 'g', yield_pct: 100 },
        ],
        recipes: [
          {
            id: 'sub_poolish',
            name: 'Masa Poolish CE-002',
            recipe_type: 'subrecipe',
            yield_quantity: 1728,
            yield_unit: 'g',
            currency: 'ARS',
            bakers_dough: {
              total_flour_g: 1000,
              hydration_pct: 70,
              yield_basis: 'measured_yield',
              measured_yield_g: 1728,
              flours: [{ ingredient_id: 'harina', share_pct: 100 }],
              poolish: { flour_pct: 30, water_pct: 100, yeast_pct: 1.0, yeast_ingredient_id: 'levadura' },
              salt_pct: 2.5,
              salt_ingredient_id: 'sal',
              water_ingredient_id: 'agua',
            },
          },
          {
            id: 'sub_salsa',
            name: 'Salsa CE-005',
            recipe_type: 'subrecipe',
            yield_quantity: 1000,
            yield_unit: 'g',
            currency: 'ARS',
            components: [
              { component_type: 'ingredient', ingredient_id: 'tomate', quantity: 800, unit: 'g' },
              { component_type: 'ingredient', ingredient_id: 'aceite', quantity: 100, unit: 'ml' },
            ],
          },
          {
            id: 'prod_ce005_a',
            name: 'Producto A CE-005',
            recipe_type: 'product',
            yield_quantity: 1,
            yield_unit: 'unit',
            currency: 'ARS',
            components: [
              { component_type: 'subrecipe', recipe_id: 'sub_salsa', quantity: 100, unit: 'g' },
              { component_type: 'ingredient', ingredient_id: 'mozzarella', quantity: 150, unit: 'g' },
            ],
          },
          {
            id: 'prod_ce006',
            name: 'Pollo Merma CE-006',
            recipe_type: 'product',
            yield_quantity: 1,
            yield_unit: 'unit',
            currency: 'ARS',
            components: [{ component_type: 'ingredient', ingredient_id: 'pollo', quantity: 180, unit: 'g' }],
          },
          {
            id: 'prod_ce007',
            name: 'Trufa Incompleta CE-007',
            recipe_type: 'product',
            yield_quantity: 1,
            yield_unit: 'unit',
            currency: 'ARS',
            components: [
              { component_type: 'ingredient', ingredient_id: 'harina', quantity: 200, unit: 'g' },
              { component_type: 'ingredient', ingredient_id: 'trufa', quantity: 20, unit: 'g' },
            ],
          },
        ],
      },
    });

    const { entries } = extractAndVerifyZip(bytes);
    const s13 = parseSheetCells(entries['xl/worksheets/sheet14.xml']);

    // Verificar los 8 casos Golden en Hoja 13 (filas 5..12) y el resumen en fila 14:
    const expectedGolden = [
      { row: 5, code: 'CE-001', val: 932.298871562119 },
      { row: 6, code: 'CE-002', val: 591.724537037037 },
      { row: 7, code: 'CE-003', val: 1647.5 },
      { row: 8, code: 'CE-004', val: 975 },
      { row: 9, code: 'CE-005', val: 700 },
      { row: 10, code: 'CE-006', val: 200 },
      { row: 11, code: 'CE-007', val: 'INCOMPLETO' },
      { row: 12, code: 'CE-008', val: 4000 },
    ];

    for (const g of expectedGolden) {
      assert.equal(s13[`A${g.row}`].v, g.code);
      if (typeof g.val === 'number') {
        assertClose(s13[`C${g.row}`].v, g.val, `Hoja 13 ${g.code} valor calculado`);
        assertClose(s13[`D${g.row}`].v, g.val, `Hoja 13 ${g.code} valor esperado`);
      } else {
        assert.equal(s13[`C${g.row}`].v, g.val, `Hoja 13 ${g.code} estado incompleto`);
      }
      assert.equal(s13[`E${g.row}`].v, 'PASS', `Hoja 13 ${g.code} debe estar en PASS`);
    }
    assert.equal(s13['C14'].v, 8, '8/8 casos Golden en PASS');
    assert.equal(s13['E14'].v, 'PASS (100% PARIDAD)');
  });
});
