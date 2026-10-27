# Pizzalog Mobile POS redesign — resource inventory

Estado: propuesta/prototipo en rama aislada. No mergear a main sin revisión funcional.

## Hallazgos del repositorio
- El POS Android es una app web React + TypeScript empaquetada con Capacitor 6. Android actúa como contenedor; las pantallas principales están en `frontend/apps/pos/src`.
- La venta se orquesta desde `modules/sale/SalePage.tsx`; componentes de catálogo y cobro: `ProductGrid.tsx`, `Cart.tsx`, `VariantPicker.tsx`, `PriceKeypad.tsx`, `SendToAccountSheet.tsx`, `HalfHalfModal.tsx` y `hooks.ts`.
- El shell, navegación y cabecera están en `app/Shell.tsx`, con iconografía compartida en `app/NavIcons.tsx`.
- Estilos globales y responsivos en `styles.css`; tema actual declara tokens CSS en `:root` y ahora mismo utiliza paleta oscura fija.
- Existe `src/assets/icons/` con SVG lineales de navegación (Inicio, Turno abierto/cerrado, Venta, Cuentas, Cocina, Ajustes). No se encontraron iconos de categorías de catálogo en esa carpeta.
- Existe marca (variantes SVG/PNG) en `public/brand/` y `src/assets/brand/`.
- La app tiene funciones que deben conservarse: variantes por pulsación prolongada, productos con precio abierto, extras, descuentos por línea y globales, medias pizzas, cobro con medios de pago, pagos divididos, envío a cuenta/diferir pago, impresión térmica/comandas, sincronización offline y estados de caja/conexión.
- No crear imágenes/recursos dentro del proyecto Android nativo salvo launcher/splash; los recursos visuales de pantallas deben vivir en POS web y ser incluidos por el build de Vite/Capacitor.

## Dirección visual
- Tema claro predeterminado: marfil cálido, texto carbón, rojo de acción principal, verde solo para estados positivos y ámbar para advertencias.
- Tema oscuro opcional, preferible durante servicio nocturno: carbón cálido, superficie elevada ligeramente más clara, crema para texto y los mismos acentos semánticos.
- Menos bordes y sombras; controles táctiles generosos; una sola acción primaria por contexto.
- Mantener carácter retro mediante iconos pixel art de categorías y detalles puntuales, no mediante tipografía pixelada en texto funcional.
- Preferencias de tema: claro / oscuro / sistema; persistencia en localStorage (y probar persistencia en Capacitor/WebView). La pantalla Cocina puede tener preferencia independiente más oscura, si se decide después.
- Respeto de safe-area de Android, alturas de barra inferior y área de navegación gestual.

## Inventario de recursos por diseñar
Crear un set de SVG vectoriales con estética pixel-art limpia (retícula 24/32 px, bordes nítidos, paleta limitada y fondo transparente). SVG es conveniente para tamaño y nitidez; exportar PNG @1x/@2x si Android/WebView o herramientas posteriores lo requieren. Las categorías deben poder asociarse por nombre o ID de categoría, no por posición.

### Categorías de venta
| Recurso / nombre | Significado | Prioridad |
|---|---|---|
| `category-pizza.svg` | Porción de pizza | P0 |
| `category-drinks.svg` | Lata de bebida | P0 |
| `category-desserts.svg` | Porción de tiramisú/postre | P0 |
| `category-promos.svg` | Pizza + lata | P0 |
| `category-starters.svg` | Pincho/entrada | P0 |
| `category-sandwiches.svg` | Sándwich | P0 |
| `category-hotdogs.svg` | Pancho; reutiliza el lenguaje de sándwich pero con salchicha visible | P0 |
| `category-coffee.svg` | Taza de café | P0 |
| `category-extras.svg` | Billete/importe adicional, no moneda específica | P0 |
| `category-hot-meals.svg` | Plato caliente con vapor | P1 |
| `category-salads.svg` | Ensaladera | P1 |
| `category-sides.svg` | Papas/guarnición | P1 |
| `category-breakfast.svg` | Taza + medialuna/tostada | P2 |
| `category-ice-cream.svg` | Helado | P2 |
| `category-uncategorized.svg` | Caja/etiqueta genérica | P0 |
| `category-other.svg` | Plato con cubiertos | P0 |

### Iconos funcionales / módulos
- Navegación: conservar SVG actuales; revisar tamaños/contraste por tema.
- Modalidad: íconos acá/comedor, llevar/bolsa, delivery/moto (no depender solo de emoji).
- Pedido: carrito/cesta, unidad/cantidad, sumar/restar, editar, vaciar.
- Producto: variante, extra, pizza mitad y mitad, precio abierto/teclado numérico, descuento.
- Cobro: efectivo/billete, tarjeta, transferencia/QR, otros medios, pago mixto/dividido, cuenta/diferir, confirmado/error.
- Caja: caja abierta/cerrada, retiro/ingreso, movimientos.
- Estado: conexión, sin conexión/cola pendiente, alerta, correcto.
- Impresión: impresora térmica, ticket y comanda.
- Accesibilidad: cerrar, volver, más/menos, ayuda; todos con label accesible.

## Reglas para los assets
- Un único estilo y escala; no mezclar emoji del sistema, iconos lineales finos y sprites ilustrados dentro del mismo grupo.
- Los iconos de categoría van en color; los controles funcionales pueden ser lineales, tintables con currentColor.
- Fondos transparentes; nada de sombras externas fuertes ni fondos rectangulares quemados dentro del archivo.
- Tamaño base recomendado 32x32 o viewBox 0 0 32 32, con área segura consistente y prueba visual a 24 px.
- Nombres estables en kebab-case; incluir `README.md` con catálogo, vista previa, licencia/origen y mapa de categorías.
- No derivar categoría solo del nombre visible cuando haya una categoría ID disponible. Fallbacks para bebidas/postres/pizzas/promos/entradas/sándwiches/panchos/cafetería/extras/platos calientes/otros.
- Mantener todas las imágenes optimizadas y evitar dependencias externas o llamadas remotas para iconos.

## Plan de implementación (aislado)
1. Crear tokens CSS semánticos para ambos temas, selector persistente claro/oscuro/sistema y comprobar contrastes.
2. Mejorar shell móvil y barra inferior en safe areas, sin alterar rutas ni acciones.
3. Rediseñar catálogo/selector de modalidad/product grid para que categorías puedan tener un icono asociado y el fallback sea correcto.
4. Rediseñar carrito como panel inferior expandible en móvil: estado compacto (conteo + total + acceso) y estado expandido con líneas, cantidades, extras/descuentos y acciones existentes.
5. Ajustar modal de variante/extras, precio abierto y medio/pago dividido sin cambiar las reglas funcionales.
6. Probar build y escenarios de regresión: venta normal, variantes por long press, extras, descuento por línea/global, mitad y mitad, precio abierto, cobro simple/dividido, envío a cuenta, impresión, offline y caja cerrada.

## Criterios de aceptación
- El tema puede cambiarse y persiste tras recargar/reabrir.
- Todo texto/importe mantiene contraste legible en ambos temas.
- No hay botones tapados por el carrito, teclado o safe-area.
- Las categorías se resuelven desde los datos disponibles y categorías desconocidas usan icono genérico.
- Todas las acciones de negocio existentes siguen entrando en los mismos handlers/hooks.
- `pnpm --filter @pizzalog/pos build` completa sin errores (o comando workspace equivalente según `frontend/package.json`).
- La prueba visual no depende de que haya red para descargar iconos o fuentes.
