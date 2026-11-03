# Cost Engine unificado en Pizzalog App y Tools

## Objetivo

Pizzalog Tools y el panel operativo de Pizzalog App deben compartir una única implementación matemática: `frontend/packages/cost-engine`. PHP conserva responsabilidades de autenticación, lectura/escritura y proyección operativa, pero no vuelve a calcular costos, food cost, márgenes ni escenarios.

## Cambios de esta rama

- Recipe Studio sigue calculando recetas y subrecetas con Cost Engine.
- El antiguo escandallo PHP y su editor de recetas fueron retirados de la pantalla de Producción. La pestaña de costeo utiliza Recipe Studio.
- El simulador de variación de costos/precios ahora utiliza `calculatePortfolioScenario` dentro del Cost Engine. Los productos con costo incompleto no se convierten en cero ni entran en los totales.
- La calculadora de masas ejecuta `expandBakersDoughSpec` y `CostEngine` en el cliente. Se eliminaron `ProductionController::computeDough`, `getSupplyCosts` y el endpoint `POST /production/dough-calculate`.
- Los perfiles de masa conservan sus porcentajes y rendimiento. La nueva propiedad `ingredient_map` vincula cada rol de ingrediente con un insumo real de `supplies`.
- Los costos de masa solo se muestran completos si las asignaciones y precios necesarios existen y las unidades son compatibles. No se usan los antiguos importes fallback hardcodeados.
- Se retiraron las rutas PHP de escandallos, guardado de recetas y simulación: `GET /production/cost-margins`, `POST /production/recipes` y `POST /production/simulate`.

## Mapeo de ingredientes de masas

Cada perfil permite asignar los insumos del catálogo para harina blanca, sémola, integral, levaduras por prefermento, sal, azúcar y aceite. Fainá utiliza harina de garbanzos, sal y aceite; el agua es opcional para el costo.

Los mapeos se guardan por perfil. Las unidades no compatibles no se convierten por aproximación. En particular, conversiones masa-volumen requieren densidad explícita; si no está disponible, el costo queda incompleto.

## Validez de costos de productos

`products.cost` es una proyección para reportes, no una fuente matemática. La columna `cost_is_current` diferencia un snapshot completo de un valor viejo o manual.

- Solo una receta activa con snapshot completo de Cost Engine marca el costo como vigente.
- Una receta incompleta o desvinculada marca el costo anterior como desactualizado, sin reemplazarlo por cero.
- Cambios de costo, unidad o disponibilidad de insumos invalidan conservadoramente los costos de productos del negocio.
- Ediciones completas manuales de productos invalidan su costo; ediciones rápidas de precio no lo hacen.
- Analytics y reportes de ventas no calculan márgenes con costos desactualizados. Los totales de costo se muestran incompletos si falta algún costo vigente.

El snapshot persiste `engine_version` e `input_snapshot_hash` para trazabilidad. La API valida estructura, negocio y vínculo, pero no vuelve a ejecutar matemáticas TypeScript en PHP; por tanto, el resultado del cliente sigue siendo el origen del snapshot, igual que en la arquitectura actual de Tools. Una verificación matemática server-side requeriría disponer de un runtime Node compatible en el hosting o una decisión de infraestructura equivalente.

## Migraciones nuevas

Aplicar manualmente antes del despliegue:

1. `backend/migrations/migration_031_tools_accounts_workspace.sql` — cuentas y workspace comercial de Tools.
2. `backend/migrations/migration_032_dough_profile_ingredient_map.sql` — mapeos explícitos de insumos en perfiles de masa.
3. `backend/migrations/migration_033_product_cost_engine_validity.sql` — vigencia y procedencia de snapshots de costo de productos.

Las migraciones 032 y 033 son idempotentes respecto de las columnas que agregan. Los perfiles existentes conservan sus fórmulas, pero necesitan asignar insumos para recuperar costos completos. Los productos existentes empiezan con `cost_is_current = 0`; deben recalcularse desde Recipe Studio para volver a alimentar márgenes confiables.

## Validaciones pendientes de despliegue

El CI cubre PHP lint/sintaxis, TypeScript, Golden Tests, y builds del panel y Tools. No sustituye las pruebas reales de MySQL: aplicar migraciones en staging, guardar/editar perfiles, comprobar aislamiento por negocio, importar recetas históricas y verificar que costos incompletos o cambios de insumos invaliden márgenes.
