# Pizzalog Cost Engine v1 — Especificación y Batería de Pruebas Golden

**Versión:** 1.0.0
**Paquetes implementados:**
- `@pizzalog/cost-engine` (`frontend/packages/cost-engine`)
- `@pizzalog/cost-engine-fixtures` (`frontend/packages/cost-engine-fixtures`)

---

## 1. Contrato de Dominio y Reglas Matemáticas

1. **Separación estricta de costos:**
   - El costo base de una receta o subreceta incluye **únicamente ingredientes**.
   - Los gastos operativos fijos (alquiler, sueldos, servicios) y los costos variables de canal (`packaging_cost`, `channel_fee_pct`) se calculan por separado sin distorsionar el `food_cost_pct` de ingredientes.
2. **Unidades y Conversiones (`units.ts`):**
   - Masa (`mg`, `g`, `kg`, `oz`, `lb`), Volumen (`ml`, `cc`, `l`, `L`, `fl_oz_us`, `gal_us`), Conteo (`unit`, `u`, `dozen`, `docena`).
   - Conversión `mass ↔ volume` exige `density_g_per_ml > 0` explícita en el ingrediente (`INCOMPATIBLE_UNITS_MISSING_DENSITY`).
   - Conversión `count ↔ mass` exige `unit_weight_g > 0` explícito en el ingrediente (`INCOMPATIBLE_UNITS`).
   - Unidades desconocidas lanzan `UNKNOWN_UNIT`. Nunca se devuelve la cantidad original sin convertir.
3. **Merma y Rendimiento Utilizable:**
   - $\text{gross\_unit\_cost} = \frac{\text{purchase\_price}}{\text{pack\_quantity\_in\_base\_unit}}$
   - $\text{usable\_unit\_cost} = \frac{\text{gross\_unit\_cost}}{\text{yield\_pct} / 100}$
   - La merma se aplica una única vez. Se rechazan valores $\le 0\%$ o $> 100\%$.
4. **Precios Faltantes (`status: 'incomplete'`):**
   - Un precio faltante o nulo **nunca** equivale a cero ni utiliza fallbacks hardcodeados.
   - El motor devuelve `status: 'incomplete'`, `batch_cost: null`, `unit_cost: null`, informa el avance en `partial_batch_cost`, detalla el insumo en `missing_inputs` y bloquea el cálculo de precio sugerido definitivo.
   - El agua o insumos sin costo deben declararse explícitamente con `is_free: true`.
5. **Fórmula Histórica Exacta Extraída para `CE-001` (`Calculadora de masa y costos.xlsx`, hoja `Masas`):**
   - `Masas!C5` (Harina total tanda de referencia): `8.22 kg`
   - `Masas!C6` (Sémola rimacinata): `0.50 kg` (`D15 = 0.5 / 8.22`, precio `Precios!D27 = 45000 / 25 = 1800 ARS/kg`)
   - `Masas!C7` (Harina integral): `1.00 kg` (`D16 = 1.0 / 8.22`, precio `Precios!D28 = 41000 / 25 = 1640 ARS/kg`)
   - `Masas!C8` (Harina blanca resto): `6.72 kg` (`1 - D15 - D16 = 6.72 / 8.22`, precio `Precios!D26 = 37500 / 25 = 1500 ARS/kg`)
   - `Masas!D14` (Hidratación): `67.9%` (`0.679`)
   - `Masas!D17` (Biga): `25%` (`0.25`), `D18` (Agua biga): `50%`, `D19` (Levadura biga): `0.5%` (`0.005`), precio Levadura `10000 ARS/kg`
   - `Masas!D24` (Sal): `2.7%` (`0.027`), precio Sal `650 ARS/kg`
   - Fórmula `Masas!D43`:
     $$\text{Costo/kg} = \frac{\frac{6.72}{8.22}\cdot 1500 + \frac{0.5}{8.22}\cdot 1800 + \frac{1.0}{8.22}\cdot 1640 + (0.25 \cdot 0.005)\cdot 10000 + 0.027 \cdot 650}{1 + 0.679} = 932.298871562119\text{ ARS/kg}$$
   - Costo por bollo de $220\text{ g}$:
     $$932.298871562119 \times 0.220 = 205.105751743666\text{ ARS}$$

---

## 2. Ejecución de las Pruebas Golden

```bash
cd frontend
pnpm run test
```
