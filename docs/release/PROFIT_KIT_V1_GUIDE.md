# Pizzalog Tools — Restaurant Profit Kit v1.0 (Guía Comercial y Técnica)

**Versión:** 1.0.0
**Archivo entregable autónomo:** `docs/release/Restaurant_Profit_Kit_v1.xlsx`
**Aplicación Web Companion:** `frontend/apps/tools` (`@pizzalog/tools`)
**Motor de referencia:** `frontend/packages/cost-engine` (`@pizzalog/cost-engine`)

---

## 1. Propósito del Producto

**Restaurant Profit Kit v1** es el primer producto comercial autónomo de la línea **Pizzalog Tools**. Está diseñado para que cualquier pizzería, panadería, hamburguesería o restaurante pueda controlar costos, mermas, subrecetas, precios sugeridos y punto de equilibrio **sin necesidad de cambiar su sistema POS ni crear una cuenta**.

Incluye dos superficies sincronizadas bajo el mismo contrato matemático (`Cost Engine v1`):
1. **Planilla Excel Autónoma (`Restaurant_Profit_Kit_v1.xlsx`)**: Funciona offline en Microsoft Excel y LibreOffice Calc.
2. **Web Companion (`@pizzalog/tools`)**: Aplicación web rápida con soporte multi-idioma (`es-AR`, `pt-BR`, `en`), multi-moneda (`ARS`, `USD`, `BRL`, `EUR`, `MXN`), unidades métricas y US customary, snapshots inmutables e importación/exportación JSON.

---

## 2. Estructura de `Restaurant_Profit_Kit_v1.xlsx`

1. **`01_Guia_y_Config`**: Parámetros globales (Moneda, Food Cost Objetivo %, Incremento de Redondeo, Costo de Packaging y Comisión de App Delivery) e instrucciones de uso.
2. **`02_Insumos_y_Merma`**: Catálogo de ingredientes con conversión a unidad base (`g`, `ml`, `unit`), cálculo de **Costo Bruto** y **Costo Utilizable** aplicando la merma (`Rendimiento Utilizable %`) una única vez, y alerta explícita `INCOMPLETO: FALTA PRECIO` cuando un insumo no tiene precio cargado.
3. **`03_Masas_y_Subrecetas`**: Costeo por lote (batch) y por unidad de rendimiento medido para masas con prefermento (Poolish/Biga) y salsas base.
4. **`04_Recetas_y_Precios`**: Escandallo de productos finales diferenciando estrictamente:
   - $\text{Food Cost \%} = \frac{\text{Costo Ingredientes}}{\text{Precio Venta}} \times 100$
   - $\text{Ganancia Bruta (\$)} = \text{Precio Venta} - \text{Costo Ingredientes}$
   - $\text{Margen Bruto \%} = \frac{\text{Ganancia Bruta}}{\text{Precio Venta}} \times 100$
   - $\text{Markup \%} = \frac{\text{Ganancia Bruta}}{\text{Costo Ingredientes}} \times 100$
   - $\text{Contribución Neta Delivery (\$)} = \text{Ganancia Bruta} - \text{Packaging} - (\text{Precio Venta} \times \text{Comisión Canal \%})$
5. **`05_Gastos_Operativos`**: Gastos fijos mensuales (alquiler, nómina, servicios, sistemas) separados del Food Cost y cálculo automático de **Facturación Mensual de Equilibrio (Break-Even)**.
6. **`06_Validacion_Golden`**: Hoja de autodiagnóstico con los casos Golden `CE-002` a `CE-008` verificados con fórmulas nativas (`PASS`).

---

## 3. Checklist de "Listo para Vender" (Sección 10 de Auditoría)

- [x] Los 8 casos Golden (`CE-001` a `CE-008`) pasan en `@pizzalog/cost-engine`.
- [x] Las fórmulas y unidades están verificadas.
- [x] Los errores de precio faltante (`INCOMPLETO: FALTA PRECIO`) y conversión incompatible son visibles y bloquean precios sugeridos engañosos.
- [x] La plantilla contiene únicamente datos ficticios de demostración (*"Pizzería Demo — Il Forno"*) y **cero datos privados de Arrabbiata**.
- [x] El archivo `.xlsx` es OpenXML estándar compatible con Microsoft Excel y LibreOffice Calc.
- [x] Incluye guía de uso, versión (`1.0.0`) y changelog.

---

## 4. Changelog

### v1.0.0 (2026-11-02)
- Lanzamiento inicial de `@pizzalog/cost-engine`, `@pizzalog/cost-engine-fixtures`, `Restaurant_Profit_Kit_v1.xlsx` y `@pizzalog/tools`.
