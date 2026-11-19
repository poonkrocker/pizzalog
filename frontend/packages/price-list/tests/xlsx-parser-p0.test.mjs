import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

import { parseImportFile } from '../dist/fileParser.js';

// Minimal XML DOM shim for Node 20 so the real browser XLSX parser runs directly on real ZIP/XML fixtures
class XmlElement {
  constructor(tagName, attrs = {}) {
    this.tagName = tagName;
    this.localName = tagName.includes(':') ? tagName.split(':').pop() : tagName;
    this.attrs = attrs;
    this.children = [];
    this._textParts = [];
  }

  get textContent() {
    if (this.children.length === 0) return this._textParts.join('');
    let out = this._textParts.join('');
    for (const child of this.children) out += child.textContent;
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
    const walk = (node) => {
      for (const child of node.children) {
        if (name === '*' || child.tagName === name) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  getElementsByTagNameNS(_ns, localName) {
    const out = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (localName === '*' || child.localName === localName) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
}

function unescapeXml(str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseXmlMinimal(xml) {
  const root = new XmlElement('#document');
  const stack = [root];
  const cleaned = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const tokenRe = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^<>]*?)?)(\/?)>|([^<]+)/g;
  let match;
  while ((match = tokenRe.exec(cleaned)) !== null) {
    const [, closing, tag, attrStr, selfClosing, text] = match;
    const parent = stack[stack.length - 1];
    if (text !== undefined) {
      if (parent && text.length > 0) parent._textParts.push(unescapeXml(text));
      continue;
    }
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs = {};
    const attrRe = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g;
    let am;
    while ((am = attrRe.exec(attrStr || '')) !== null) {
      attrs[am[1]] = unescapeXml(am[2]);
    }
    const el = new XmlElement(tag, attrs);
    parent.children.push(el);
    if (!selfClosing) stack.push(el);
  }
  return root;
}

if (typeof globalThis.DOMParser === 'undefined') {
  globalThis.DOMParser = class DOMParser {
    parseFromString(str) {
      return parseXmlMinimal(str);
    }
  };
}

// Real ZIP builder (Deflate method 8) for binary XLSX fixtures
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
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(rawBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    localParts.push(local, deflated);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(rawBuf.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);

    centralParts.push(central);
    offset += local.length + deflated.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(centralParts.length, 8);
  eocd.writeUInt16LE(centralParts.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

function colLetter(idx) {
  let n = idx + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function makeSheetXml(rowsXml) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowsXml}</sheetData>
</worksheet>`;
}

function makeXlsxFile(name, { sheets, relsOverride = null, extraFiles = {} }) {
  const wbSheetsXml = sheets
    .map((s, idx) => {
      const stateAttr = s.state ? ` state="${s.state}"` : '';
      const rId = s.rId ?? `rId${idx + 1}`;
      return `<sheet name="${s.name}" sheetId="${idx + 1}"${stateAttr} r:id="${rId}"/>`;
    })
    .join('');

  const relsXml = relsOverride ?? sheets
    .map((s, idx) => {
      const rId = s.rId ?? `rId${idx + 1}`;
      const target = s.target ?? `worksheets/sheet${idx + 1}.xml`;
      return `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${target}"/>`;
    })
    .join('');

  const entries = {
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${wbSheetsXml}</sheets>
</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relsXml}</Relationships>`,
    ...extraFiles,
  };

  sheets.forEach((s, idx) => {
    if (s.xml !== undefined && s.omitFile !== true) {
      const target = s.target ?? `worksheets/sheet${idx + 1}.xml`;
      const zipPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
      entries[zipPath] = s.xml;
    }
  });

  const zipBuf = buildZip(entries);
  return new File([zipBuf], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

test('Fase 2.3 — Parser XLSX P0: relaciones inválidas, hojas ocultas/vacías, fórmulas y límites sin omisiones silenciosas', async (t) => {
  await t.test('1. Hoja con relación inválida interrumpe la importación e identifica la hoja afectada', async () => {
    const file = makeXlsxFile('rel-invalida.xlsx', {
      sheets: [
        {
          name: 'Insumos',
          rId: 'rId1',
          xml: makeSheetXml('<row r="1"><c r="A1" t="inlineStr"><is><t>Harina</t></is></c></row>'),
        },
        {
          name: 'Recetas Rotas',
          rId: 'rId99',
          omitFile: true,
        },
      ],
      relsOverride: '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
    });

    await assert.rejects(
      () => parseImportFile(file),
      (err) => {
        assert.match(err.message, /Recetas Rotas/);
        assert.match(err.message, /relación interna válida/i);
        return true;
      }
    );
  });

  await t.test('1b. Hoja con relación apuntando a archivo XML inexistente falla identificando la hoja', async () => {
    const file = makeXlsxFile('target-inexistente.xlsx', {
      sheets: [
        {
          name: 'Costos Ocultos',
          rId: 'rId1',
          target: 'worksheets/missing_sheet.xml',
          omitFile: true,
        },
      ],
    });

    await assert.rejects(
      () => parseImportFile(file),
      (err) => {
        assert.match(err.message, /Costos Ocultos/);
        assert.match(err.message, /no existe dentro del XLSX/i);
        return true;
      }
    );
  });

  await t.test('2. Hoja oculta (state="hidden") se importa completa con advertencia explícita', async () => {
    const file = makeXlsxFile('hoja-oculta.xlsx', {
      sheets: [
        {
          name: 'Precios Internos',
          state: 'hidden',
          xml: makeSheetXml(
            '<row r="1"><c r="A1" t="inlineStr"><is><t>Producto</t></is></c><c r="B1" t="inlineStr"><is><t>Precio</t></is></c></row>' +
            '<row r="2"><c r="A2" t="inlineStr"><is><t>Muzzarella</t></is></c><c r="B2"><v>8900</v></c></row>'
          ),
        },
      ],
    });

    const parsed = await parseImportFile(file, { raw: true });
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].name, 'Precios Internos');
    assert.deepEqual(parsed[0].rows[1], ['Muzzarella', '8900']);
    assert.ok(parsed[0].warnings?.some((w) => w.includes('oculta')));
  });

  await t.test('3. Hoja vacía no genera filas falsas; libro completamente vacío falla claramente', async () => {
    const emptyBook = makeXlsxFile('vacio.xlsx', {
      sheets: [{ name: 'Vacia', xml: makeSheetXml('') }],
    });
    await assert.rejects(() => parseImportFile(emptyBook), /No se encontraron hojas con datos/i);

    const mixedBook = makeXlsxFile('mixto.xlsx', {
      sheets: [
        { name: 'Vacia', xml: makeSheetXml('') },
        {
          name: 'Datos',
          xml: makeSheetXml('<row r="1"><c r="A1" t="inlineStr"><is><t>Harina</t></is></c><c r="B1"><v>1500</v></c></row>'),
        },
      ],
    });
    const parsed = await parseImportFile(mixedBook, { raw: true });
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].name, 'Datos');
  });

  await t.test('4. Hoja con rangos formateados sin datos (<c s="1"/>) no inventa datos', async () => {
    const file = makeXlsxFile('formateado-vacio.xlsx', {
      sheets: [
        {
          name: 'SoloFormato',
          xml: makeSheetXml(
            '<row r="1"><c r="A1" s="1"/><c r="B1" s="2"/><c r="C1" s="3"/></row>' +
            '<row r="2"><c r="A2" s="1"/><c r="B2" s="2"/></row>'
          ),
        },
      ],
    });

    await assert.rejects(() => parseImportFile(file), /No se encontraron hojas con datos/i);
  });

  await t.test('5. Hoja con fórmulas sin valor cacheado evalúa aritmética simple y advierte fórmulas complejas', async () => {
    const file = makeXlsxFile('formulas-sin-cache.xlsx', {
      sheets: [
        {
          name: 'Calculos',
          xml: makeSheetXml(
            '<row r="1"><c r="A1" t="inlineStr"><is><t>Item</t></is></c><c r="B1" t="inlineStr"><is><t>Valor</t></is></c></row>' +
            '<row r="2"><c r="A2" t="inlineStr"><is><t>Suma Simple</t></is></c><c r="B2"><f>1000+250*2</f></c></row>' +
            '<row r="3"><c r="A3" t="inlineStr"><is><t>Ref Sin Cache</t></is></c><c r="B3"><f>SUM(B2:B2)</f></c></row>'
          ),
        },
      ],
    });

    const parsed = await parseImportFile(file);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].rows[1][1], '1500');
    assert.ok(parsed[0].warnings?.some((w) => w.includes('fórmulas aritméticas simples sin valor guardado')));
    assert.ok(parsed[0].warnings?.some((w) => w.includes('fórmulas sin valor guardado')));
  });

  await t.test('6. Libro con fórmulas entre hojas conserva valores cacheados y emite advertencia de dependencias', async () => {
    const file = makeXlsxFile('formulas-entre-hojas.xlsx', {
      sheets: [
        {
          name: 'Insumos',
          xml: makeSheetXml('<row r="1"><c r="A1" t="inlineStr"><is><t>Harina</t></is></c><c r="B1"><v>1200</v></c></row>'),
        },
        {
          name: 'Recetas',
          xml: makeSheetXml(
            '<row r="1"><c r="A1" t="inlineStr"><is><t>Pizza</t></is></c><c r="B1"><f>Insumos!B1*0.25</f><v>300</v></c></row>'
          ),
        },
      ],
    });

    const parsed = await parseImportFile(file, { raw: true });
    assert.equal(parsed.length, 2);
    assert.equal(parsed[1].rows[0][1], '300');
    assert.ok(parsed[1].warnings?.some((w) => w.includes('referencias entre hojas')));
  });

  await t.test('7. Libro con más de 5 hojas (7 hojas) se importa completo sin recortar hojas', async () => {
    const sheets = Array.from({ length: 7 }, (_, i) => ({
      name: `Hoja_${i + 1}`,
      xml: makeSheetXml(`<row r="1"><c r="A1" t="inlineStr"><is><t>Dato_${i + 1}</t></is></c><c r="B1"><v>${(i + 1) * 100}</v></c></row>`),
    }));
    const file = makeXlsxFile('siete-hojas.xlsx', { sheets });
    const parsed = await parseImportFile(file, { raw: true });
    assert.equal(parsed.length, 7);
    assert.equal(parsed[6].name, 'Hoja_7');
    assert.equal(parsed[6].rows[0][0], 'Dato_7');
  });

  await t.test('8. Libro con más de 25 columnas (30 columnas) conserva todas las columnas sin recortar', async () => {
    const cells = Array.from({ length: 30 }, (_, c) => `<c r="${colLetter(c)}1"><v>${c + 1}</v></c>`).join('');
    const file = makeXlsxFile('treinta-columnas.xlsx', {
      sheets: [{ name: 'Ancha', xml: makeSheetXml(`<row r="1">${cells}</row>`) }],
    });
    const parsed = await parseImportFile(file, { raw: true });
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].rows[0].length, 30);
    assert.equal(parsed[0].rows[0][29], '30');
  });

  await t.test('9. Libro con más de 30 hojas (31 hojas) falla claramente sin omitir hojas silenciosamente', async () => {
    const sheets = Array.from({ length: 31 }, (_, i) => ({
      name: `H_${i + 1}`,
      xml: makeSheetXml(`<row r="1"><c r="A1"><v>${i + 1}</v></c></row>`),
    }));
    const file = makeXlsxFile('31-hojas.xlsx', { sheets });
    await assert.rejects(() => parseImportFile(file), /límite seguro de 30 hojas/i);
  });

  await t.test('10. Libro con más de 200 columnas (201 columnas) falla claramente sin recortar columnas', async () => {
    const lastCol = colLetter(200); // index 200 = 201st column (GS)
    const file = makeXlsxFile('201-columnas.xlsx', {
      sheets: [{ name: 'Excedida', xml: makeSheetXml(`<row r="1"><c r="A1"><v>1</v></c><c r="${lastCol}1"><v>201</v></c></row>`) }],
    });
    await assert.rejects(() => parseImportFile(file), /límite seguro de 200 columnas/i);
  });
});
