# Iconos de categorías del POS

SVG locales con estética pixel-art sobria. Se sirven desde `/category-icons/` en la app web/Android empaquetada con Capacitor.

## Catálogo

- `category-pizza.svg` — porción de pizza
- `category-drinks.svg` — lata de bebida
- `category-desserts.svg` — porción de postre/tiramisú
- `category-promos.svg` — pizza + lata
- `category-starters.svg` — pincho/entrada
- `category-sandwiches.svg` — sándwich
- `category-hotdogs.svg` — pancho
- `category-coffee.svg` — taza de café
- `category-extras.svg` — billete/costo adicional
- `category-hot-meals.svg` — plato caliente
- `category-salads.svg` — ensalada
- `category-sides.svg` — guarnición/papas
- `category-breakfast.svg` — desayuno
- `category-ice-cream.svg` — helado
- `category-empanadas.svg` — empanadas
- `category-pasta.svg` — pastas
- `category-burgers.svg` — hamburguesas
- `category-bakery.svg` — panificados/medialunas
- `category-other.svg` — plato genérico
- `category-uncategorized.svg` — categoría sin nombre

## Asociación

La primera versión usa `src/assets/icons/categoryIconMap.ts` para normalizar nombres comunes en español y asociarlos al nombre del archivo. Los nombres no reconocidos usan el plato genérico; las categorías sin nombre usan el icono de categoría sin asignar. Si el catálogo expone identificadores estables de categoría, el siguiente paso recomendado es permitir una asociación explícita por ID para evitar depender exclusivamente del texto.

## Estilo y uso

- Fondo transparente y colores propios; el mismo dibujo sirve en tema claro y oscuro.
- Usar a unos 24–32 px en las pestañas de categorías.
- Los controles de la interfaz (volver, cerrar, cantidades, imprimir) siguen siendo iconos lineales y tintables; no reemplazar esos controles por ilustraciones.
- Mantener los SVG locales: no descargar imágenes en tiempo de ejecución.


## Iconos de interfaz del prototipo retro
- `product-pizza.svg` — miniatura de pizza redonda para cada tarjeta de producto de la categoría pizza.
- `module-register.svg` — ilustración de caja registradora.
- `module-accounts.svg` — libreta/mesas y cuentas.
- `module-cash.svg` — caja y efectivo.
- `module-oven.svg` — horno de pizza para Cocina.
- `channel-table.svg`, `channel-takeaway.svg`, `channel-delivery.svg` — modalidad de consumo, llevar y delivery.
