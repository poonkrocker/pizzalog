import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../..');

function readRepo(relPath) {
  return fs.readFileSync(path.resolve(REPO_ROOT, relPath), 'utf8');
}

test('Fase 2 — Regresiones P0 (2.1 paridad estricta, 2.2 errores de backup, 2.3 parser XLSX sin omisiones)', async (t) => {
  await t.test('P0-2.1: Test 7.7 falla si falta dist/index.html y detecta assets obsoletos en tools/assets/', () => {
    const testSrc = readRepo('frontend/packages/cost-engine/tests/production-infra-7-2-to-7-7.test.mjs');
    assert.ok(!testSrc.includes('if (hasLocalDist)'), 'El test 7.7 nunca debe saltear la validación si falta dist/');
    assert.ok(testSrc.includes('Falta frontend/apps/tools/dist/index.html'), 'Debe exigir dist/index.html obligatoriamente');
    assert.ok(testSrc.includes('Asset publicado obsoleto no referenciado'), 'Debe detectar assets publicados obsoletos');
  });

  await t.test('P0-2.2: ToolsWorkspaceController registra errores de backup con cuenta/versión y avisa al frontend sin ocultar fallos', () => {
    const ctrl = readRepo('backend/src/Controllers/ToolsWorkspaceController.php');
    assert.ok(!ctrl.includes('$ignoreBkp'), 'No debe existir catch silencioso $ignoreBkp');
    assert.ok(ctrl.includes('public static function recordAutomaticBackup('), 'Debe existir recordAutomaticBackup()');
    assert.ok(ctrl.includes('[pizzalog-tools-backup] Automatic backup insert failed account=%d version=%d'), 'Debe loguear fallo de insert con account y version');
    assert.ok(ctrl.includes('[pizzalog-tools-backup] Automatic backup cleanup failed account=%d version=%d'), 'Debe loguear fallo de limpieza por separado');
    assert.ok(ctrl.includes("'backup_created' =>"), 'Debe devolver flag backup_created explícito');
    assert.ok(ctrl.includes("'backup_warning' =>"), 'Debe devolver backup_warning al frontend');
    assert.ok(ctrl.includes("'backup_cleanup_warning' =>"), 'Debe devolver backup_cleanup_warning al frontend');
    // Nunca loguear workspace_json en el error_log de backup
    const logLines = ctrl.split('\n').filter((line) => line.includes('[pizzalog-tools-backup]'));
    assert.ok(logLines.length >= 2);
    for (const line of logLines) {
      assert.ok(!line.includes('previousJson') && !line.includes('workspace_json'));
    }

    const appTsx = readRepo('frontend/apps/tools/src/App.tsx');
    assert.ok(appTsx.includes('payload.data?.backup_warning'), 'App.tsx debe mostrar advertencia cuando falla el backup automático');
  });

  await t.test('P0-2.3: Ningún parser XLSX (tools ni price-list) omite silenciosamente hojas con relación inválida', () => {
    for (const relPath of [
      'frontend/apps/tools/src/importFileParser.ts',
      'frontend/packages/price-list/src/fileParser.ts',
    ]) {
      const src = readRepo(relPath);
      assert.ok(!src.includes('if (!target) continue;'), `${relPath} no debe omitir hojas silenciosamente`);
      assert.ok(src.includes('no tiene una relación interna válida'), `${relPath} debe lanzar error identificando la hoja`);
      assert.ok(src.includes('no existe dentro del XLSX'), `${relPath} debe fallar si el archivo XML de la hoja falta en el ZIP`);
      assert.ok(src.includes("typeof DecompressionStream !== 'function'"), `${relPath} debe validar DecompressionStream`);
    }
  });
});
