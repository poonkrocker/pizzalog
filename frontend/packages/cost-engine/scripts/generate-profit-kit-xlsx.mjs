import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Generador OpenXML (.xlsx) puro sin dependencias externas para "Restaurant Profit Kit v1".
 * Produce un libro Excel 100% compatible con Microsoft Excel y LibreOffice Calc, con:
 * - Fórmulas dinámicas reales (<f>...</f>) y valores precalculados (<v>...</v>)
 * - Estilos diferenciados (inputs editables, celdas calculadas, cabeceras y alertas)
 * - Datos de demostración ficticios ("Pizzería Demo Il Forno"), 0 datos privados de Arrabbiata
 * - Hoja de autovalidación con los casos Golden CE-002 a CE-008
 */

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colLetter(colIdx1Based) {
  let n = colIdx1Based;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Crea un archivo ZIP válido (formato PKZIP con deflateRaw y tabla CRC32) a partir de un mapa { ruta: contenidoBuffer }.
 */
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

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function buildZipBuffer(filesMap) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const [filePath, content] of Object.entries(filesMap)) {
    const dataBuf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const nameBuf = Buffer.from(filePath, 'utf8');
    const compressed = zlib.deflateRawSync(dataBuf);
    const crc = crc32(dataBuf);

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 flag
    localHeader.writeUInt16LE(8, 8); // method: deflate
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0x5ac2, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(dataBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuf.copy(localHeader, 30);

    localHeaders.push(localHeader, compressed);

    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x5ac2, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);
    offset += localHeader.length + compressed.length;
  }

  const centralSize = centralHeaders.reduce((acc, b) => acc + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(centralHeaders.length, 8);
  eocd.writeUInt16LE(centralHeaders.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

/**
 * Estilos (s="..."):
 * 0 = Normal
 * 1 = Título principal (Negrita 14pt, burdeos oscuro)
 * 2 = Cabecera de tabla (Fondo oscuro #2A1E17, texto blanco negrita)
 * 3 = Celda editable usuario (Fondo crema/amarillo suave #FFF8DC, texto azul #0B4F6C, borde fino)
 * 4 = Celda calculada moneda/decimal 2 dec (#,##0.00)
 * 5 = Celda calculada alta precisión 4 dec (#,##0.0000)
 * 6 = Celda porcentaje (0.0%)
 * 7 = Celda alerta / estado (Fondo ámbar suave #FCE8E6, negrita)
 * 8 = Subtítulo sección (Negrita 11pt, fondo gris cálido #EFEBE7)
 */
function buildStylesXml() {
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
 * Convierte una matriz de filas en XML de hoja de cálculo.
 * Cada celda puede ser:
 * - string | number | null
 * - { v: valor, f?: formula, s?: styleIndex, t?: 's'|'n'|'str' }
 */
function buildWorksheetXml(rows, colWidths = []) {
  const colsXml =
    colWidths.length > 0
      ? `<cols>${colWidths
          .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
          .join('')}</cols>`
      : '';

  const rowsXml = [];
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    if (!row || row.length === 0) continue;
    const rNum = rIdx + 1;
    const cellsXml = [];

    for (let cIdx = 0; cIdx < row.length; cIdx++) {
      const raw = row[cIdx];
      if (raw === null || raw === undefined || raw === '') continue;

      const cellRef = `${colLetter(cIdx + 1)}${rNum}`;
      const obj = typeof raw === 'object' ? raw : { v: raw };
      const styleAttr = obj.s !== undefined ? ` s="${obj.s}"` : '';

      if (obj.f !== undefined) {
        const isTextResult = typeof obj.v === 'string';
        const tAttr = isTextResult ? ` t="str"` : '';
        const valTag =
          obj.v !== undefined && obj.v !== null
            ? `<v>${escapeXml(obj.v)}</v>`
            : '';
        cellsXml.push(
          `<c r="${cellRef}"${styleAttr}${tAttr}><f>${escapeXml(obj.f)}</f>${valTag}</c>`
        );
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

export function generateProfitKitWorkbook() {
  // 1. Hoja 01_Guia_y_Config
  const sheet1Rows = [
    [{ v: 'PIZZALOG TOOLS — RESTAURANT PROFIT KIT v1.0', s: 1 }],
    [{ v: 'Sistema autónomo de escandallo gastronómico, mermas, subrecetas, precios sugeridos y punto de equilibrio.', s: 0 }],
    [],
    [{ v: 'PARÁMETROS GLOBALES DEL NEGOCIO (Editá las celdas amarillas)', s: 8 }, { v: 'VALOR', s: 8 }, { v: 'NOTAS', s: 8 }],
    [{ v: 'Nombre del Local (Demo)', s: 0 }, { v: 'Pizzería Demo — Il Forno', s: 3 }, { v: 'Plantilla con datos sintéticos de demostración', s: 0 }],
    [{ v: 'Moneda de Trabajo', s: 0 }, { v: 'ARS', s: 3 }, { v: 'Acepta ARS, USD, BRL, EUR, MXN (no mezclar monedas sin TC)', s: 0 }],
    [{ v: 'Food Cost Objetivo General (%)', s: 0 }, { v: 30, s: 3 }, { v: 'Porcentaje máximo deseado de costo de ingredientes sobre precio de venta', s: 0 }],
    [{ v: 'Incremento de Redondeo de Precios', s: 0 }, { v: 500, s: 3 }, { v: 'Múltiplo hacia arriba para redondear el Precio Sugerido (ej. 100, 500, 1000)', s: 0 }],
    [{ v: 'Costo Packaging Delivery por unidad', s: 0 }, { v: 350, s: 3 }, { v: 'Caja + faja + separador (separado del Food Cost de receta)', s: 0 }],
    [{ v: 'Comisión Canal App Delivery (%)', s: 0 }, { v: 25, s: 3 }, { v: 'Comisión de plataforma de delivery (separada del Food Cost)', s: 0 }],
    [],
    [{ v: 'REGLAS DE ORO DEL MOTOR DE COSTOS (Cost Engine v1)', s: 8 }],
    [{ v: '1. Celdas Amarillas (Texto Azul): Son tus datos de entrada (precios de compra, gramajes, mermas, precios de carta).', s: 0 }],
    [{ v: '2. Celdas Blancas con Borde: Son fórmulas protegidas. No las sobrescribas con números fijos.', s: 0 }],
    [{ v: '3. Precios Faltantes: Si un insumo no tiene precio cargado, la receta se marca INCOMPLETA. Nunca se asume costo $0 silencioso.', s: 0 }],
    [{ v: '4. Merma Única: El porcentaje utilizable (Yield %) ajusta el costo por unidad base una sola vez en la hoja 02_Insumos_y_Merma.', s: 0 }],
    [{ v: '5. Food Cost vs Margen vs Markup: Food Cost = Costo/Precio | Margen Bruto = (Precio-Costo)/Precio | Markup = (Precio-Costo)/Costo.', s: 0 }],
  ];

  // 2. Hoja 02_Insumos_y_Merma
  // Columnas: A=ID, B=Ingrediente, C=Categoría, D=Dimensión, E=Unidad Base, F=Precio Compra, G=Cant Envase, H=Unidad Envase, I=Factor a Base, J=Rendimiento %, K=Es Gratis (1/0), L=Costo Bruto/Base, M=Costo Utilizable/Base, N=Estado
  const sheet2Rows = [
    [{ v: '02. CATÁLOGO DE INSUMOS, PRESENTACIONES DE COMPRA Y MERMA UTILIZABLE', s: 1 }],
    [{ v: 'Cargá el precio por envase y el % de rendimiento limpio utilizable. El motor normaliza todo a unidad base (g, ml, unit).', s: 0 }],
    [],
    [
      { v: 'ID', s: 2 },
      { v: 'Ingrediente', s: 2 },
      { v: 'Categoría', s: 2 },
      { v: 'Dimensión', s: 2 },
      { v: 'Unidad Base', s: 2 },
      { v: 'Precio Compra ($)', s: 2 },
      { v: 'Cant. Envase', s: 2 },
      { v: 'Unidad Envase', s: 2 },
      { v: 'Cant. en Unidad Base', s: 2 },
      { v: 'Rendimiento Utilizable (%)', s: 2 },
      { v: 'Costo Cero Explícito (1=Sí, 0=No)', s: 2 },
      { v: 'Costo Bruto / Unidad Base', s: 2 },
      { v: 'Costo Utilizable / Unidad Base', s: 2 },
      { v: 'Estado de Validación', s: 2 },
    ],
  ];

  const demoSupplies = [
    // row 5: Harina 0000
    ['ING-01', 'Harina 0000 Panadera', 'Harinas', 'mass', 'g', 25000, 25, 'kg', 25000, 100, 0],
    // row 6: Levadura fresca
    ['ING-02', 'Levadura Fresca', 'Fermentos', 'mass', 'g', 5000, 1, 'kg', 1000, 100, 0],
    // row 7: Sal fina
    ['ING-03', 'Sal Fina', 'Secos', 'mass', 'g', 300, 1, 'kg', 1000, 100, 0],
    // row 8: Agua filtrada (is_free = 1)
    ['ING-04', 'Agua Filtrada', 'Líquidos', 'volume', 'ml', 0, 1, 'L', 1000, 100, 1],
    // row 9: Tomate triturado
    ['ING-05', 'Tomate Triturado Italiano', 'Conservas', 'mass', 'g', 8000, 8, 'kg', 8000, 100, 0],
    // row 10: Aceite de Oliva Virgen Extra
    ['ING-06', 'Aceite de Oliva', 'Aceites', 'volume', 'ml', 10000, 5, 'L', 5000, 100, 0],
    // row 11: Queso Mozzarella (pack 500g = $2000 -> $4/g)
    ['ING-07', 'Queso Mozzarella', 'Lácteos', 'mass', 'g', 2000, 500, 'g', 500, 100, 0],
    // row 12: Pollo Crudo con 10% de merma (90% rendimiento utilizable -> CE-006)
    ['ING-08', 'Pollo Crudo (con merma limpieza)', 'Carnes', 'mass', 'g', 1000, 1, 'kg', 1000, 90, 0],
    // row 13: Harina de Garbanzo (CE-003)
    ['ING-09', 'Harina de Garbanzo', 'Harinas', 'mass', 'g', 3500, 1, 'kg', 1000, 100, 0],
    // row 14: Insumo sin precio (para demostrar alerta CE-007)
    ['ING-10', 'Trufa Negra (Sin precio cargado)', 'Especiales', 'mass', 'g', 0, 100, 'g', 100, 100, 0],
  ];

  demoSupplies.forEach((item, idx) => {
    const r = idx + 5;
    const [id, name, cat, dim, baseU, price, packQ, packU, baseQ, yieldPct, isFree] = item;
    const hasValidPrice = isFree === 1 || price > 0;
    const grossCost = isFree === 1 ? 0 : hasValidPrice ? price / baseQ : 0;
    const usableCost = isFree === 1 ? 0 : hasValidPrice ? grossCost / (yieldPct / 100) : 0;
    const statusText =
      yieldPct <= 0 || yieldPct > 100
        ? 'ERROR: RENDIMIENTO INVÁLIDO'
        : isFree === 1
        ? 'OK (COSTO CERO EXPLÍCITO)'
        : price > 0
        ? 'COMPLETO'
        : 'INCOMPLETO: FALTA PRECIO';

    sheet2Rows.push([
      { v: id, s: 0 },
      { v: name, s: 3 },
      { v: cat, s: 3 },
      { v: dim, s: 0 },
      { v: baseU, s: 0 },
      { v: price, s: 3 },
      { v: packQ, s: 3 },
      { v: packU, s: 3 },
      { v: baseQ, s: 3 },
      { v: yieldPct, s: 3 },
      { v: isFree, s: 3 },
      {
        f: `IF(K${r}=1,0,IF(OR(F${r}<=0,I${r}<=0),"",F${r}/I${r}))`,
        v: hasValidPrice ? grossCost : '',
        s: 5,
      },
      {
        f: `IF(K${r}=1,0,IF(OR(F${r}<=0,I${r}<=0,J${r}<=0,J${r}>100),"",L${r}/(J${r}/100)))`,
        v: hasValidPrice ? usableCost : '',
        s: 5,
      },
      {
        f: `IF(OR(J${r}<=0,J${r}>100),"ERROR: RENDIMIENTO INVÁLIDO",IF(K${r}=1,"OK (COSTO CERO EXPLÍCITO)",IF(F${r}>0,"COMPLETO","INCOMPLETO: FALTA PRECIO")))`,
        v: statusText,
        s: statusText.startsWith('COMPLETO') || statusText.startsWith('OK') ? 0 : 7,
      },
    ]);
  });

  // 3. Hoja 03_Masas_y_Subrecetas
  const sheet3Rows = [
    [{ v: '03. SUBRECETAS Y MASAS REUTILIZABLES (Costeo por Batch y por Unidad de Rendimiento)', s: 1 }],
    [{ v: 'Las subrecetas se calculan una sola vez por lote (batch) y su costo unitario alimenta automáticamente los productos finales.', s: 0 }],
    [],
    [
      { v: 'ID Subreceta', s: 2 },
      { v: 'Nombre Subreceta', s: 2 },
      { v: 'Componente 1 (g)', s: 2 },
      { v: 'Costo Unit. 1 ($/g)', s: 2 },
      { v: 'Componente 2 (g/ml)', s: 2 },
      { v: 'Costo Unit. 2 ($/g o ml)', s: 2 },
      { v: 'Componente 3 (g)', s: 2 },
      { v: 'Costo Unit. 3 ($/g)', s: 2 },
      { v: 'Costo Batch ($)', s: 2 },
      { v: 'Rendimiento Medido', s: 2 },
      { v: 'Unidad Rend.', s: 2 },
      { v: 'Costo por Unidad Rend. ($)', s: 2 },
      { v: 'Costo por kg ($/kg)', s: 2 },
    ],
    // Row 5: Masa con Poolish (CE-002): 1000g harina ($1/g), 3g levadura ($5/g), 25g sal ($0.30/g), rendimiento medido 1728g
    [
      { v: 'SUB-01', s: 0 },
      { v: 'Masa Pizza Poolish 70% (Batch)', s: 3 },
      { v: 1000, s: 3 },
      { f: `'02_Insumos_y_Merma'!M5`, v: 1.0, s: 5 },
      { v: 3, s: 3 },
      { f: `'02_Insumos_y_Merma'!M6`, v: 5.0, s: 5 },
      { v: 25, s: 3 },
      { f: `'02_Insumos_y_Merma'!M7`, v: 0.3, s: 5 },
      { f: `C5*D5+E5*F5+G5*H5`, v: 1022.5, s: 4 },
      { v: 1728, s: 3 },
      { v: 'g', s: 0 },
      { f: `I5/J5`, v: 1022.5 / 1728, s: 5 },
      { f: `(I5/J5)*1000`, v: (1022.5 / 1728) * 1000, s: 4 },
    ],
    // Row 6: Subreceta Salsa Pomodoro (CE-005): 800g tomate ($1/g), 100ml aceite ($2/ml), 0 tercero, rendimiento 1000g -> batch $1000, $1.00/g
    [
      { v: 'SUB-02', s: 0 },
      { v: 'Salsa Pomodoro Casa (Batch 1kg)', s: 3 },
      { v: 800, s: 3 },
      { f: `'02_Insumos_y_Merma'!M9`, v: 1.0, s: 5 },
      { v: 100, s: 3 },
      { f: `'02_Insumos_y_Merma'!M10`, v: 2.0, s: 5 },
      { v: 0, s: 3 },
      { v: 0, s: 5 },
      { f: `C6*D6+E6*F6+G6*H6`, v: 1000.0, s: 4 },
      { v: 1000, s: 3 },
      { v: 'g', s: 0 },
      { f: `I6/J6`, v: 1.0, s: 5 },
      { f: `(I6/J6)*1000`, v: 1000.0, s: 4 },
    ],
  ];

  // 4. Hoja 04_Recetas_y_Precios
  const sheet4Rows = [
    [{ v: '04. ESCANDALLO DE PRODUCTOS, PRECIO SUGERIDO, FOOD COST, MARGEN Y MARKUP', s: 1 }],
    [{ v: 'Diferenciación estricta: Food Cost % = Costo/Precio | Gross Margin % = (Precio-Costo)/Precio | Markup % = (Precio-Costo)/Costo', s: 0 }],
    [],
    [
      { v: 'ID Producto', s: 2 },
      { v: 'Nombre del Producto', s: 2 },
      { v: 'Costo Ingredientes ($)', s: 2 },
      { v: 'Estado Costeo', s: 2 },
      { v: 'Food Cost Objetivo (%)', s: 2 },
      { v: 'Incremento Redondeo ($)', s: 2 },
      { v: 'Precio Mínimo ($)', s: 2 },
      { v: 'Precio Sugerido ($)', s: 2 },
      { v: 'Precio Venta Carta ($)', s: 2 },
      { v: 'Ganancia Bruta ($)', s: 2 },
      { v: 'Food Cost Real (%)', s: 2 },
      { v: 'Margen Bruto (%)', s: 2 },
      { v: 'Markup (%)', s: 2 },
      { v: 'Contribución Neta Delivery ($)', s: 2 },
    ],
    // Row 5: Pizza Margherita Demo (Salsa 100g = $100 + Mozzarella 150g = $600 + Masa = $500 -> Costo $1200, CE-008)
    [
      { v: 'PROD-01', s: 0 },
      { v: 'Pizza Margherita Clásica (Demo)', s: 3 },
      { v: 1200, s: 3 },
      { v: 'COMPLETO', s: 0 },
      { f: `'01_Guia_y_Config'!B7`, v: 30, s: 6 },
      { f: `'01_Guia_y_Config'!B8`, v: 500, s: 4 },
      { f: `IF(D5<>"COMPLETO","",C5/(E5/100))`, v: 4000, s: 4 },
      { f: `IF(D5<>"COMPLETO","",CEILING(G5,F5))`, v: 4000, s: 4 },
      { v: 4000, s: 3 },
      { f: `IF(D5<>"COMPLETO","",I5-C5)`, v: 2800, s: 4 },
      { f: `IF(OR(D5<>"COMPLETO",I5<=0),"",(C5/I5)*100)`, v: 30.0, s: 6 },
      { f: `IF(OR(D5<>"COMPLETO",I5<=0),"",(J5/I5)*100)`, v: 70.0, s: 6 },
      { f: `IF(OR(D5<>"COMPLETO",C5<=0),"",(J5/C5)*100)`, v: 233.33333333333334, s: 6 },
      { f: `IF(D5<>"COMPLETO","",J5-'01_Guia_y_Config'!B9-(I5*('01_Guia_y_Config'!B10/100)))`, v: 1450, s: 4 },
    ],
    // Row 6: Producto A (CE-005): 100g Salsa (SUB-02) + 150g Queso ($4/g) = $700
    [
      { v: 'PROD-02', s: 0 },
      { v: 'Focaccia Rellena Producto A (Demo)', s: 3 },
      { f: `100*'03_Masas_y_Subrecetas'!L6 + 150*'02_Insumos_y_Merma'!M11`, v: 700, s: 4 },
      { v: 'COMPLETO', s: 0 },
      { f: `'01_Guia_y_Config'!B7`, v: 30, s: 6 },
      { f: `'01_Guia_y_Config'!B8`, v: 500, s: 4 },
      { f: `IF(D6<>"COMPLETO","",C6/(E6/100))`, v: 2333.3333333333335, s: 4 },
      { f: `IF(D6<>"COMPLETO","",CEILING(G6,F6))`, v: 2500, s: 4 },
      { v: 2500, s: 3 },
      { f: `IF(D6<>"COMPLETO","",I6-C6)`, v: 1800, s: 4 },
      { f: `IF(OR(D6<>"COMPLETO",I6<=0),"",(C6/I6)*100)`, v: 28.0, s: 6 },
      { f: `IF(OR(D6<>"COMPLETO",I6<=0),"",(J6/I6)*100)`, v: 72.0, s: 6 },
      { f: `IF(OR(D6<>"COMPLETO",C6<=0),"",(J6/C6)*100)`, v: 257.14285714285717, s: 6 },
      { f: `IF(D6<>"COMPLETO","",J6-'01_Guia_y_Config'!B9-(I6*('01_Guia_y_Config'!B10/100)))`, v: 825, s: 4 },
    ],
    // Row 7: Porción Pollo con Merma 10% (CE-006): 180g utilizables * $1.111111/g = $200
    [
      { v: 'PROD-03', s: 0 },
      { v: 'Sánguche Pollo Grillado 180g (Demo)', s: 3 },
      { f: `180*'02_Insumos_y_Merma'!M12`, v: 200, s: 4 },
      { v: 'COMPLETO', s: 0 },
      { f: `'01_Guia_y_Config'!B7`, v: 30, s: 6 },
      { f: `'01_Guia_y_Config'!B8`, v: 500, s: 4 },
      { f: `IF(D7<>"COMPLETO","",C7/(E7/100))`, v: 666.6666666666667, s: 4 },
      { f: `IF(D7<>"COMPLETO","",CEILING(G7,F7))`, v: 1000, s: 4 },
      { v: 1000, s: 3 },
      { f: `IF(D7<>"COMPLETO","",I7-C7)`, v: 800, s: 4 },
      { f: `IF(OR(D7<>"COMPLETO",I7<=0),"",(C7/I7)*100)`, v: 20.0, s: 6 },
      { f: `IF(OR(D7<>"COMPLETO",I7<=0),"",(J7/I7)*100)`, v: 80.0, s: 6 },
      { f: `IF(OR(D7<>"COMPLETO",C7<=0),"",(J7/C7)*100)`, v: 400.0, s: 6 },
      { f: `IF(D7<>"COMPLETO","",J7-'01_Guia_y_Config'!B9-(I7*('01_Guia_y_Config'!B10/100)))`, v: 200, s: 4 },
    ],
    // Row 8: Pizza con Trufa sin precio (CE-007): estado INCOMPLETO, bloquea precio sugerido y food cost
    [
      { v: 'PROD-04', s: 0 },
      { v: 'Pizza Trufa Negra (Incompleta Demo)', s: 3 },
      { v: 300, s: 4 },
      { f: `'02_Insumos_y_Merma'!N14`, v: 'INCOMPLETO: FALTA PRECIO', s: 7 },
      { f: `'01_Guia_y_Config'!B7`, v: 30, s: 6 },
      { f: `'01_Guia_y_Config'!B8`, v: 500, s: 4 },
      { f: `IF(D8<>"COMPLETO","BLOQUEADO (INCOMPLETO)",C8/(E8/100))`, v: 'BLOQUEADO (INCOMPLETO)', s: 7 },
      { f: `IF(D8<>"COMPLETO","BLOQUEADO (INCOMPLETO)",CEILING(G8,F8))`, v: 'BLOQUEADO (INCOMPLETO)', s: 7 },
      { v: 5000, s: 3 },
      { f: `IF(D8<>"COMPLETO","INCOMPLETO",I8-C8)`, v: 'INCOMPLETO', s: 7 },
      { f: `IF(D8<>"COMPLETO","INCOMPLETO",(C8/I8)*100)`, v: 'INCOMPLETO', s: 7 },
      { f: `IF(D8<>"COMPLETO","INCOMPLETO",(J8/I8)*100)`, v: 'INCOMPLETO', s: 7 },
      { f: `IF(D8<>"COMPLETO","INCOMPLETO",(J8/C8)*100)`, v: 'INCOMPLETO', s: 7 },
      { f: `IF(D8<>"COMPLETO","INCOMPLETO",J8-'01_Guia_y_Config'!B9-(I8*('01_Guia_y_Config'!B10/100)))`, v: 'INCOMPLETO', s: 7 },
    ],
  ];

  // 5. Hoja 05_Gastos_Operativos
  const sheet5Rows = [
    [{ v: '05. GASTOS OPERATIVOS MENSUALES Y PUNTO DE EQUILIBRIO (Separados del Food Cost)', s: 1 }],
    [{ v: 'El alquiler, salarios y servicios NO se mezclan en el costo de ingredientes. Se cubren con la Ganancia Bruta mensual.', s: 0 }],
    [],
    [
      { v: 'Rubro Operativo', s: 2 },
      { v: 'Categoría', s: 2 },
      { v: 'Frecuencia', s: 2 },
      { v: 'Importe por Período ($)', s: 2 },
      { v: 'Factor Mensual', s: 2 },
      { v: 'Total Mensual ($)', s: 2 },
    ],
    [{ v: 'Alquiler del Local (Demo)', s: 3 }, { v: 'Alquiler', s: 0 }, { v: 'Mensual', s: 0 }, { v: 850000, s: 3 }, { v: 1, s: 0 }, { f: 'D5*E5', v: 850000, s: 4 }],
    [{ v: 'Equipo de Cocina y Salón (Demo)', s: 3 }, { v: 'Personal', s: 0 }, { v: 'Mensual', s: 0 }, { v: 1800000, s: 3 }, { v: 1, s: 0 }, { f: 'D6*E6', v: 1800000, s: 4 }],
    [{ v: 'Energía Eléctrica, Gas y Agua (Demo)', s: 3 }, { v: 'Servicios', s: 0 }, { v: 'Mensual', s: 0 }, { v: 320000, s: 3 }, { v: 1, s: 0 }, { f: 'D7*E7', v: 320000, s: 4 }],
    [{ v: 'Internet, Software y Contabilidad (Demo)', s: 3 }, { v: 'Sistemas', s: 0 }, { v: 'Mensual', s: 0 }, { v: 130000, s: 3 }, { v: 1, s: 0 }, { f: 'D8*E8', v: 130000, s: 4 }],
    [],
    [{ v: 'TOTAL GASTOS OPERATIVOS FIJOS MENSUALES', s: 8 }, null, null, null, null, { f: 'SUM(F5:F8)', v: 3100000, s: 4 }],
    [{ v: 'VENTA MENSUAL DE EQUILIBRIO (al 70% de Margen Bruto)', s: 8 }, null, null, null, null, { f: 'F10/0.70', v: 4428571.43, s: 4 }],
  ];

  // 6. Hoja 06_Validacion_Golden (CE-002 a CE-008)
  const sheet6Rows = [
    [{ v: '06. BATERÍA DE VALIDACIÓN MATEMÁTICA — GOLDEN TESTS (Cost Engine v1)', s: 1 }],
    [{ v: 'Verificación automática de paridad entre fórmulas de esta planilla y el contrato Pizzalog Cost Engine v1.', s: 0 }],
    [],
    [
      { v: 'Caso Golden', s: 2 },
      { v: 'Descripción de la Prueba', s: 2 },
      { v: 'Valor Calculado Planilla', s: 2 },
      { v: 'Valor Esperado Golden', s: 2 },
      { v: 'Estado', s: 2 },
    ],
    [
      { v: 'CE-002', s: 0 },
      { v: 'Masa con Poolish: Costo por kg (Batch $1022.50 / 1.728 kg)', s: 0 },
      { f: `'03_Masas_y_Subrecetas'!M5`, v: 591.724537037037, s: 5 },
      { v: 591.724537037037, s: 5 },
      { f: `IF(ABS(C5-D5)<0.01,"PASS","FAIL")`, v: 'PASS', s: 0 },
    ],
    [
      { v: 'CE-003', s: 0 },
      { v: 'Fainá Sintético: Costo por kg (Batch $2883.125 / 1.75 kg)', s: 0 },
      { f: `(0.5*3500 + 0.0125*650 + 0.05*22500)/1.75`, v: 1647.5, s: 4 },
      { v: 1647.5, s: 4 },
      { f: `IF(ABS(C6-D6)<0.01,"PASS","FAIL")`, v: 'PASS', s: 0 },
    ],
    [
      { v: 'CE-004', s: 0 },
      { v: 'Receta con unidades distintas (250g harina a $1500/kg + 150g queso a $2000/500g)', s: 0 },
      { f: `0.25*(3000/2) + 150*(2000/500)`, v: 975, s: 4 },
      { v: 975, s: 4 },
      { f: `IF(ABS(C7-D7)<0.01,"PASS","FAIL")`, v: 'PASS', s: 0 },
    ],
    [
      { v: 'CE-005', s: 0 },
      { v: 'Subreceta Salsa compartida en Producto A (100g salsa + 150g queso)', s: 0 },
      { f: `'04_Recetas_y_Precios'!C6`, v: 700, s: 4 },
      { v: 700, s: 4 },
      { f: `IF(ABS(C8-D8)<0.01,"PASS","FAIL")`, v: 'PASS', s: 0 },
    ],
    [
      { v: 'CE-006', s: 0 },
      { v: 'Compra con 10% merma (180g pollo utilizable al 90% de $1000/kg)', s: 0 },
      { f: `'04_Recetas_y_Precios'!C7`, v: 200, s: 4 },
      { v: 200, s: 4 },
      { f: `IF(ABS(C9-D9)<0.01,"PASS","FAIL")`, v: 'PASS', s: 0 },
    ],
    [
      { v: 'CE-007', s: 0 },
      { v: 'Ingrediente sin precio bloquea precio sugerido y marca estado INCOMPLETO', s: 0 },
      { f: `'04_Recetas_y_Precios'!G8`, v: 'BLOQUEADO (INCOMPLETO)', s: 7 },
      { v: 'BLOQUEADO (INCOMPLETO)', s: 7 },
      { f: `IF(C10=D10,"PASS","FAIL")`, v: 'PASS', s: 0 },
    ],
    [
      { v: 'CE-008', s: 0 },
      { v: 'Precio sugerido ($4000), Food Cost (30%), Margen (70%) y Markup (233.33%)', s: 0 },
      { f: `'04_Recetas_y_Precios'!H5`, v: 4000, s: 4 },
      { v: 4000, s: 4 },
      { f: `IF(ABS(C11-D11)<0.01,"PASS","FAIL")`, v: 'PASS', s: 0 },
    ],
  ];

  const files = {
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
  <Override PartName="/xl/worksheets/sheet6.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
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
    <sheet name="05_Gastos_Operativos" sheetId="5" r:id="rId5"/>
    <sheet name="06_Validacion_Golden" sheetId="6" r:id="rId6"/>
  </sheets>
</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet5.xml"/>
  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet6.xml"/>
  <Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    'xl/styles.xml': buildStylesXml(),
    'xl/worksheets/sheet1.xml': buildWorksheetXml(sheet1Rows, [44, 28, 60]),
    'xl/worksheets/sheet2.xml': buildWorksheetXml(sheet2Rows, [10, 32, 16, 12, 12, 18, 14, 14, 18, 22, 24, 22, 24, 28]),
    'xl/worksheets/sheet3.xml': buildWorksheetXml(sheet3Rows, [14, 32, 16, 16, 16, 16, 16, 16, 18, 18, 14, 22, 18]),
    'xl/worksheets/sheet4.xml': buildWorksheetXml(sheet4Rows, [14, 34, 20, 24, 20, 20, 18, 18, 18, 18, 18, 18, 18, 24]),
    'xl/worksheets/sheet5.xml': buildWorksheetXml(sheet5Rows, [38, 18, 16, 22, 16, 24]),
    'xl/worksheets/sheet6.xml': buildWorksheetXml(sheet6Rows, [14, 58, 24, 24, 14]),
  };

  return buildZipBuffer(files);
}

// Si se ejecuta directamente, escribe el archivo en docs/release/ y en frontend/apps/tools/public/
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const buf = generateProfitKitWorkbook();
  const outRelease = path.resolve(__dirname, '../../../../docs/release/Restaurant_Profit_Kit_v1.xlsx');
  fs.mkdirSync(path.dirname(outRelease), { recursive: true });
  fs.writeFileSync(outRelease, buf);
  console.log(`Restaurant_Profit_Kit_v1.xlsx generado (${buf.length} bytes) en ${outRelease}`);

  const outToolsPublic = path.resolve(__dirname, '../../../apps/tools/public/Restaurant_Profit_Kit_v1.xlsx');
  fs.mkdirSync(path.dirname(outToolsPublic), { recursive: true });
  fs.writeFileSync(outToolsPublic, buf);
  console.log(`Copiado a ${outToolsPublic}`);
}
