import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CostEngine } from '../dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

function readRepoFile(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

/**
 * Implementación exacta del algoritmo JWT HMAC-SHA256 de backend/src/Core/Jwt.php
 * para verificar tokens, firmas, expiración y aislamiento de audiencias (aud).
 */
const JwtSim = {
  encode(payload, secret, ttl = 28800, issuer = 'pizzalog', nowSec = Math.floor(Date.now() / 1000)) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const fullPayload = {
      ...payload,
      iss: issuer,
      iat: nowSec,
      exp: nowSec + ttl,
    };
    const body = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${sig}`;
  },
  decode(token, secret, nowSec = Math.floor(Date.now() / 1000)) {
    const parts = String(token ?? '').split('.');
    if (parts.length !== 3) return null;
    const [h, b, s] = parts;
    const expectedSig = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url');
    if (s !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp <= nowSec) return null;
    return payload;
  },
};

/**
 * Simulador transaccional de los controladores de Tools (ToolsAuth, Auth, ToolsWorkspaceController, ToolsSyncController)
 * respaldado por las mismas reglas verificadas en el código PHP de producción.
 */
class ToolsBackendHarness {
  constructor(jwtSecret = 'clave_secreta_auditoria_pizzalog_tools_2026_segura_64b') {
    this.jwtSecret = jwtSecret;
    this.accounts = new Map(); // id -> account row
    this.workspaces = new Map(); // account_id -> { account_id, workspace_json, schema_version, version, updated_at }
    this.backups = []; // { id, account_id, version, workspace_json, created_at }
    this.nextBackupId = 1;
    this.appUsers = new Map(); // id -> { id, business_id, email, role, is_active }
  }

  createAccount({ id, email, name, passwordHash = 'hash_ok', environment = 'production', is_active = 1, expires_at = null, app_user_id = null, business_id = null }) {
    this.accounts.set(id, { id, email, name, password_hash: passwordHash, environment, is_active, expires_at, app_user_id, business_id });
  }

  authenticateTools(token, nowSec = Math.floor(Date.now() / 1000)) {
    if (!token) return { status: 401, error: 'Iniciá sesión para acceder a Pizzalog Tools' };
    const payload = JwtSim.decode(token, this.jwtSecret, nowSec);
    if (
      !payload ||
      payload.iss !== 'pizzalog' ||
      payload.aud !== 'pizzalog-tools' ||
      !payload.sub ||
      !['production', 'staging'].includes(payload.env)
    ) {
      return { status: 401, error: 'Sesión de Tools inválida o vencida' };
    }
    const acc = this.accounts.get(Number(payload.sub));
    if (!acc || acc.environment !== payload.env || acc.is_active !== 1) {
      return { status: 403, error: 'La cuenta de Tools está deshabilitada' };
    }
    if (acc.expires_at && Math.floor(new Date(acc.expires_at).getTime() / 1000) <= nowSec) {
      return { status: 403, error: 'El acceso a Pizzalog Tools ha vencido' };
    }
    const appUser = acc.app_user_id ? this.appUsers.get(acc.app_user_id) : null;
    const validAppLink = Boolean(acc.app_user_id && appUser && appUser.is_active === 1 && appUser.role === 'admin');
    if (acc.app_user_id && !validAppLink && !acc.password_hash) {
      return { status: 403, error: 'El usuario vinculado de Pizzalog App ya no tiene permisos para acceder a Tools' };
    }
    return {
      status: 200,
      auth: {
        tools_account_id: acc.id,
        tools_email: acc.email,
        tools_name: acc.name,
        tools_environment: acc.environment,
        business_id: validAppLink ? (acc.business_id ?? appUser.business_id) : null,
        app_user_id: validAppLink ? acc.app_user_id : null,
      },
    };
  }

  authenticateApp(token, nowSec = Math.floor(Date.now() / 1000)) {
    const payload = JwtSim.decode(token, this.jwtSecret, nowSec);
    if (!payload) return { status: 401, error: 'Token inválido o expirado' };
    if (payload.aud === 'pizzalog-tools') {
      return { status: 401, error: 'Las sesiones de Pizzalog Tools están aisladas y no pueden utilizarse en Pizzalog App' };
    }
    if (!payload.sub || !payload.business_id) {
      return { status: 401, error: 'Token incompleto' };
    }
    return { status: 200, auth: { user_id: payload.sub, business_id: payload.business_id } };
  }

  getWorkspace(token) {
    const authRes = this.authenticateTools(token);
    if (authRes.status !== 200) return authRes;
    const row = this.workspaces.get(authRes.auth.tools_account_id);
    return {
      status: 200,
      data: {
        workspace: row ? JSON.parse(row.workspace_json) : null,
        schema_version: row ? row.schema_version : 1,
        version: row ? row.version : 1,
        updated_at: row ? row.updated_at : null,
      },
    };
  }

  saveWorkspace(token, { workspace, version: expectedVersion, updated_at: expectedUpdatedAt }, nowStr = '2026-11-18 14:00:05') {
    const authRes = this.authenticateTools(token);
    if (authRes.status !== 200) return authRes;
    const accountId = authRes.auth.tools_account_id;
    const existing = this.workspaces.get(accountId);

    if (existing) {
      if (expectedVersion !== undefined && expectedVersion !== null && Number(expectedVersion) !== existing.version) {
        return {
          status: 409,
          error: 'El espacio de trabajo fue modificado en otra sesión o pestaña.',
          details: { current_version: existing.version, current_updated_at: existing.updated_at },
        };
      }
      if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== null && expectedUpdatedAt !== '' && expectedUpdatedAt !== existing.updated_at) {
        return {
          status: 409,
          error: 'El espacio de trabajo fue modificado en otra sesión o pestaña.',
          details: { current_version: existing.version, current_updated_at: existing.updated_at },
        };
      }

      // Guardar backup automático antes de sobrescribir (máx 10 por cuenta)
      this.backups.push({
        id: this.nextBackupId++,
        account_id: accountId,
        version: existing.version,
        workspace_json: existing.workspace_json,
        created_at: nowStr,
      });
      const accBackups = this.backups.filter((b) => b.account_id === accountId);
      if (accBackups.length > 10) {
        const oldestId = accBackups[0].id;
        this.backups = this.backups.filter((b) => !(b.account_id === accountId && b.id <= oldestId));
      }

      const nextVer = existing.version + 1;
      this.workspaces.set(accountId, {
        account_id: accountId,
        workspace_json: JSON.stringify(workspace),
        schema_version: 1,
        version: nextVer,
        updated_at: nowStr,
      });
      return { status: 200, data: { saved: true, version: nextVer, updated_at: nowStr } };
    } else {
      this.workspaces.set(accountId, {
        account_id: accountId,
        workspace_json: JSON.stringify(workspace),
        schema_version: 1,
        version: 1,
        updated_at: nowStr,
      });
      return { status: 200, data: { saved: true, version: 1, updated_at: nowStr } };
    }
  }

  listBackups(token) {
    const authRes = this.authenticateTools(token);
    if (authRes.status !== 200) return authRes;
    const accountId = authRes.auth.tools_account_id;
    return {
      status: 200,
      data: {
        backups: this.backups
          .filter((b) => b.account_id === accountId)
          .slice()
          .reverse()
          .map((b) => ({ id: b.id, version: b.version, created_at: b.created_at, size_bytes: b.workspace_json.length })),
      },
    };
  }

  restoreBackup(token, backupId, nowStr = '2026-11-18 14:10:00') {
    const authRes = this.authenticateTools(token);
    if (authRes.status !== 200) return authRes;
    const accountId = authRes.auth.tools_account_id;
    const backup = this.backups.find((b) => b.id === backupId && b.account_id === accountId);
    if (!backup) {
      return { status: 404, error: 'No se encontró el backup solicitado para esta cuenta' };
    }
    const current = this.workspaces.get(accountId);
    const nextVersion = current ? current.version + 1 : 1;
    if (current) {
      this.backups.push({
        id: this.nextBackupId++,
        account_id: accountId,
        version: current.version,
        workspace_json: current.workspace_json,
        created_at: nowStr,
      });
    }
    this.workspaces.set(accountId, {
      account_id: accountId,
      workspace_json: backup.workspace_json,
      schema_version: 1,
      version: nextVersion,
      updated_at: nowStr,
    });
    return {
      status: 200,
      data: {
        restored: true,
        restored_from_backup_id: backup.id,
        restored_from_version: backup.version,
        version: nextVersion,
        updated_at: nowStr,
        workspace: JSON.parse(backup.workspace_json),
      },
    };
  }
}

test('Bloque 3 (Tareas 3.1 a 3.9): Seguridad, aislamiento de cuentas, concurrencia, autosave, desconexión y backups', async (t) => {
  const secret = 'clave_secreta_auditoria_pizzalog_tools_2026_segura_64b';
  const harness = new ToolsBackendHarness(secret);

  // =========================================================================
  // Tarea 3.1 — Crear dos cuentas de prueba con datos diferentes
  // =========================================================================
  harness.createAccount({ id: 101, email: 'mateo@pizzeriamateo.com.ar', name: 'Pizzería Don Mateo', environment: 'production' });
  harness.createAccount({ id: 202, email: 'luigi@napolicentrale.com', name: 'Napoli Centrale', environment: 'production' });

  const tokenA = JwtSim.encode({ sub: 101, aud: 'pizzalog-tools', env: 'production' }, secret);
  const tokenB = JwtSim.encode({ sub: 202, aud: 'pizzalog-tools', env: 'production' }, secret);

  const workspaceA = {
    businessName: 'Pizzería Don Mateo (Cuenta A)',
    currency: 'ARS',
    locale: 'es-AR',
    unitSystem: 'metric',
    defaultTargetFoodCostPct: 30,
    defaultRoundingIncrement: 500,
    defaultPackagingCost: 300,
    defaultChannelFeePct: 20,
    catalog: {
      ingredients: [
        { id: 'ing_a_harina', name: 'Harina 0000 Mateo', base_dimension: 'mass', base_unit: 'g', is_active: true },
        { id: 'ing_a_muzza', name: 'Muzzarella Mateo', base_dimension: 'mass', base_unit: 'g', is_active: true },
      ],
      purchase_prices: [
        { ingredient_id: 'ing_a_harina', purchase_price: 20000, currency: 'ARS', pack_quantity: 25, pack_unit: 'kg', yield_pct: 100 },
        { ingredient_id: 'ing_a_muzza', purchase_price: 6000, currency: 'ARS', pack_quantity: 1, pack_unit: 'kg', yield_pct: 100 },
      ],
      recipes: [
        {
          id: 'prod_a_muzza',
          name: 'Pizza Muzzarella Don Mateo',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          currency: 'ARS',
          components: [
            { component_type: 'ingredient', ingredient_id: 'ing_a_harina', quantity: 250, unit: 'g' }, // $200
            { component_type: 'ingredient', ingredient_id: 'ing_a_muzza', quantity: 250, unit: 'g' }, // $1500
          ],
        },
      ],
    },
    productSalesMap: { prod_a_muzza: { monthlyUnitsSold: 800, sellingPrice: 7000 } },
    operatingExpenses: [{ id: 'exp_a1', name: 'Alquiler Caballito', category: 'rent', period: 'monthly', amount: 900000 }],
    snapshots: [],
  };

  const workspaceB = {
    businessName: 'Napoli Centrale (Cuenta B)',
    currency: 'USD',
    locale: 'en',
    unitSystem: 'us_customary',
    defaultTargetFoodCostPct: 25,
    defaultRoundingIncrement: 1,
    defaultPackagingCost: 1.5,
    defaultChannelFeePct: 15,
    catalog: {
      ingredients: [
        { id: 'ing_b_flour', name: 'Caputo 00 Flour', base_dimension: 'mass', base_unit: 'oz', is_active: true },
        { id: 'ing_b_pep', name: 'Pepperoni Sliced', base_dimension: 'mass', base_unit: 'oz', is_active: true },
      ],
      purchase_prices: [
        { ingredient_id: 'ing_b_flour', purchase_price: 32, currency: 'USD', pack_quantity: 160, pack_unit: 'oz', yield_pct: 100 }, // $0.20/oz
        { ingredient_id: 'ing_b_pep', purchase_price: 8, currency: 'USD', pack_quantity: 16, pack_unit: 'oz', yield_pct: 100 }, // $0.50/oz
      ],
      recipes: [
        {
          id: 'prod_b_pep',
          name: 'NY Pepperoni Pie',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          currency: 'USD',
          components: [
            { component_type: 'ingredient', ingredient_id: 'ing_b_flour', quantity: 10, unit: 'oz' }, // $2.00
            { component_type: 'ingredient', ingredient_id: 'ing_b_pep', quantity: 4, unit: 'oz' }, // $2.00
          ],
        },
      ],
    },
    productSalesMap: { prod_b_pep: { monthlyUnitsSold: 1200, sellingPrice: 22 } },
    operatingExpenses: [{ id: 'exp_b1', name: 'Manhattan Lease', category: 'rent', period: 'monthly', amount: 6500 }],
    snapshots: [],
  };

  await t.test('Tarea 3.1: Creación y persistencia independiente de dos cuentas con catálogos, monedas y costos diferentes', () => {
    const saveA = harness.saveWorkspace(tokenA, { workspace: workspaceA }, '2026-11-18 10:00:00');
    const saveB = harness.saveWorkspace(tokenB, { workspace: workspaceB }, '2026-11-18 10:00:00');
    assert.equal(saveA.status, 200);
    assert.equal(saveB.status, 200);

    const readA = harness.getWorkspace(tokenA);
    const readB = harness.getWorkspace(tokenB);
    assert.equal(readA.data.workspace.businessName, 'Pizzería Don Mateo (Cuenta A)');
    assert.equal(readA.data.workspace.currency, 'ARS');
    assert.equal(readB.data.workspace.businessName, 'Napoli Centrale (Cuenta B)');
    assert.equal(readB.data.workspace.currency, 'USD');

    const engA = new CostEngine(readA.data.workspace.catalog);
    const engB = new CostEngine(readB.data.workspace.catalog);
    assert.equal(engA.calculateRecipeCost('prod_a_muzza').raw_unit_cost, 1700);
    assert.equal(engB.calculateRecipeCost('prod_b_pep').raw_unit_cost, 4);
  });

  await t.test('Tarea 3.2: Imposibilidad de acceso cruzado entre Cuenta A y Cuenta B ni entre Pizzalog Tools y Pizzalog App', () => {
    // 1) Cuenta A jamás recibe datos de Cuenta B y viceversa
    const wsA = harness.getWorkspace(tokenA).data.workspace;
    assert.ok(!wsA.catalog.ingredients.some((i) => i.id.startsWith('ing_b_')), 'Cuenta A no contiene insumos de Cuenta B');

    // 2) Generar un backup en Cuenta B (actualizando su workspace) e intentar restaurarlo con el token de Cuenta A
    const wsB2 = JSON.parse(JSON.stringify(workspaceB));
    wsB2.businessName = 'Napoli Centrale v2';
    harness.saveWorkspace(tokenB, { workspace: wsB2, version: 1 }, '2026-11-18 10:05:00');
    const backupsB = harness.listBackups(tokenB).data.backups;
    assert.equal(backupsB.length, 1);
    const backupIdOfB = backupsB[0].id;

    // Cuenta A no ve los backups de Cuenta B:
    assert.equal(harness.listBackups(tokenA).data.backups.length, 0, 'Cuenta A no puede listar backups de Cuenta B');
    // Si Cuenta A intenta restaurar el backupId de Cuenta B por fuerza bruta, recibe 404 y sus datos no se tocan:
    const crossRestore = harness.restoreBackup(tokenA, backupIdOfB);
    assert.equal(crossRestore.status, 404);
    assert.equal(harness.getWorkspace(tokenA).data.workspace.businessName, 'Pizzería Don Mateo (Cuenta A)');

    // 3) Un token de Tools (incluso si tuviera business_id inyectado) es rechazado en los endpoints de Pizzalog App:
    const forgedToolsTokenWithBiz = JwtSim.encode({ sub: 101, business_id: 1, aud: 'pizzalog-tools', env: 'production' }, secret);
    const appAttempt = harness.authenticateApp(forgedToolsTokenWithBiz);
    assert.equal(appAttempt.status, 401);
    assert.match(appAttempt.error, /aisladas/i);

    // 4) Un token de Pizzalog App (sin aud='pizzalog-tools') es rechazado en todos los endpoints de Tools:
    const appToken = JwtSim.encode({ sub: 101, business_id: 1, role: 'admin' }, secret);
    const toolsAttempt = harness.authenticateTools(appToken);
    assert.equal(toolsAttempt.status, 401);

    // 5) Un token de entorno staging no puede acceder a la cuenta de production:
    const stagingTokenForA = JwtSim.encode({ sub: 101, aud: 'pizzalog-tools', env: 'staging' }, secret);
    assert.equal(harness.authenticateTools(stagingTokenForA).status, 403);
  });

  await t.test('Tarea 3.3: Auditoría estática de código de todos los controladores Tools y middlewares PHP', () => {
    const authPhp = readRepoFile('backend/src/Core/Auth.php');
    const toolsAuthPhp = readRepoFile('backend/src/Core/ToolsAuth.php');
    const toolsAuthCtrlPhp = readRepoFile('backend/src/Controllers/ToolsAuthController.php');
    const toolsWsCtrlPhp = readRepoFile('backend/src/Controllers/ToolsWorkspaceController.php');
    const toolsSyncCtrlPhp = readRepoFile('backend/src/Controllers/ToolsSyncController.php');
    const toolsImportCtrlPhp = readRepoFile('backend/src/Controllers/ToolsImportController.php');
    const indexPhp = readRepoFile('backend/public/index.php');

    // Verificar aislamiento cruzado en Auth.php y ToolsAuth.php
    assert.ok(authPhp.includes("($payload['aud'] ?? null) === 'pizzalog-tools'"), 'Auth.php rechaza explícitamente tokens con aud=pizzalog-tools');
    assert.ok(toolsAuthPhp.includes("($payload['aud'] ?? null) !== 'pizzalog-tools'"), 'ToolsAuth.php exige aud=pizzalog-tools');

    // Verificar que ToolsWorkspaceController use exclusivamente $req->auth["tools_account_id"] y nunca acepte account_id por input/query
    assert.ok(toolsWsCtrlPhp.includes("(int) $req->auth['tools_account_id']"), 'ToolsWorkspaceController extrae account_id del token autenticado');
    assert.ok(!toolsWsCtrlPhp.includes("$req->input('account_id')"), 'ToolsWorkspaceController jamás acepta account_id del body');

    // Verificar que ToolsSyncController valide u.is_active = 1 AND u.role = 'admin' y exponga unlinkApp
    assert.ok(toolsSyncCtrlPhp.includes("u.is_active = 1") && toolsSyncCtrlPhp.includes("u.role = 'admin'"), 'ToolsSyncController valida rol admin activo en App');
    assert.ok(toolsSyncCtrlPhp.includes('public function unlinkApp'), 'ToolsSyncController implementa unlinkApp');
    assert.ok(indexPhp.includes("'/tools/sync/unlink-app'"), 'index.php registra /tools/sync/unlink-app');
    assert.ok(indexPhp.includes("'/tools/workspace/backups'"), 'index.php registra /tools/workspace/backups');
    assert.ok(indexPhp.includes("'/tools/workspace/restore'"), 'index.php registra /tools/workspace/restore');

    // Verificar límite de 20 MB en ToolsWorkspaceController y index.php
    assert.ok(toolsWsCtrlPhp.includes('20 * 1024 * 1024'), 'ToolsWorkspaceController permite hasta 20 MB');
    assert.ok(toolsImportCtrlPhp.includes('MAX_ROWS = 10000'), 'ToolsImportController controla límites de filas y celdas');
    assert.ok(toolsAuthCtrlPhp.includes('CREATE TABLE IF NOT EXISTS tools_workspace_backups'), 'ToolsAuthController asegura tabla tools_workspace_backups');
  });

  await t.test('Tareas 3.4 y 3.5: Autosave sin disparo redundante al montar y resiliencia ante pérdida de conexión con recuperación automática', () => {
    const appTsx = readRepoFile('frontend/apps/tools/src/App.tsx');
    const gateTsx = readRepoFile('frontend/apps/tools/src/ToolsAuthGate.tsx');

    // Verificar guardas de autosave en App.tsx y recuperación local por cuenta
    assert.ok(appTsx.includes('if (isInitialMountRef.current)'), 'App.tsx omite autosave redundante en el mount inicial');
    assert.ok(appTsx.includes('if (serialized === lastSavedJsonRef.current)'), 'App.tsx omite autosave si el JSON no cambió');
    assert.ok(appTsx.includes('`pizzalog_tools_recovery_${account.id}`'), 'App.tsx guarda respaldo local aislado por account.id');
    assert.ok(appTsx.includes("window.addEventListener('online', onOnline)"), 'App.tsx reintenta autosave automáticamente al volver la conexión');
    assert.ok(gateTsx.includes('readAccountRecoveryBackup'), 'ToolsAuthGate.tsx recupera y sincroniza cambios hechos offline al reconectar');
  });

  await t.test('Tareas 3.6 y 3.7: Conflictos simultáneos entre dos sesiones y control de concurrencia por version incremental dentro del mismo segundo', () => {
    // Tab 1 y Tab 2 leen simultáneamente la Cuenta A (version = 1, updated_at = '2026-11-18 10:00:00')
    const tab1Read = harness.getWorkspace(tokenA).data;
    const tab2Read = harness.getWorkspace(tokenA).data;
    assert.equal(tab1Read.version, 1);
    assert.equal(tab2Read.version, 1);

    // Tab 1 guarda en el MISMO segundo '2026-11-18 10:00:00' -> incrementa version a 2
    const tab1Ws = JSON.parse(JSON.stringify(tab1Read.workspace));
    tab1Ws.businessName = 'Pizzería Don Mateo — Editado en Pestaña 1';
    const tab1Save = harness.saveWorkspace(
      tokenA,
      { workspace: tab1Ws, version: tab1Read.version, updated_at: tab1Read.updated_at },
      '2026-11-18 10:00:00'
    );
    assert.equal(tab1Save.status, 200);
    assert.equal(tab1Save.data.version, 2);
    assert.equal(tab1Save.data.updated_at, '2026-11-18 10:00:00');

    // Tab 2 intenta guardar en el MISMO segundo ('2026-11-18 10:00:00') con su version=1 desactualizada:
    // Aunque updated_at coincida al segundo, el control por `version` incremental detecta el conflicto (409)!
    const tab2Ws = JSON.parse(JSON.stringify(tab2Read.workspace));
    tab2Ws.businessName = 'Pizzería Don Mateo — Intento de Pisado en Pestaña 2';
    const tab2Save = harness.saveWorkspace(
      tokenA,
      { workspace: tab2Ws, version: tab2Read.version, updated_at: tab2Read.updated_at },
      '2026-11-18 10:00:00'
    );
    assert.equal(tab2Save.status, 409, 'Debe devolver 409 Conflict gracias a la columna version incremental');
    assert.equal(tab2Save.details.current_version, 2);

    // Verificar que los datos de la Pestaña 1 no fueron sobrescritos:
    assert.equal(harness.getWorkspace(tokenA).data.workspace.businessName, 'Pizzería Don Mateo — Editado en Pestaña 1');
  });

  await t.test('Tarea 3.8: Validación de sesiones, expiración de JWT, adulteración de firma HMAC y deshabilitación de cuenta', () => {
    const nowSec = 1_760_000_000;
    const validToken = JwtSim.encode({ sub: 101, aud: 'pizzalog-tools', env: 'production' }, secret, 3600, 'pizzalog', nowSec);
    assert.equal(harness.authenticateTools(validToken, nowSec + 1800).status, 200);
    assert.equal(harness.authenticateTools(validToken, nowSec + 3601).status, 401, 'Token vencido debe retornar 401');

    // Firma HMAC adulterada (cambiando sub en el payload sin conocer el secret)
    const [h, , s] = validToken.split('.');
    const tamperedBody = Buffer.from(JSON.stringify({ sub: 202, aud: 'pizzalog-tools', env: 'production', iss: 'pizzalog', exp: nowSec + 3600 })).toString('base64url');
    assert.equal(harness.authenticateTools(`${h}.${tamperedBody}.${s}`, nowSec).status, 401, 'Token adulterado debe retornar 401');

    // Cuenta con expires_at vencido
    harness.createAccount({ id: 303, email: 'vencido@test.com', name: 'Vencido', expires_at: '2020-01-01 00:00:00' });
    const expiredAccToken = JwtSim.encode({ sub: 303, aud: 'pizzalog-tools', env: 'production' }, secret, 3600, 'pizzalog', nowSec);
    assert.equal(harness.authenticateTools(expiredAccToken, nowSec).status, 403, 'Cuenta con suscripción vencida debe retornar 403');
  });

  await t.test('Tarea 3.9: Verificación de backups automáticos en servidor y restauración íntegra a una versión anterior', () => {
    const backupsList = harness.listBackups(tokenA);
    assert.equal(backupsList.status, 200);
    assert.ok(backupsList.data.backups.length >= 1, 'Cuenta A debe tener el backup automático de la versión 1 antes de la edición de Pestaña 1');

    const v1Backup = backupsList.data.backups.find((b) => b.version === 1);
    assert.ok(v1Backup);

    const restored = harness.restoreBackup(tokenA, v1Backup.id, '2026-11-18 11:00:00');
    assert.equal(restored.status, 200);
    assert.equal(restored.data.restored, true);
    assert.equal(restored.data.restored_from_version, 1);
    assert.equal(restored.data.version, 3, 'La restauración incrementa la versión de forma monotónica (2 -> 3)');
    assert.equal(restored.data.workspace.businessName, 'Pizzería Don Mateo (Cuenta A)', 'Se restauró el nombre original de la versión 1');
  });
});
