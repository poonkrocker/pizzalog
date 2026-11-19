# Pizzalog Tools — Guía y Checklist de Pruebas Manuales (Release Candidate)

## 1. Datos ficticios y paquete de prueba (sin credenciales de producción)

- **Usuario ficticio sugerido para alta en staging:**
  - Email: `rc.qa.pizzeria@example.test` *(crear cuenta nueva en staging; nunca usar contraseñas de producción)*
  - Nombre de negocio: `Pizzería Demo RC`
  - Moneda inicial: `ARS` · Idioma: `es-AR` · Sistema de unidades: `Métrico`
- **URL de staging:** configurar según entorno desplegado (ej. `https://staging-tools.pizzalog.net` / `https://tools.pizzalog.net` solo para verificación de lectura). *(URL de staging no provista en el repositorio; confirmar antes de ejecutar pruebas en vivo).*
- **Archivos de prueba listos en `docs/audit/release-candidate/fixtures/`:**
  - Workspace JSON de ejemplo: `fixtures/workspace_ejemplo_rc.json`
  - Excel v2 generado desde Cost Engine: `fixtures/planilla_ejemplo_rc_es-AR.xlsx`
  - CSV argentino (coma, decimales `1.500,50`, duplicados, sin precio, fila inválida): `fixtures/precios_ar_coma.csv`
  - CSV brasileño (punto y coma, decimales `145,80`): `fixtures/precios_br_puntoycoma.csv`
  - CSV estadounidense (tabulaciones, decimales `1,500.50`): `fixtures/precios_us_tab.csv`
  - XLSX multi-hoja (insumos, subrecetas, productos, gastos, ventas, hoja oculta, celdas formateadas vacías, fórmulas simples y entre hojas): `fixtures/catalogo_completo_multihoja.xlsx`

---

## 2. Checklist de prueba manual paso a paso

### A. Acceso, aislamiento y sesión
- [ ] Registrar cuenta A (`rc.qa.a@example.test`) y cuenta B (`rc.qa.b@example.test`) desde cero en staging.
- [ ] Confirmar que ambas arrancan limpias (sin datos de otra cuenta).
- [ ] Cargar datos distintos en A y B, cerrar sesión y reingresar: verificar aislamiento total.
- [ ] Verificar que un JWT de Tools no abre endpoints de Pizzalog App y viceversa.

### B. Carga manual, Cost Engine y Simulador
- [ ] Importar `fixtures/workspace_ejemplo_rc.json` en Cuenta A.
- [ ] Verificar costo de `Bollo Masa 260g`, `Pizza Muzzarella` y `Pizza Especial Jamón`.
- [ ] Modificar el precio de `Harina 0000` y comprobar actualización en cadena en subreceta, pizzas y simulador.
- [ ] Crear un insumo sin precio y agregarlo a una receta: verificar estado `INCOMPLETO` (sin mostrar `$0` ni precio sugerido engañoso).
- [ ] En el Simulador de Negocio, aplicar `+10%` en Harinas y verificar que solo cambia la porción de harina (no el costo total de la pizza).

### C. Importador inteligente y listas de precios
- [ ] Importar `fixtures/precios_ar_coma.csv` y revisar vista previa, alias y advertencias de filas sin precio/inválidas.
- [ ] Importar `fixtures/precios_br_puntoycoma.csv` y `fixtures/precios_us_tab.csv` comprobando delimitadores `;` y `\t`.
- [ ] Importar `fixtures/catalogo_completo_multihoja.xlsx` y comprobar que se muestran las 6 hojas con datos (incluida `CostosInternos` oculta con advertencia) y las fórmulas entre hojas.
- [ ] Probar un XLSX corrupto con relación de hoja inválida: debe detener la importación indicando el nombre de la hoja.

### D. Excel v2 independiente (descarga y edición offline)
- [ ] Descargar planilla Excel v2 desde la app en `es-AR`, `pt-BR` y `en` (o abrir `fixtures/planilla_ejemplo_rc_es-AR.xlsx`).
- [ ] Abrir en Microsoft Excel y LibreOffice Calc sin conexión a internet.
- [ ] Confirmar que `12_Simulaciones` inicia en `0%` en `B5:B10` y coincide con el escenario base.
- [ ] Modificar manualmente el precio de un insumo en Hoja 02/03 y comprobar recálculo automático en toda la cadena hasta Hoja 00.

### E. Persistencia, concurrencia (409) y backups
- [ ] Abrir la misma cuenta en dos pestañas (A y B).
- [ ] Guardar un cambio en A, luego intentar guardar en B sin recargar: verificar banner de conflicto `409` sin sobrescribir cambios de A.
- [ ] Desconectar internet brevemente durante un cambio, reconectar y verificar recuperación/guardado.
- [ ] Abrir pestaña `Snapshots / Backups`, verificar listado de respaldos automáticos en la nube y confirmar que no se muestra ningún fallo silencioso.

### F. Navegadores y móvil
- [ ] Probar en Chrome escritorio, Firefox escritorio, Safari macOS/iOS y Chrome Android.
- [ ] En Safari iOS (`<= 768px`), tocar campos `<input>` y `<select>`: confirmar que no dispara auto-zoom indeseado y que las tablas hacen scroll fluido.

---

## 3. Procedimiento de restauración ante incidentes

1. **Desde la interfaz web (1 clic):**
   - Ir a la pestaña **Snapshots / Respaldos**.
   - En la tarjeta **Copias de seguridad en la nube**, localizar la versión previa deseada (`id`, `version`, fecha y tamaño).
   - Presionar **Restaurar** y confirmar. El backend crea un backup del estado actual antes de restaurar e incrementa `version` monotónicamente.
2. **Desde respaldo local JSON:**
   - Si no hay acceso al servidor o se necesita migrar de cuenta, importar el archivo `.json` descargado (ej. `workspace_ejemplo_rc.json`) mediante la opción de importación de respaldo JSON.
3. **Verificación posterior a la restauración:**
   - Recargar la página (`F5`) para validar que la versión restaurada persiste desde `GET /tools/workspace`.
   - Comprobar un producto de referencia en el Cost Engine y descargar una copia JSON actualizada.
