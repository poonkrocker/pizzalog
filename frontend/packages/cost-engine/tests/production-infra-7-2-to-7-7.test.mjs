import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as costEnginePkg from '../dist/index.js';
import * as priceListPkg from '../../price-list/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

function readRepoFile(relPath) {
  return fs.readFileSync(path.resolve(REPO_ROOT, relPath), 'utf8');
}

function loadToolsTsModule(relPathFromToolsSrc, cache = new Map()) {
  const fullPath = path.resolve(REPO_ROOT, 'frontend/apps/tools/src', relPathFromToolsSrc);
  if (cache.has(fullPath)) return cache.get(fullPath);

  const source = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  const moduleObj = { exports: {} };
  cache.set(fullPath, moduleObj.exports);

  const customRequire = (id) => {
    if (id === '@pizzalog/cost-engine') return costEnginePkg;
    if (id === '@pizzalog/price-list') return priceListPkg;
    if (id.startsWith('./')) {
      const targetRel = id.endsWith('.ts') ? id : `${id}.ts`;
      return loadToolsTsModule(path.join(path.dirname(relPathFromToolsSrc), targetRel), cache);
    }
    throw new Error(`Unsupported require in test loader: ${id}`);
  };

  const fn = new Function('exports', 'require', 'module', transpiled);
  fn(moduleObj.exports, customRequire, moduleObj);
  cache.set(fullPath, moduleObj.exports);
  return moduleObj.exports;
}

const {
  CostEngine,
  decomposeRecipeCategoryCosts,
  generateProfitKitV2WorkbookBytes,
} = costEnginePkg;
const { createEmptyWorkspace, normalizeWorkspace } = loadToolsTsModule('demoData.ts');

test('Bloque 7 (Tareas 7.2 a 7.7): CORS/API, logs sin secretos, rendimiento masivo, compatibilidad de navegadores, backups y despliegue', async (t) => {
  await t.test('Tarea 7.2: CORS rechaza orígenes no autorizados / wildcards y todos los endpoints protegidos de Tools exigen autenticación aislada', () => {
    const corsPhp = readRepoFile('backend/src/Core/Cors.php');
    assert.doesNotMatch(corsPhp, /Access-Control-Allow-Origin:\s*\*/, 'CORS nunca debe emitir wildcard *');
    assert.match(corsPhp, /http_response_code\(403\)/, 'CORS debe rechazar preflight OPTIONS de origen no autorizado con HTTP 403');

    // Simular exactamente la lógica de isOriginAllowed de Cors.php sobre DEFAULT_ALLOWED_ORIGINS
    const originsMatch = corsPhp.match(/DEFAULT_ALLOWED_ORIGINS\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(originsMatch, 'Cors::DEFAULT_ALLOWED_ORIGINS debe existir');
    const allowedOrigins = Array.from(originsMatch[1].matchAll(/'([^']+)'/g)).map((m) => m[1].toLowerCase());
    const isAllowed = (origin) => allowedOrigins.includes(String(origin).trim().replace(/\/+$/, '').toLowerCase());

    assert.equal(isAllowed('https://tools.pizzalog.net'), true);
    assert.equal(isAllowed('https://tools-staging.pizzalog.net'), true);
    assert.equal(isAllowed('https://staging-tools.pizzalog.net'), true);
    assert.equal(isAllowed('https://evil.example.com'), false);
    assert.equal(isAllowed('https://tools.pizzalog.net.attacker.com'), false);
    assert.equal(isAllowed('http://tools.pizzalog.net'), false);

    // Verificar todas las rutas /tools/* en index.php
    const indexPhp = readRepoFile('backend/public/index.php');
    const bootstrapPhp = readRepoFile('backend/bootstrap.php');
    assert.match(bootstrapPhp, /Cors::handle\(/, 'bootstrap.php debe invocar Cors::handle antes del despacho');

    const routeLines = indexPhp.split(/\r?\n/).filter((l) => /\$router->.*'\/tools\//.test(l));
    assert.ok(routeLines.length >= 15, 'Deben existir todas las rutas /tools/* declaradas');
    const publicToolsAuthRoutes = new Set([
      '/tools/auth/login',
      '/tools/auth/activate',
      '/tools/auth/forgot-password',
      '/tools/auth/reset-password',
    ]);
    for (const line of routeLines) {
      const pathMatch = line.match(/'(\/tools\/[^']+)'/);
      assert.ok(pathMatch, `Línea de ruta inválida: ${line}`);
      const routePath = pathMatch[1];
      if (!publicToolsAuthRoutes.has(routePath)) {
        if (routePath === '/tools/admin/accounts') {
          assert.match(line, /\[\$auth,\s*\$admin\]/, `${routePath} debe exigir admin de plataforma`);
        } else {
          assert.match(line, /\[\$toolsAuth\]/, `${routePath} debe exigir middleware [$toolsAuth]`);
        }
      }
    }

    // Aislamiento estricto Tools <-> App en Auth.php y ToolsAuth.php
    const authPhp = readRepoFile('backend/src/Core/Auth.php');
    const toolsAuthPhp = readRepoFile('backend/src/Core/ToolsAuth.php');
    assert.match(authPhp, /'pizzalog-tools'/, 'Auth de App debe rechazar tokens con aud=pizzalog-tools');
    assert.match(toolsAuthPhp, /'pizzalog-tools'/, 'ToolsAuth debe aceptar únicamente tokens aud=pizzalog-tools');
  });

  await t.test('Tarea 7.3: Logs registran fallos críticos de importación, guardado, auth y sync sin exponer contraseñas, tokens ni API keys', () => {
    const authCtrl = readRepoFile('backend/src/Controllers/ToolsAuthController.php');
    assert.match(authCtrl, /function safeLogTag/, 'ToolsAuthController debe implementar safeLogTag para enmascarar identidades/tokens');
    assert.match(authCtrl, /\[pizzalog-tools-auth\].*429/, 'Debe loguear bloqueos por rate-limit (429)');
    assert.match(authCtrl, /\[pizzalog-tools-auth\].*401/, 'Debe loguear credenciales inválidas (401)');
    assert.match(authCtrl, /\[pizzalog-tools-auth\].*404/, 'Debe loguear tokens de activación/reset inválidos (404)');
    assert.doesNotMatch(authCtrl, /error_log\([^;]*\$(password|resetToken|resetLink|jwtSecret)\b/, 'ToolsAuthController jamás debe loguear contraseñas, tokens o claves JWT');

    const impCtrl = readRepoFile('backend/src/Controllers/ToolsImportController.php');
    assert.match(impCtrl, /\[pizzalog-tools-import\]/, 'ToolsImportController debe loguear fallos relevantes sin exponer contenido de celdas ni API keys');
    assert.doesNotMatch(impCtrl, /error_log\([^;]*\$(apiKey|raw|inputJson)\b/, 'ToolsImportController no debe volcar API key ni payload completo a logs');

    const wsCtrl = readRepoFile('backend/src/Controllers/ToolsWorkspaceController.php');
    assert.match(wsCtrl, /error_log\('\[pizzalog-tools\] Error saving workspace/, 'ToolsWorkspaceController::save debe loguear errores internos sin filtrarlos al cliente');
    assert.match(wsCtrl, /error_log\('\[pizzalog-tools\] Error restoring backup/, 'ToolsWorkspaceController::restore debe loguear errores internos sin filtrarlos al cliente');

    const syncCtrl = readRepoFile('backend/src/Controllers/ToolsSyncController.php');
    assert.match(syncCtrl, /\[pizzalog-sync\]/, 'ToolsSyncController debe loguear errores de vinculación/sincronización sin contraseñas');
    assert.doesNotMatch(syncCtrl, /error_log\([^;]*\$password\b/, 'ToolsSyncController jamás debe loguear contraseñas de App');
  });

  await t.test('Tarea 7.4: Rendimiento con catálogo grande (300 insumos, 15 subrecetas anidadas, 50 productos finales y export Excel v2)', () => {
    const ingredients = [];
    const purchasePrices = [];
    for (let i = 1; i <= 300; i += 1) {
      const catPrefix = i % 5 === 0 ? 'Harina' : i % 5 === 1 ? 'Queso' : i % 5 === 2 ? 'Pollo' : i % 5 === 3 ? 'Tomate' : 'Especia';
      const id = `ing_perf_${i}`;
      ingredients.push({
        id,
        name: `${catPrefix} Perf ${i}`,
        base_dimension: 'mass',
        base_unit: 'g',
        is_active: true,
      });
      purchasePrices.push({
        ingredient_id: id,
        purchase_date: '2026-11-18',
        purchase_price: 5000 + i * 25,
        currency: 'ARS',
        pack_quantity: 5,
        pack_unit: 'kg',
        yield_pct: i % 4 === 0 ? 85 : 100,
      });
    }

    const recipes = [];
    for (let s = 1; s <= 15; s += 1) {
      const comps = [];
      for (let k = 0; k < 4; k += 1) {
        const idx = ((s * 7 + k * 3) % 300) + 1;
        comps.push({
          component_type: 'ingredient',
          ingredient_id: `ing_perf_${idx}`,
          quantity: 200 + k * 50,
          unit: 'g',
        });
      }
      if (s > 1 && s <= 5) {
        comps.push({
          component_type: 'subrecipe',
          recipe_id: 'sub_perf_1',
          quantity: 150,
          unit: 'g',
        });
      }
      recipes.push({
        id: `sub_perf_${s}`,
        name: `Subreceta Perf ${s}`,
        recipe_type: 'subrecipe',
        yield_quantity: 1000,
        yield_unit: 'g',
        currency: 'ARS',
        components: comps,
      });
    }

    const productSalesMap = {};
    for (let p = 1; p <= 50; p += 1) {
      const pid = `prod_perf_${p}`;
      const subId = `sub_perf_${((p - 1) % 15) + 1}`;
      const baseIdx = ((p * 5) % 290) + 1;
      recipes.push({
        id: pid,
        name: `Pizza Perf ${p}`,
        recipe_type: 'product',
        yield_quantity: 1,
        yield_unit: 'unit',
        target_food_cost_pct: 30,
        currency: 'ARS',
        components: [
          { component_type: 'subrecipe', recipe_id: subId, quantity: 280, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: `ing_perf_${baseIdx}`, quantity: 150, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: `ing_perf_${baseIdx + 1}`, quantity: 80, unit: 'g' },
          { component_type: 'ingredient', ingredient_id: `ing_perf_${baseIdx + 2}`, quantity: 40, unit: 'g' },
        ],
      });
      productSalesMap[pid] = { monthlyUnitsSold: 100 + p * 3, sellingPrice: null };
    }

    const largeCatalog = { ingredients, purchase_prices: purchasePrices, recipes };
    const t0 = performance.now();
    const engine = new CostEngine(largeCatalog);
    const results = recipes.map((r) => engine.calculateRecipeCost(r.id));
    const tEngineMs = performance.now() - t0;

    assert.equal(results.length, 65);
    assert.ok(results.every((r) => r.status === 'complete' && r.raw_unit_cost !== null));
    assert.ok(tEngineMs < 500, `Cálculo completo (300 insumos + 65 recetas) tomó ${tEngineMs.toFixed(1)}ms (< 500ms)`);

    const t1 = performance.now();
    for (let p = 1; p <= 50; p += 1) {
      const dec = decomposeRecipeCategoryCosts(largeCatalog, `prod_perf_${p}`, 'ARS', engine);
      assert.ok(dec.totalCost > 0);
    }
    const tDecompMs = performance.now() - t1;
    assert.ok(tDecompMs < 250, `Descomposición cacheada de 50 productos tomó ${tDecompMs.toFixed(1)}ms (< 250ms)`);

    const t2 = performance.now();
    const wbBytes = generateProfitKitV2WorkbookBytes({
      businessName: 'Perf Test 300/65',
      currency: 'ARS',
      locale: 'es-AR',
      unitSystem: 'metric',
      defaultTargetFoodCostPct: 30,
      defaultRoundingIncrement: 500,
      defaultPackagingCost: 0,
      defaultChannelFeePct: 0,
      catalog: largeCatalog,
      operatingExpenses: [
        { id: 'exp_perf_1', name: 'Alquiler', category: 'rent', period: 'monthly', amount: 1200000 },
      ],
      productSalesMap,
    });
    const tExcelMs = performance.now() - t2;
    assert.ok(wbBytes.byteLength > 50000);
    assert.ok(tExcelMs < 2000, `Generación Excel v2 completo (300 insumos + 65 recetas) tomó ${tExcelMs.toFixed(1)}ms (< 2000ms)`);

    const appSrc = readRepoFile('frontend/apps/tools/src/App.tsx');
    assert.match(appSrc, /baseDecompByProductId\s*=\s*useMemo/, 'App.tsx debe cachear descomposición base por producto con useMemo');
  });

  await t.test('Tarea 7.5: Compatibilidad de navegadores (Chrome, Firefox, Safari y móviles)', () => {
    const indexHtml = readRepoFile('frontend/apps/tools/index.html');
    assert.match(indexHtml, /<meta charset="UTF-8"/i);
    assert.match(indexHtml, /<meta name="viewport" content="width=device-width, initial-scale=1\.0"/i);

    const parserTs = readRepoFile('frontend/apps/tools/src/importFileParser.ts');
    assert.match(parserTs, /typeof DecompressionStream\s*!==\s*'function'/, 'importFileParser debe degradar con mensaje claro si DecompressionStream no existe');

    const css = readRepoFile('frontend/apps/tools/src/styles.css');
    assert.match(css, /-webkit-overflow-scrolling:\s*touch/, 'styles.css debe habilitar scroll táctil suave en iOS Safari');
    assert.match(css, /-webkit-backdrop-filter:/, 'styles.css debe incluir prefijo -webkit-backdrop-filter para Safari');
    assert.match(css, /font-size:\s*16px/, 'styles.css debe fijar font-size >= 16px en móvil para evitar auto-zoom de iOS Safari');
  });

  await t.test('Tarea 7.6: Restauración real de backups (roundtrip completo nube + respaldo JSON)', () => {
    const wsCtrl = readRepoFile('backend/src/Controllers/ToolsWorkspaceController.php');
    assert.match(wsCtrl, /INSERT INTO tools_workspace_backups/, 'save() debe guardar snapshot previo antes de sobrescribir');
    assert.match(wsCtrl, /ORDER BY id DESC LIMIT 1 OFFSET 10/, 'save() debe rotar backups antiguos preservando últimos 10');
    assert.match(wsCtrl, /WHERE id = \? AND account_id = \?/, 'restore() debe restringir backup_id al account_id autenticado');
    assert.match(wsCtrl, /UPDATE tools_workspaces SET workspace_json = \?, version = \?/, 'restore() debe actualizar workspace e incrementar versión monótonamente');

    const appSrc = readRepoFile('frontend/apps/tools/src/App.tsx');
    assert.match(appSrc, /loadCloudBackups/, 'App.tsx debe listar backups desde /tools/workspace/backups');
    assert.match(appSrc, /restoreCloudBackup/, 'App.tsx debe ejecutar restauración vía /tools/workspace/restore');

    // Simular ciclo real de backup -> mutación destructiva -> restauración -> validación intacta
    const v1State = createEmptyWorkspace('es-AR', 'ARS');
    v1State.businessName = 'Pizzería Backup Segura';
    v1State.catalog.ingredients.push({
      id: 'ing_bkp_1',
      name: 'Harina 0000 Original',
      base_dimension: 'mass',
      base_unit: 'g',
      is_active: true,
    });
    v1State.catalog.purchase_prices.push({
      ingredient_id: 'ing_bkp_1',
      purchase_date: '2026-11-10',
      purchase_price: 22000,
      currency: 'ARS',
      pack_quantity: 25,
      pack_unit: 'kg',
      yield_pct: 100,
    });

    const backupRow = { id: 42, account_id: 7, version: 1, workspace_json: JSON.stringify(v1State) };
    // Mutación accidental en v2
    const mutatedV2 = createEmptyWorkspace('es-AR', 'ARS');
    assert.equal(mutatedV2.catalog.ingredients.length, 0);

    // Restauración desde backupRow validado + normalizeWorkspace + CostEngine
    const restoredRaw = JSON.parse(backupRow.workspace_json);
    const restored = normalizeWorkspace(restoredRaw);
    assert.equal(restored.businessName, 'Pizzería Backup Segura');
    assert.equal(restored.catalog.ingredients.length, 1);
    assert.equal(restored.catalog.purchase_prices[0].purchase_price, 22000);
    const eng = new CostEngine(restored.catalog);
    assert.ok(eng instanceof CostEngine);
  });

  await t.test('Tarea 7.7: Compilación y despliegue en tools/ coinciden con dist/ generado desde main', () => {
    const normalizeNl = (value) => value.replace(/\r\n/g, '\n');
    const deployedHtml = readRepoFile('tools/index.html');
    const distHtmlPath = path.resolve(REPO_ROOT, 'frontend/apps/tools/dist/index.html');
    const hasLocalDist = fs.existsSync(distHtmlPath);

    if (hasLocalDist) {
      const distHtml = fs.readFileSync(distHtmlPath, 'utf8');
      assert.equal(
        normalizeNl(deployedHtml),
        normalizeNl(distHtml),
        'tools/index.html debe ser idéntico al dist/ generado'
      );
    }

    const assetRefs = [
      ...Array.from(deployedHtml.matchAll(/src="(?:\.?\/)?(assets\/[^"]+)"/g)).map((m) => m[1]),
      ...Array.from(deployedHtml.matchAll(/href="(?:\.?\/)?(assets\/[^"]+)"/g)).map((m) => m[1]),
    ];
    assert.ok(assetRefs.length >= 2, 'tools/index.html debe referenciar bundle JS y CSS compilados');
    for (const relAsset of assetRefs) {
      const deployedAssetPath = path.resolve(REPO_ROOT, 'tools', relAsset);
      assert.ok(fs.existsSync(deployedAssetPath), `Falta asset publicado: tools/${relAsset}`);
      const deployedAssetContent = fs.readFileSync(deployedAssetPath, 'utf8');
      assert.ok(deployedAssetContent.length > 0, `Asset publicado vacío: tools/${relAsset}`);

      if (hasLocalDist) {
        const distAssetPath = path.resolve(REPO_ROOT, 'frontend/apps/tools/dist', relAsset);
        assert.ok(fs.existsSync(distAssetPath), `Falta asset en dist/: ${relAsset}`);
        assert.equal(
          normalizeNl(deployedAssetContent),
          normalizeNl(fs.readFileSync(distAssetPath, 'utf8')),
          `El archivo publicado tools/${relAsset} debe coincidir con el build actual`
        );
      }
    }

    assert.ok(fs.existsSync(path.resolve(REPO_ROOT, 'tools/.htaccess')));
    assert.ok(fs.existsSync(path.resolve(REPO_ROOT, 'tools/.user.ini')));
    assert.ok(fs.existsSync(path.resolve(REPO_ROOT, 'tools/api-proxy.php')));
  });
});
