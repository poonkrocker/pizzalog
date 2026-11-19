#!/usr/bin/env node
/**
 * Fase 3.5 — Verificación de límites reales del servidor (/tools/import/limits) y prueba de carga
 *
 * Uso (solo staging o servidor local — nunca pruebas destructivas en producción):
 *   STAGING_API_BASE_URL=https://staging.pizzalog.net/api \
 *   node docs/audit/release-candidate/scripts/check_staging_limits.mjs
 *
 * Opcional (para probar subida cercana y superior al límite 20 MB en staging):
 *   TOOLS_STAGING_TOKEN=<jwt_tools_staging> RUN_UPLOAD_LIMIT_TEST=1 \
 *   STAGING_API_BASE_URL=https://staging.pizzalog.net/api \
 *   node docs/audit/release-candidate/scripts/check_staging_limits.mjs
 */

import assert from 'node:assert/strict';

const BASE_URL = (process.env.STAGING_API_BASE_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.TOOLS_STAGING_TOKEN || '';
const RUN_UPLOAD = process.env.RUN_UPLOAD_LIMIT_TEST === '1';

if (!BASE_URL) {
  console.error('[BLOCKED] Definí STAGING_API_BASE_URL (ej: https://staging.pizzalog.net/api) para consultar /tools/import/limits.');
  process.exit(2);
}

if (RUN_UPLOAD && /^https?:\/\/(www\.|tools\.|api\.)?pizzalog\.net/i.test(BASE_URL)) {
  console.error('[ABORTED] Las pruebas de carga de subida no pueden ejecutarse contra producción.');
  process.exit(1);
}

async function main() {
  const url = `${BASE_URL}/tools/import/limits`;
  console.log(`[INFO] Consultando ${url}`);
  const res = await fetch(url, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  });
  const body = await res.json().catch(() => ({}));
  assert.equal(res.status, 200, `GET /tools/import/limits devolvió HTTP ${res.status}`);

  const data = body.data || body;
  const fields = [
    'upload_max_filesize',
    'post_max_size',
    'memory_limit',
    'max_execution_time',
    'max_input_time',
    'supports_20mb_upload',
    'environment',
  ];

  console.log('\n--- Límites reportados por el servidor ---');
  for (const field of fields) {
    console.log(`${field}: ${JSON.stringify(data[field])}`);
  }

  assert.equal(data.supports_20mb_upload, true, 'El servidor debe soportar subidas de al menos 20 MB');
  console.log('[PASS] /tools/import/limits confirmó soporte >= 20 MB');

  if (RUN_UPLOAD) {
    assert.ok(TOKEN, 'RUN_UPLOAD_LIMIT_TEST=1 requiere TOOLS_STAGING_TOKEN');
    // 1) Payload cercano al límite (~18 MB) -> no debe fallar por 413
    const near18Mb = 'a'.repeat(18 * 1024 * 1024);
    const nearRes = await fetch(`${BASE_URL}/tools/import/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ fileName: 'near-limit.csv', sheets: [{ name: 'S1', rows: [['Producto', 'Precio'], [near18Mb.slice(0, 100), '100']] }], _padding: near18Mb }),
    });
    assert.notEqual(nearRes.status, 413, `Payload de ~18 MB no debería devolver 413 (recibido ${nearRes.status})`);
    console.log(`[PASS] Subida cercana al límite (~18 MB): HTTP ${nearRes.status}`);

    // 2) Payload superior al límite (~21 MB) -> debe devolver 413
    const over21Mb = 'b'.repeat(21 * 1024 * 1024);
    const overRes = await fetch(`${BASE_URL}/tools/import/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ fileName: 'over-limit.csv', _padding: over21Mb }),
    });
    assert.equal(overRes.status, 413, `Payload de ~21 MB debe ser rechazado con HTTP 413 (recibido ${overRes.status})`);
    console.log('[PASS] Subida superior a 20 MB (~21 MB): rechazada con HTTP 413');
  }
}

main().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
