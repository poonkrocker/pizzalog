# Pizzalog Tools — Informe de Auditoría y Release Candidate (`REPORT.md`)

- **Repositorio:** `poonkrocker/pizzalog`
- **Rama objetivo:** `main`
- **Punto de partida auditado:** `cbf3ce2892a563c47cd33e5aa5191eea1e145262` (`cbf3ce2`)
- **Fecha de auditoría:** 2026-11-19
- **Entorno local disponible:** Windows, Node `v20.18.0`, `pnpm 9.12.0`. Sin binarios locales de `php`, `soffice`/`libreoffice`, `mysql` ni `sqlite3` (documentados como `BLOCKED` donde corresponde y cubiertos con scripts reproducibles + CI Ubuntu/PHP 8.2).

---

## 1. Resumen Ejecutivo por Fase y Tarea

| Fase / Tarea | Descripción | Estado | Evidencia / Notas |
|---|---|---|---|
| **1.1** | Revisar comandos y paquetes (`frontend/package.json`, `cost-engine`, `price-list`, `tools`, workflows) | **PASS** | `frontend/package.json` actualizado a `pnpm -r test`; todas las suites incluidas (`540bd85`). |
| **1.2** | Corregir orden del CI (`install` → `typecheck` → `php -l` → `build` → paridad `dist/` → `test`) | **PASS** | `.github/workflows/ci-cost-engine.yml` reordenado (`540bd85`, `6b48701`, `22cfbc0`). |
| **1.3 (Node/pnpm)** | Ejecutar `install`, `typecheck`, `build`, `test` y `price-list test` | **PASS** | **179/179 tests PASS** (`0` fallos) tras Fase 2; `typecheck` 8/8 PASS; build `3.26s`. |
| **1.3 (`php -l`)** | Lint PHP sobre `backend/**/*.php` | **BLOCKED** | Sin binario `php` en máquina local. Configurado en CI (`.github/workflows/ci-cost-engine.yml`, PHP 8.2). |
| **2.1** | Paridad de publicación estricta (`dist/` obligatorio y control de assets obsoletos) | **PASS** | `production-infra-7-2-to-7-7.test.mjs` + `p0-regressions-phase2.test.mjs` (`6b48701`). |
| **2.2** | Errores de backup en `ToolsWorkspaceController.php` + aviso en frontend + tests | **PASS** *(código/Node)* / **BLOCKED** *(ejecución PHP local)* | `recordAutomaticBackup()`, logs sanitizados `[pizzalog-tools-backup]`, aviso en `App.tsx`, test PHP SQLite de 5 casos listo y conectado a CI (`6b48701`). |
| **2.3** | Parser XLSX sin omisiones silenciosas + 10 fixtures reales | **PASS** | Corregido en `importFileParser.ts` **y** `packages/price-list/src/fileParser.ts`; 11 subtests reales ejecutados y aprobados en `xlsx-parser-p0.test.mjs` (`6b48701`). |
| **2.4** | Regresión por cada corrección P0 | **PASS** | `p0-regressions-phase2.test.mjs` (3/3 PASS) + `xlsx-parser-p0.test.mjs` (11/11 PASS) + `test_workspace_backup_errors.php`. |
| **3.1** | MySQL y aislamiento de cuentas / JWT | **BLOCKED** *(script reproducible listo)* | `scripts/test_mysql_isolation.php` listo (MySQL aislado + modo `--sqlite-in-memory` en CI); requiere PHP + base MySQL de staging (`22cfbc0`). |
| **3.2** | Persistencia y concurrencia (2 sesiones, 409, desconexión, backup/restore) | **BLOCKED** *(script reproducible listo)* | `scripts/test_persistence_concurrency.mjs` listo (probado sintácticamente, exit 2 sin credenciales); requiere `TOOLS_API_BASE_URL` y cuenta de staging (`22cfbc0`). |
| **3.3** | Excel real recalculado con LibreOffice headless | **BLOCKED** *(script reproducible listo)* | `scripts/verify_excel_libreoffice.mjs` listo (exit 2 sin `soffice`); requiere LibreOffice instalado (`22cfbc0`). |
| **3.4** | Importación real (CSV `,`/`;`/`\t`, AR/BR/US, XLSX multi-hoja/oculta/fórmulas, ~17 MB, paridad JSON) | **PASS** | `scripts/generate_and_verify_import_fixtures.mjs` ejecutado en vivo: **8/8 checks PASS** (`22cfbc0`). |
| **3.5** | Servidor y límites (`/tools/import/limits` + prueba de carga en staging) | **BLOCKED** *(script reproducible listo)* | `scripts/check_staging_limits.mjs` listo (exit 2 sin URL); requiere `STAGING_API_BASE_URL` (`22cfbc0`). |
| **4.1** | Build, publicación `tools/`, proxy, rutas, CORS y auth | **PASS** *(local/estático)* | Build `index-BkeC-B05.js` + `index-CCz8DaOp.css` en paridad exacta con `dist/`; `.htaccess`, `.user.ini` y `api-proxy.php` verificados. |
| **4.2** | Revisión de seguridad (logs, inputs, aislamiento, CORS, proxy) | **PASS** *(con 1 hallazgo P2 documentado)* | Logs sanitizados sin secretos, CORS allowlist estricto, JWT aislado. Hallazgo P2 documentado en `api-proxy.php` (SSL verify en fallback loopback Ferozo). |
| **4.3** | Paquete de prueba manual (fixtures, checklist, restauración) | **PASS** | `MANUAL_TEST_CHECKLIST.md` + 6 fixtures reales en `fixtures/`. |

---

## 2. Hallazgos Detallados

### RC-001 — El script raíz `pnpm run test` excluía `@pizzalog/price-list`
- **ID:** `RC-001`
- **Prioridad:** `P1`
- **Archivo y función:** `frontend/package.json` (`scripts.test`)
- **Problema:** `scripts.test` ejecutaba solo `pnpm --filter @pizzalog/cost-engine test`, dejando fuera la suite de `@pizzalog/price-list`.
- **Evidencia:** Lectura directa de `frontend/package.json` línea 8 en `cbf3ce2`.
- **Corrección:** Cambiado a `"test": "pnpm -r test"` en commit `540bd85`.
- **Test asociado:** Ejecución de `pnpm run test` desde `frontend/`.
- **Resultado de ejecución:** **PASS** (ejecuta `@pizzalog/price-list` + `@pizzalog/cost-engine`).

### RC-002 — CI ejecutaba tests antes de compilar `tools`, ocultando desincronizaciones de `dist/` ↔ `tools/`
- **ID:** `RC-002`
- **Prioridad:** `P0`
- **Archivo y función:** `.github/workflows/ci-cost-engine.yml` y `frontend/packages/cost-engine/tests/production-infra-7-2-to-7-7.test.mjs` (`Tarea 7.7`)
- **Problema:** El workflow corría `pnpm run test` antes de `pnpm --filter @pizzalog/tools build`, y el test `7.7` salteaba la comparación con `dist/` si `dist/index.html` no existía (`if (hasLocalDist)`). Tampoco verificaba archivos obsoletos residuales en `tools/assets/`.
- **Evidencia:** Revisión de `.github/workflows/ci-cost-engine.yml` líneas 45–51 y `production-infra-7-2-to-7-7.test.mjs` líneas 310–350 en `cbf3ce2`.
- **Corrección:**
  - Workflow reordenado en `540bd85`: `install` → `typecheck` → `php -l` (+ tests PHP SQLite) → `build` paquetes → `build` Tools → paridad con `dist/` obligatorio → `pnpm run test`.
  - Test `7.7` endurecido en `6b48701` para fallar siempre si falta `dist/index.html` y verificar ausencia de assets obsoletos en `tools/assets/`.
- **Test asociado:** `production-infra-7-2-to-7-7.test.mjs` (`Tarea 7.7`) y `p0-regressions-phase2.test.mjs` (`P0-2.1`).
- **Resultado de ejecución:** **PASS**.

### RC-003 — Fallos de backup automático silenciados en `ToolsWorkspaceController::save()`
- **ID:** `RC-003`
- **Prioridad:** `P0`
- **Archivo y función:** `backend/src/Controllers/ToolsWorkspaceController.php` (`save()`, nueva `recordAutomaticBackup()`) y `frontend/apps/tools/src/App.tsx` (guardado automático `POST /tools/workspace`)
- **Problema:** El bloque `catch (\Throwable $ignoreBkp)` descartaba errores al crear o depurar backups sin loguear cuenta/versión ni informar al frontend que el backup había fallado.
- **Evidencia:** Lectura de `ToolsWorkspaceController.php` líneas 141–160 en `cbf3ce2`.
- **Corrección:**
  - Extraído `recordAutomaticBackup()` separando la inserción del backup de la limpieza de respaldos antiguos (`6b48701`).
  - Logging sanitizado `[pizzalog-tools-backup]` con `account`, `version` y `code` (nunca `workspace_json`).
  - Respuesta JSON incluye `backup_created`, `backup_warning` y `backup_cleanup_warning` sin perder el guardado principal.
  - `App.tsx` muestra `backup_warning` / `backup_cleanup_warning` mediante `setBackupNotice`.
- **Test asociado:** `p0-regressions-phase2.test.mjs` (`P0-2.2`) y `docs/audit/release-candidate/tests-php/test_workspace_backup_errors.php` (5 escenarios reales en PHP/SQLite).
- **Resultado de ejecución:** **PASS** en Node (`p0-regressions-phase2.test.mjs`); **BLOCKED** localmente para ejecución PHP directa (sin binario `php` local; conectado al CI PHP 8.2).

### RC-004 — Parser XLSX omitía silenciosamente hojas con relación inválida (`if (!target) continue;`) y existía copia duplicada activa en `@pizzalog/price-list/file`
- **ID:** `RC-004`
- **Prioridad:** `P0`
- **Archivo y función:** `frontend/apps/tools/src/importFileParser.ts` (`parseXlsx`) y `frontend/packages/price-list/src/fileParser.ts` (`parseXlsx`, `inflateRaw`)
- **Problema:** Cuando una hoja en `xl/workbook.xml` carecía de `Relationship` válida o apuntaba a un archivo XML inexistente, ambos parsers hacían `if (!target) continue;` descartando la hoja en silencio. Además, `App.tsx` importa `parseImportFile` desde `@pizzalog/price-list/file`, donde también faltaba el chequeo de `DecompressionStream`.
- **Evidencia:** `importFileParser.ts` línea 450, `fileParser.ts` línea 447 y `App.tsx` línea 43 en `cbf3ce2`.
- **Corrección:**
  - Ambos archivos actualizados (`6b48701`) para interrumpir la importación con error explícito nombrando la hoja afectada ante relación faltante, ruta inválida (`..`) o archivo XML ausente dentro del ZIP.
  - Se conservan hojas ocultas (`state="hidden"`/`veryHidden`) con advertencia explícita y se reportan fórmulas entre hojas y fórmulas sin valor cacheado.
  - Guardia `typeof DecompressionStream !== 'function'` agregada también en `fileParser.ts`.
- **Test asociado:** `frontend/packages/price-list/tests/xlsx-parser-p0.test.mjs` (11 subtests con fixtures XLSX binarios reales) y `p0-regressions-phase2.test.mjs` (`P0-2.3`).
- **Resultado de ejecución:** **PASS** (11/11 en `xlsx-parser-p0.test.mjs` + `P0-2.3` PASS).

### RC-005 — Fallback HTTP de `tools/api-proxy.php` desactiva verificación TLS y concatena `$curlErr`
- **ID:** `RC-005`
- **Prioridad:** `P2` (Observación de seguridad — compatible con Ferozo, a validar en staging)
- **Archivo y función:** `tools/api-proxy.php` (líneas 149–150, 170, 186–187)
- **Problema:** Cuando el proxy no encuentra `backend/public/index.php` en disco y cae al fallback HTTP hacia `api.pizzalog.net` vía `CURLOPT_RESOLVE` a `SERVER_ADDR`, deshabilita `CURLOPT_SSL_VERIFYPEER`/`CURLOPT_SSL_VERIFYHOST` y devuelve `$curlErr` en el JSON 502.
- **Evidencia:** Lectura directa de `tools/api-proxy.php` líneas 143–191.
- **Corrección:** No modificado aún para no romper el loopback TLS en DonWeb/Ferozo sin prueba en staging; documentado para endurecimiento en staging (habilitar verificación CA del sistema si Ferozo la soporta y loguear `$curlErr` en `error_log` en lugar de exponerlo al cliente).
- **Test asociado:** Verificación manual en staging con `api-proxy.php`.
- **Resultado de ejecución:** **BLOCKED** (requiere prueba en hosting DonWeb/Ferozo).

---

## 3. Commits Realizados y Archivos Modificados

1. **`540bd85`** — `ci(tools): run all workspace tests and build dist before parity verification`
   - `frontend/package.json`
   - `.github/workflows/ci-cost-engine.yml`
2. **`6b48701`** — `fix(tools): P0 fixes for strict dist parity, backup error reporting, and XLSX relationship validation`
   - `.github/workflows/ci-cost-engine.yml`
   - `backend/src/Controllers/ToolsWorkspaceController.php`
   - `docs/audit/release-candidate/tests-php/test_workspace_backup_errors.php`
   - `frontend/apps/tools/src/App.tsx`
   - `frontend/apps/tools/src/importFileParser.ts`
   - `frontend/packages/cost-engine/package.json`
   - `frontend/packages/cost-engine/tests/p0-regressions-phase2.test.mjs`
   - `frontend/packages/cost-engine/tests/production-infra-7-2-to-7-7.test.mjs`
   - `frontend/packages/price-list/package.json`
   - `frontend/packages/price-list/src/fileParser.ts`
   - `frontend/packages/price-list/tests/xlsx-parser-p0.test.mjs`
   - `tools/index.html`, `tools/assets/index-BkeC-B05.js` (reemplazando `index-1rejaXKN.js`)
3. **`22cfbc0`** — `test(rc): add Phase 3 integration scripts and real import/Excel RC fixtures`
   - `.github/workflows/ci-cost-engine.yml`
   - `docs/audit/release-candidate/scripts/test_mysql_isolation.php`
   - `docs/audit/release-candidate/scripts/test_persistence_concurrency.mjs`
   - `docs/audit/release-candidate/scripts/verify_excel_libreoffice.mjs`
   - `docs/audit/release-candidate/scripts/generate_and_verify_import_fixtures.mjs`
   - `docs/audit/release-candidate/scripts/check_staging_limits.mjs`
   - `docs/audit/release-candidate/fixtures/*` (6 archivos: 3 CSV, 2 XLSX, 1 JSON)
4. **Commit Fase 4** — `docs(rc): add Release Candidate audit report and manual testing checklist`
   - `docs/audit/release-candidate/MANUAL_TEST_CHECKLIST.md`
   - `docs/audit/release-candidate/REPORT.md`

---

## 4. Comandos Ejecutados y Resultados Reales

| Comando | Resultado | Detalle real observado |
|---|---|---|
| `pnpm install --frozen-lockfile` (en `frontend/`) | **PASS** | Lockfile al día (`2s`). |
| `pnpm run typecheck` (en `frontend/`) | **PASS** | 8/8 proyectos workspace (`tsc --noEmit` sin errores). |
| `pnpm --filter @pizzalog/tools build` | **PASS** | `built in 3.26s` (`dist/index.html` `0.42 kB`, `index-CCz8DaOp.css` `11.38 kB`, `index-BkeC-B05.js` `582.16 kB`). |
| `pnpm run test` (tras Fase 2, en `frontend/`) | **PASS** | `@pizzalog/price-list`: **29/29 PASS** (`1034.73 ms`, 0 fallos); `@pizzalog/cost-engine`: **150/150 PASS** (`11893.35 ms`, 0 fallos). **Total: 179/179 PASS**. |
| `node docs/audit/release-candidate/scripts/generate_and_verify_import_fixtures.mjs` | **PASS** | **8/8 PASS** (3 CSV AR/BR/US, matching alias/duplicados, XLSX multi-hoja/oculta/fórmulas, archivo `17.01 MB` / 9501 filas, roundtrip JSON y generación de `planilla_ejemplo_rc_es-AR.xlsx` `332732 bytes`). |
| `find backend -name "*.php" -print0 \| xargs -0 -n1 php -l` | **BLOCKED** | `php` CLI no instalado localmente (ejecutado en CI GitHub Actions PHP 8.2). |
| `node docs/audit/release-candidate/scripts/verify_excel_libreoffice.mjs` | **BLOCKED** | Exit `2`: LibreOffice (`soffice`) no instalado en esta máquina. |
| `node docs/audit/release-candidate/scripts/test_persistence_concurrency.mjs` | **BLOCKED** | Exit `2`: faltan `TOOLS_API_BASE_URL`, `TOOLS_TEST_EMAIL`, `TOOLS_TEST_PASSWORD`. |
| `node docs/audit/release-candidate/scripts/check_staging_limits.mjs` | **BLOCKED** | Exit `2`: falta `STAGING_API_BASE_URL`. |

---

## 5. Pendientes que Requieren Intervención Manual / Entorno Externo

1. **Verificación en GitHub Actions (`main`):** confirmar ejecución verde del workflow actualizado `.github/workflows/ci-cost-engine.yml` (que corre `php -l`, `test_workspace_backup_errors.php`, `test_mysql_isolation.php --sqlite-in-memory`, build de Tools, paridad `dist/` y los 179 tests Node).
2. **MySQL aislado en staging (`3.1`):** ejecutar `ALLOW_ISOLATED_TEST_DB=1 TEST_DB_* php docs/audit/release-candidate/scripts/test_mysql_isolation.php`.
3. **Concurrencia HTTP real en staging (`3.2`):** ejecutar `TOOLS_API_BASE_URL=... TOOLS_TEST_EMAIL=... TOOLS_TEST_PASSWORD=... node docs/audit/release-candidate/scripts/test_persistence_concurrency.mjs`.
4. **Límites reales de staging (`3.5`):** ejecutar `STAGING_API_BASE_URL=... node docs/audit/release-candidate/scripts/check_staging_limits.mjs` (y opcionalmente con `RUN_UPLOAD_LIMIT_TEST=1` + token de staging).
5. **Recálculo real en LibreOffice (`3.3`):** ejecutar `node docs/audit/release-candidate/scripts/verify_excel_libreoffice.mjs` en una máquina/runner con LibreOffice instalado.
6. **Ronda de pruebas manuales (`4.3`):** seguir `docs/audit/release-candidate/MANUAL_TEST_CHECKLIST.md` con los fixtures en `docs/audit/release-candidate/fixtures/` en Chrome, Firefox, Safari macOS/iOS y Chrome Android.

---

## 6. Dictamen de Release Candidate

- **Correcciones P0 (`2.1`, `2.2`, `2.3`):** resueltas y cubiertas por pruebas de regresión.
- **Suites automatizadas locales disponibles:** **179/179 PASS** (`0` fallos) + **8/8 PASS** en fixtures reales de importación (`3.4`).
- **Bloqueos externos:** claramente documentados con scripts ejecutables y reproducibles (sin mocks ni falsos positivos).
- **Estado:** **Candidata a iniciar ronda de pruebas manuales y validación en staging**, sujeta al verde del workflow PHP 8.2 en GitHub Actions y a la ejecución de los scripts de staging (`3.1`, `3.2`, `3.3`, `3.5`).
