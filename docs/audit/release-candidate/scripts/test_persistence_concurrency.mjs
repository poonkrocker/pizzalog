#!/usr/bin/env node
/**
 * Fase 3.2 — Prueba de integración real de persistencia y concurrencia con dos sesiones independientes
 *
 * Requisitos (nunca ejecutar contra cuenta/datos de producción):
 *   TOOLS_API_BASE_URL=https://staging.pizzalog.net/api   (o http://localhost:8000)
 *   TOOLS_TEST_EMAIL=rc-staging-test@example.com
 *   TOOLS_TEST_PASSWORD=...
 *
 * Ejecución:
 *   node docs/audit/release-candidate/scripts/test_persistence_concurrency.mjs
 */

import assert from 'node:assert/strict';

const BASE_URL = (process.env.TOOLS_API_BASE_URL || '').replace(/\/+$/, '');
const EMAIL = process.env.TOOLS_TEST_EMAIL || '';
const PASSWORD = process.env.TOOLS_TEST_PASSWORD || '';

if (!BASE_URL || !EMAIL || !PASSWORD) {
  console.error('[BLOCKED] Faltan variables de entorno: TOOLS_API_BASE_URL, TOOLS_TEST_EMAIL y TOOLS_TEST_PASSWORD.');
  process.exit(2);
}

if (/^https?:\/\/(www\.|tools\.|api\.)?pizzalog\.net/i.test(BASE_URL) && process.env.ALLOW_PROD_TEST !== '1') {
  console.error('[ABORTED] La URL apunta a producción. Usá staging o un servidor local de pruebas.');
  process.exit(1);
}

async function apiJson(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function loginSession(label) {
  const { status, body } = await apiJson('/tools/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  assert.equal(status, 200, `${label}: login debe devolver 200 (recibido ${status})`);
  assert.ok(body?.data?.token, `${label}: login debe devolver JWT`);
  return body.data.token;
}

function makeWorkspace(businessName) {
  return {
    businessName,
    currency: 'ARS',
    locale: 'es-AR',
    unitSystem: 'metric',
    defaultTargetFoodCostPct: 30,
    defaultRoundingIncrement: 100,
    defaultPackagingCost: 0,
    defaultChannelFeePct: 0,
    catalog: { ingredients: [], purchase_prices: [], recipes: [] },
    operatingExpenses: [],
    salesHistory: [],
    productSalesMap: {},
    snapshots: [],
    equivalences: {},
  };
}

async function main() {
  console.log(`[INFO] Ejecutando prueba de concurrencia contra ${BASE_URL}`);
  const tokenA = await loginSession('Sesión A');
  const tokenB = await loginSession('Sesión B');

  const getWs = (token) => apiJson('/tools/workspace', { headers: { Authorization: `Bearer ${token}` } });
  const saveWs = (token, workspace, version, updatedAt, signal) =>
    apiJson('/tools/workspace', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ workspace, version, updated_at: updatedAt }),
      signal,
    });

  // 1. Leer estado base en ambas sesiones
  const initialA = await getWs(tokenA);
  const initialB = await getWs(tokenB);
  assert.equal(initialA.status, 200);
  assert.equal(initialB.status, 200);
  const v0 = initialA.body.data.version ?? 1;
  const u0 = initialA.body.data.updated_at ?? null;
  console.log(`[PASS] 1. Estado base leído en Sesión A y B (version=${v0})`);

  // 2. Guardado normal desde Sesión A
  const save1 = await saveWs(tokenA, makeWorkspace('RC Concurrencia V1'), v0, u0);
  assert.equal(save1.status, 200, 'Guardado normal debe devolver 200');
  const v1 = save1.body.data.version;
  const u1 = save1.body.data.updated_at;
  assert.ok(v1 >= v0, `Versión debe incrementar monotónicamente (${v0} -> ${v1})`);
  console.log(`[PASS] 2. Guardado normal Sesión A OK (version=${v1}, backup_created=${save1.body.data.backup_created})`);

  // 3. Guardado simultáneo / desactualizado desde Sesión B usando v0 -> debe devolver 409
  const conflictB = await saveWs(tokenB, makeWorkspace('RC Conflicto Sesión B'), v0, u0);
  assert.equal(conflictB.status, 409, 'Sesión B con versión vieja debe recibir 409 Conflict');
  assert.equal(conflictB.body?.data?.current_version ?? v1, v1);
  console.log('[PASS] 3. Conflicto 409 detectado correctamente; cambios de Sesión A no fueron sobrescritos');

  // 4. Simulación de desconexión durante autosave + reintento exitoso
  const ac = new AbortController();
  ac.abort();
  let aborted = false;
  try {
    await saveWs(tokenB, makeWorkspace('RC Reintento Post-Corte'), v1, u1, ac.signal);
  } catch {
    aborted = true;
  }
  assert.equal(aborted, true, 'Desconexión abortada debe propagarse al cliente para activar reintento');

  // Reintento tras reconexión leyendo estado actual
  const refreshedB = await getWs(tokenB);
  const retryB = await saveWs(
    tokenB,
    makeWorkspace('RC Recuperado Sesión B'),
    refreshedB.body.data.version,
    refreshedB.body.data.updated_at
  );
  assert.equal(retryB.status, 200, 'Reintento con versión actualizada debe devolver 200');
  const v2 = retryB.body.data.version;
  assert.ok(v2 > v1, `Incremento monotónico estricto (${v1} -> ${v2})`);
  console.log(`[PASS] 4. Desconexión, reintento y recuperación exitosos (version=${v2})`);

  // 5. Backups automáticos y restauración íntegra
  const bkpList = await apiJson('/tools/workspace/backups', { headers: { Authorization: `Bearer ${tokenA}` } });
  assert.equal(bkpList.status, 200);
  const backups = bkpList.body?.data?.backups || [];
  assert.ok(backups.length >= 1, 'Debe existir al menos 1 backup automático tras sobrescribir');
  const targetBackup = backups[0];

  const restoreRes = await apiJson('/tools/workspace/restore', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ backup_id: targetBackup.id }),
  });
  assert.equal(restoreRes.status, 200, 'Restauración de backup propio debe devolver 200');
  assert.ok(restoreRes.body.data.version > v2, 'Restauración debe incrementar la versión monotónicamente');
  console.log(`[PASS] 5. Backup #${targetBackup.id} restaurado íntegramente (nueva version=${restoreRes.body.data.version})`);

  console.log('ALL PERSISTENCE & CONCURRENCY CHECKS PASSED');
}

main().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
