# Pizzalog — propuesta visual del POS móvil

Este documento acompaña el inventario de recursos. No modifica la lógica de la aplicación ni implica que el diseño esté aprobado para producción.

## Dirección
- **Claro:** marfil cálido (#F4E8CE aprox.), texto carbón (#27231F), rojo de acción (#C92D32 aprox.), verde de estado y ámbar de advertencia.
- **Oscuro:** carbón cálido (no negro puro), superficies diferenciadas suavemente, texto crema, rojo de acción y verde/ámbar semánticos.
- Tema inicial: claro. Selector: Claro / Oscuro / Sistema.
- Identidad retro localizada en iconografía pixel-art, color y detalles; evitar fuentes pixeladas en importes, descripciones y formularios.

## Venta — distribución móvil
1. Cabecera compacta: marca, estado de caja, indicador de conexión y selector de tema desde ajustes (no llenar cabecera con controles secundarios).
2. Selector de modalidad: Acá / Llevar / Delivery en botones amplios. Icono + texto; el estado no se comunica solo por color.
3. Categorías: carrusel horizontal con icono de categoría de unos 28–32 px y rótulo corto. Categoría activa resaltada en rojo sin brillo/sombra fuerte.
4. Productos: cuadrícula de dos columnas; nombre y precio visibles; imagen ilustrativa pequeña y consistente, o solo icono cuando no hay imagen de producto.
5. Pedido compacto anclado sobre navegación inferior: cantidad total, importe final y acción primaria. Al tocarlo, se expande a hoja inferior con líneas, cantidades, extras, descuentos y acciones existentes.
6. Cobro: pantalla/hoja dedicada, total muy destacado, medio de pago, detalle si efectivo (recibido/vuelto) y confirmación explícita. Pago dividido no debe ocultarse ni simplificarse.

## Estados
- Vacío: invitación breve “Tocá un producto para empezar”.
- Pedido con líneas: contar unidades y mostrar total recalculado.
- Guardando/cobrando: deshabilitar acciones duplicadas y mostrar progreso.
- Sin conexión: aviso discreto pero inequívoco; no ocultar estado de cola.
- Caja cerrada: conservar las reglas actuales y mostrar aviso contextual si aplica.
- Error de impresión: informar con opción de reintento sin duplicar cobro.

## Componentes candidatos
`ThemeProvider/useTheme`, `AppThemeToggle`, `CategoryIcon`, `ChannelSelector`, `ProductCard`, `CartBottomSheet`, `CartSummaryBar`, `CheckoutSheet`. Extraer solo donde reduzca duplicación, sin reescribir todos los componentes durante la primera entrega.

## Principios de usabilidad
- Objetivos táctiles de 44–52 px según el control.
- Mantener controles principales en la zona inferior cómoda; no poner acciones destructivas cerca de Cobrar.
- Reducir separadores, no eliminar los que ayudan a agrupar.
- No usar color como único indicador de estado.
- Respetar safe areas, scroll independiente de catálogo y carrito, teclado virtual y pantallas de 320 px de ancho.
- Conservar la interacción de pulsación prolongada para variantes mientras no se pruebe una alternativa equivalente; añadir un indicador comprensible.
- No inventar productos/precios reales en la implementación; usar datos reales del catálogo y mocks sólo en las capturas de diseño.


## Estado del prototipo de trabajo
La rama `design/mobile-pos-retro-prototype` contiene un primer cableado de temas claro/oscuro/sistema, un selector de apariencia en el menú de usuario, iconos de categorías SVG servidos localmente y un carrito contraíble en móvil. Todavía requiere validación de build y pruebas reales en un dispositivo antes de considerarse listo.
