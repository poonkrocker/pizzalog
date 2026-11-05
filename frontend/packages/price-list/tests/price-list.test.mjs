import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseMoney,
  parsePresentation,
  detectPriceListColumns,
  extractPriceListItems,
  matchPriceList,
  nameSimilarity,
  computePricePerUnit,
  rematch,
  summarizeMatches,
  buildAliasKey,
} from '../dist/priceList.js';

const catalog = [
  { id: 'mozz', name: 'Mozzarella', unit: 'kg', current_price_per_unit: 6200 },
  { id: 'flour', name: 'Harina 0000', unit: 'kg', current_price_per_unit: 900 },
  { id: 'oil', name: 'Aceite de oliva', unit: 'l', current_price_per_unit: 12000 },
  { id: 'eggs', name: 'Huevo', unit: 'u', current_price_per_unit: 150 },
  { id: 'ham', name: 'Jamón cocido', unit: 'kg', current_price_per_unit: 9000 },
];

describe('Price list — parseo de importes', () => {
  it('interpreta formato argentino, anglosajón y numérico de Excel', () => {
    assert.equal(parseMoney('$ 6.850,50'), 6850.5);
    assert.equal(parseMoney('6,850.50'), 6850.5);
    assert.equal(parseMoney('6850.5'), 6850.5);
    assert.equal(parseMoney('68.500'), 68500);
    assert.equal(parseMoney('1.250.000'), 1250000);
    assert.equal(parseMoney('12,5'), 12.5);
    assert.equal(parseMoney(1500), 1500);
  });

  it('rechaza vacíos, ceros, negativos y textos', () => {
    assert.equal(parseMoney(''), null);
    assert.equal(parseMoney('0'), null);
    assert.equal(parseMoney('-100'), null);
    assert.equal(parseMoney('Consultar'), null);
  });
});

describe('Price list — presentaciones', () => {
  it('detecta presentaciones simples y multipack', () => {
    assert.deepEqual(parsePresentation('Muzzarella Barraza x 10 kg'), { quantity: 10, unit: 'kg', label: '10 kg' });
    assert.equal(parsePresentation('Aceite de oliva 6x1L')?.quantity, 6);
    assert.equal(parsePresentation('Aceite de oliva 6x1L')?.unit, 'l');
    assert.equal(parsePresentation('Caja 12 x 500 grs')?.quantity, 6000);
    assert.equal(parsePresentation('Caja 12 x 500 grs')?.unit, 'g');
    assert.equal(parsePresentation('Huevos x 30 u')?.quantity, 30);
    assert.equal(parsePresentation('Harina 0000 25kg')?.quantity, 25);
    assert.equal(parsePresentation('Tomate perita 1/2 kg')?.quantity, 0.5);
    assert.equal(parsePresentation('Crema 500 cc')?.unit, 'ml');
  });

  it('no inventa presentaciones', () => {
    assert.equal(parsePresentation('Harina 0000'), null);
    assert.equal(parsePresentation(''), null);
  });

  it('acepta columnas de presentación con solo la unidad', () => {
    assert.deepEqual(parsePresentation('Kilo'), { quantity: 1, unit: 'kg', label: 'kilo' });
  });
});

describe('Price list — columnas y extracción', () => {
  const rows = [
    ['Distribuidora La Pampa', '', '', ''],
    ['Lista de precios Noviembre', '', '', ''],
    ['Código', 'Descripción', 'Precio s/IVA', 'Precio c/IVA'],
    ['M10', 'Muzzarella Barraza x 10 kg', '56.611,57', '68.500,00'],
    ['H25', 'Harina 0000 Blancaflor x 25 kg', '20.661,16', '25.000,00'],
    ['', 'LÁCTEOS', '', ''],
    ['A6', 'Aceite de oliva 6x1L', '74.380,17', '90.000,00'],
    ['X1', 'Producto sin precio', 'Consultar', ''],
  ];

  it('detecta encabezados y prefiere el precio con IVA', () => {
    const columns = detectPriceListColumns(rows);
    assert.ok(columns);
    assert.equal(columns.header_row_index, 2);
    assert.equal(columns.name, 1);
    assert.equal(columns.code, 0);
    assert.equal(columns.price, 3);
    assert.deepEqual(columns.price_candidates, [2, 3]);
  });

  it('extrae solo filas con nombre y precio válido', () => {
    const columns = detectPriceListColumns(rows);
    const items = extractPriceListItems(rows, columns);
    assert.equal(items.length, 3);
    assert.equal(items[0].price, 68500);
    assert.equal(items[0].presentation?.quantity, 10);
    assert.equal(items[0].alias_key, 'code:m10');
  });

  it('infiere columnas cuando no hay encabezados', () => {
    const headerless = [
      ['Muzzarella x 10 kg', '68500'],
      ['Harina 0000 x 25 kg', '25000'],
    ];
    const columns = detectPriceListColumns(headerless);
    assert.ok(columns);
    assert.equal(columns.header_row_index, -1);
    assert.equal(columns.name, 0);
    assert.equal(columns.price, 1);
    assert.equal(extractPriceListItems(headerless, columns).length, 2);
  });
});

describe('Price list — matching', () => {
  it('matchea por sinónimos y contención de nombre', () => {
    assert.ok(nameSimilarity('Muzzarella Barraza x 10 kg', 'Mozzarella') >= 0.85);
    assert.ok(nameSimilarity('Harina 0000 Blancaflor x 25 kg', 'Mozzarella') < 0.3);
  });

  it('calcula precio por unidad y variación', () => {
    const items = [
      { row_index: 1, raw_name: 'Muzzarella Barraza x 10 kg', code: null, presentation: { quantity: 10, unit: 'kg', label: '10 kg' }, price: 68500, alias_key: buildAliasKey('Muzzarella Barraza x 10 kg') },
    ];
    const [match] = matchPriceList(items, catalog);
    assert.equal(match.target_id, 'mozz');
    assert.equal(match.source, 'fuzzy');
    assert.equal(match.new_price_per_unit, 6850);
    assert.equal(match.old_price_per_unit, 6200);
    assert.equal(match.variation_pct, 10.48);
  });

  it('prioriza alias aprendidos y su presentación guardada', () => {
    const items = [
      { row_index: 1, raw_name: 'MZ BARR HORMA', code: 'M10', presentation: null, price: 68500, alias_key: 'code:m10' },
    ];
    const [match] = matchPriceList(items, catalog, [
      { alias_key: 'code:m10', target_id: 'mozz', pack_quantity: 10, pack_unit: 'kg' },
    ]);
    assert.equal(match.target_id, 'mozz');
    assert.equal(match.source, 'code');
    assert.equal(match.confidence, 1);
    assert.equal(match.new_price_per_unit, 6850);
  });

  it('convierte entre unidades de la misma dimensión', () => {
    const result = computePricePerUnit(90000, { quantity: 6000, unit: 'ml', label: '6x1L' }, 'l');
    assert.equal(result.value, 15000);
    assert.equal(result.warning, null);
  });

  it('no inventa precios con unidades incompatibles', () => {
    const result = computePricePerUnit(4500, { quantity: 30, unit: 'u', label: 'x30u' }, 'kg');
    assert.equal(result.value, null);
    assert.match(result.warning, /no es compatible/);
  });

  it('advierte cuando no hay presentación y asume el precio por unidad', () => {
    const result = computePricePerUnit(950, null, 'kg');
    assert.equal(result.value, 950);
    assert.match(result.warning, /se asume/);
  });

  it('no matchea ítems sin similitud suficiente', () => {
    const items = [
      { row_index: 1, raw_name: 'Servilletas papel', code: null, presentation: null, price: 3000, alias_key: buildAliasKey('Servilletas papel') },
    ];
    const [match] = matchPriceList(items, catalog);
    assert.equal(match.target_id, null);
    assert.equal(match.source, 'none');
  });

  it('advierte variaciones inusuales', () => {
    const items = [
      { row_index: 1, raw_name: 'Mozzarella', code: null, presentation: { quantity: 1, unit: 'kg', label: 'kg' }, price: 62000, alias_key: buildAliasKey('Mozzarella') },
    ];
    const [match] = matchPriceList(items, catalog);
    assert.equal(match.source, 'exact');
    assert.ok(match.warnings.some((w) => w.includes('Suba inusual')));
  });

  it('permite revincular manualmente y resume los resultados', () => {
    const items = [
      { row_index: 1, raw_name: 'Huevos blancos maple', code: null, presentation: { quantity: 30, unit: 'u', label: 'x30' }, price: 4800, alias_key: buildAliasKey('Huevos blancos maple') },
      { row_index: 2, raw_name: 'Servilletas', code: null, presentation: null, price: 3000, alias_key: buildAliasKey('Servilletas') },
    ];
    const matches = matchPriceList(items, catalog);
    assert.equal(matches[0].target_id, 'eggs');
    assert.equal(matches[0].new_price_per_unit, 160);
    const relinked = rematch(matches[1], catalog, { target_id: 'eggs', presentation: { quantity: 30, unit: 'u', label: 'x30' } });
    assert.equal(relinked.target_id, 'eggs');
    assert.equal(relinked.new_price_per_unit, 100);
    const summary = summarizeMatches([matches[0], relinked]);
    assert.equal(summary.matched, 2);
    assert.equal(summary.increases, 1);
    assert.equal(summary.decreases, 1);
  });
});
