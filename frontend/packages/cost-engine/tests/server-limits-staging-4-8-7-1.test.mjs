import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

function readRepoFile(relPath) {
  return fs.readFileSync(path.resolve(REPO_ROOT, relPath), 'utf8');
}

test('Bloque 4.8 y 7.1: Límites reales del servidor (20 MB) y paridad staging vs producción', async (t) => {
  await t.test('Tarea 4.8: .user.ini en backend/public, frontend/apps/tools/public y tools permiten >= 25M y 120s para archivos hasta 20 MB', () => {
    const iniPaths = [
      'backend/public/.user.ini',
      'frontend/apps/tools/public/.user.ini',
      'tools/.user.ini',
    ];
    for (const rel of iniPaths) {
      const ini = readRepoFile(rel);
      assert.match(ini, /upload_max_filesize\s*=\s*25M/, `${rel} debe fijar upload_max_filesize = 25M`);
      assert.match(ini, /post_max_size\s*=\s*25M/, `${rel} debe fijar post_max_size = 25M`);
      assert.match(ini, /max_execution_time\s*=\s*120/, `${rel} debe fijar max_execution_time = 120`);
      assert.match(ini, /max_input_time\s*=\s*120/, `${rel} debe fijar max_input_time = 120`);
      assert.match(ini, /memory_limit\s*=\s*256M/, `${rel} debe fijar memory_limit = 256M`);
      assert.match(ini, /max_input_vars\s*=\s*5000/, `${rel} debe fijar max_input_vars = 5000`);
    }
    assert.equal(
      readRepoFile('frontend/apps/tools/public/.user.ini'),
      readRepoFile('tools/.user.ini'),
      'tools/.user.ini debe estar sincronizado con frontend/apps/tools/public/.user.ini'
    );
  });

  await t.test('Tarea 4.8: .htaccess en backend/public y tools configuran LimitRequestBody 26214400 (25 MB) y directivas mod_php8/lsapi', () => {
    for (const rel of ['backend/public/.htaccess', 'tools/.htaccess']) {
      const ht = readRepoFile(rel);
      assert.match(ht, /LimitRequestBody\s+26214400/, `${rel} debe configurar LimitRequestBody 26214400`);
      assert.match(ht, /upload_max_filesize\s+25M/, `${rel} debe declarar upload_max_filesize 25M`);
      assert.match(ht, /post_max_size\s+25M/, `${rel} debe declarar post_max_size 25M`);
      assert.match(ht, /max_execution_time\s+120/, `${rel} debe declarar max_execution_time 120`);
      assert.match(ht, /memory_limit\s+256M/, `${rel} debe declarar memory_limit 256M`);
    }
  });

  await t.test('Tarea 4.8: Request.php detecta post_max_size excedido y controladores PHP devuelven 413 controlado + límites 120s/256M', () => {
    const requestPhp = readRepoFile('backend/src/Core/Request.php');
    assert.match(requestPhp, /function\s+parseIniSizeToBytes\s*\(/, 'Request.php debe implementar parseIniSizeToBytes');
    assert.match(requestPhp, /\$postMaxExceeded\s*=\s*false/, 'Request.php debe exponer property $postMaxExceeded');
    assert.match(requestPhp, /ini_get\('post_max_size'\)/, 'Request.php debe leer post_max_size real del runtime');

    const importCtrl = readRepoFile('backend/src/Controllers/ToolsImportController.php');
    assert.match(importCtrl, /MAX_FILE_BYTES\s*=\s*20\s*\*\s*1024\s*\*\s*1024/, 'ToolsImportController debe fijar MAX_FILE_BYTES en 20 MB exactos');
    assert.match(importCtrl, /function\s+limits\s*\(/, 'ToolsImportController debe exponer limits() para diagnóstico autenticado');
    assert.match(importCtrl, /\$req->postMaxExceeded/, 'ToolsImportController debe responder 413 si $req->postMaxExceeded');
    assert.match(importCtrl, /set_time_limit\(120\)/, 'ToolsImportController::preview debe elevar max execution time a 120s');
    assert.match(importCtrl, /ini_set\('memory_limit',\s*'256M'\)/, 'ToolsImportController::preview debe reservar memory_limit 256M');

    const wsCtrl = readRepoFile('backend/src/Controllers/ToolsWorkspaceController.php');
    assert.match(wsCtrl, /\$req->postMaxExceeded/, 'ToolsWorkspaceController::save debe responder 413 ante post_max_size excedido');
    assert.match(wsCtrl, /set_time_limit\(120\)/, 'ToolsWorkspaceController::save debe fijar timeout de 120s para workspaces grandes');
    assert.match(wsCtrl, /ini_set\('memory_limit',\s*'256M'\)/, 'ToolsWorkspaceController::save debe fijar memory_limit 256M');

    const indexPhp = readRepoFile('backend/public/index.php');
    assert.match(indexPhp, /\/tools\/import\/limits/, 'backend/public/index.php debe registrar GET /tools/import/limits');
  });

  await t.test('Tarea 4.8 y 7.1: api-proxy.php sincronizado maneja timeouts 120s, precheck 413 y enrutamiento staging/producción', () => {
    const pubProxy = readRepoFile('frontend/apps/tools/public/api-proxy.php');
    const deployedProxy = readRepoFile('tools/api-proxy.php');
    assert.equal(pubProxy, deployedProxy, 'tools/api-proxy.php debe coincidir exactamente con frontend/apps/tools/public/api-proxy.php');
    assert.match(pubProxy, /@set_time_limit\(120\)/, 'api-proxy.php debe fijar set_time_limit(120)');
    assert.match(pubProxy, /memory_limit',\s*'256M'/, 'api-proxy.php debe fijar memory_limit 256M');
    assert.match(pubProxy, /http_response_code\(413\)/, 'api-proxy.php debe responder 413 JSON antes de reenviar si excede post_max_size');
    assert.match(pubProxy, /PIZZALOG_TOOLS_STAGING_API_URL/, 'api-proxy.php debe soportar PIZZALOG_TOOLS_STAGING_API_URL para staging');
    assert.match(pubProxy, /PIZZALOG_TOOLS_API_URL/, 'api-proxy.php debe soportar PIZZALOG_TOOLS_API_URL');
  });

  await t.test('Tarea 7.1: CORS, configuración ejemplo, esquema idempotente, workflow CI/CD y badge de entorno aseguran paridad staging vs producción', () => {
    const corsPhp = readRepoFile('backend/src/Core/Cors.php');
    assert.match(corsPhp, /https:\/\/tools\.pizzalog\.net/, 'Cors debe incluir origen de producción tools.pizzalog.net');
    assert.match(corsPhp, /https:\/\/tools-staging\.pizzalog\.net/, 'Cors debe incluir origen staging tools-staging.pizzalog.net');
    assert.match(corsPhp, /https:\/\/staging-tools\.pizzalog\.net/, 'Cors debe incluir origen staging staging-tools.pizzalog.net');

    const cfgExample = readRepoFile('backend/config/config.example.php');
    assert.match(cfgExample, /'tools'\s*=>\s*\[/, 'config.example.php debe incluir sección tools');
    assert.match(cfgExample, /'env'\s*=>/, 'config.example.php debe documentar tools.env');
    assert.match(cfgExample, /'staging_url'\s*=>/, 'config.example.php debe documentar tools.staging_url');
    assert.match(cfgExample, /'allowed_origins'\s*=>/, 'config.example.php debe documentar cors.allowed_origins');

    const mig036 = readRepoFile('backend/migrations/migration_036_tools_staging_prod_parity.sql');
    assert.match(mig036, /ALTER TABLE tools_accounts[\s\S]*ADD COLUMN IF NOT EXISTS activation_token/, 'migration_036 debe asegurar paridad de activation_token');
    assert.match(mig036, /ALTER TABLE tools_workspaces[\s\S]*ADD COLUMN IF NOT EXISTS version/, 'migration_036 debe asegurar columna version en tools_workspaces');
    assert.match(mig036, /CREATE TABLE IF NOT EXISTS tools_workspace_backups/, 'migration_036 debe asegurar tabla tools_workspace_backups');

    const authCtrl = readRepoFile('backend/src/Controllers/ToolsAuthController.php');
    assert.match(authCtrl, /ALTER TABLE tools_accounts ADD COLUMN activation_token/, 'ensureTables en ToolsAuthController debe mantener paridad idempotente con migration_036');
    assert.match(authCtrl, /ALTER TABLE tools_workspaces ADD COLUMN version/, 'ensureTables en ToolsAuthController debe asegurar version en tools_workspaces');

    const authGate = readRepoFile('frontend/apps/tools/src/ToolsAuthGate.tsx');
    assert.match(authGate, /VITE_TOOLS_ENV/, 'ToolsAuthGate debe soportar VITE_TOOLS_ENV para distinguir staging/producción');
    assert.match(authGate, /stagingBadge/, 'ToolsAuthGate debe mostrar badge staging explícito en entorno staging');

    const wfTools = readRepoFile('.github/workflows/build-tools.yml');
    assert.match(wfTools, /@pizzalog\/tools build/, 'CI build-tools.yml debe compilar tools');
    assert.match(wfTools, /VITE_TOOLS_ENV/, 'CI build-tools.yml debe configurar VITE_TOOLS_ENV para distinguir main vs staging');
    const wfEngine = readRepoFile('.github/workflows/ci-cost-engine.yml');
    assert.match(wfEngine, /pnpm run test/, 'CI ci-cost-engine.yml debe ejecutar la suite de tests');
    assert.match(wfEngine, /php -l/, 'CI ci-cost-engine.yml debe verificar sintaxis PHP');
  });
});
