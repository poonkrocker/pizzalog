# Callbell Shop Extractor — discovery capture

Herramienta independiente de Pizzalog. Esta primera etapa identifica las respuestas JSON que el administrador de Callbell Shop carga en una sesión ya autenticada. No automatiza Google Login y no solicita contraseñas.

## Estado

**Etapa 1 — descubrimiento del API, no exportador final.** El formato interno de los productos y los endpoints todavía deben confirmarse con una captura real del administrador. No se deben presentar estos datos como una exportación completa hasta verificar paginación, productos ocultos y campos.

## Instalación del marcador en Chrome/Brave Android

1. Abrí este archivo en el repositorio y copiá el contenido de bookmarklet.txt.
2. En Chrome, agregá cualquier página a marcadores.
3. Editá ese marcador: nombre "Callbell - Capturar catálogo"; reemplazá la URL por el contenido completo de bookmarklet.txt. Esta versión ejecuta el código dentro del propio marcador; no depende de GitHub en tiempo de ejecución.
4. Abrí Callbell Shop e iniciá sesión normalmente con Google.
5. Entrá al administrador y abrí la sección del catálogo.
6. Ejecutá el marcador desde el menú de marcadores.
7. Usá la navegación interna de Callbell para volver a abrir el listado y recorrer sus páginas/categorías. El capturador solo ve respuestas cargadas después de activarlo. Como el listado inicial ya puede estar cargado, después de activar el marcador tocá las pestañas de categorías (Bebidas, Panchos, Pizzas), usá la búsqueda y abrí algunos productos para provocar nuevas consultas. No recargues la página completa: eso elimina el capturador y habría que ejecutarlo otra vez.
8. Tocá "Descargar diagnóstico JSON".

## Seguridad y privacidad

- El script corre en la pestaña de Callbell.
- No lee ni exporta cookies, contraseñas, localStorage, sessionStorage ni encabezados de autenticación.
- No envía los datos a ningún servidor.
- Captura respuestas JSON de fetch y XMLHttpRequest de hasta 8 MiB cada una, con un máximo de 500 respuestas; intenta reconocer JSON incluso si Callbell usa un content-type no estándar. Omite URLs que parezcan corresponder a autenticación, sesiones, clientes, conversaciones, mensajes, pedidos, pagos o perfiles.
- El archivo puede contener información comercial o datos de clientes; revisalo antes de compartirlo.
- No captura archivos binarios ni respuestas HTML.
- El marcador actual es autocontenido: no carga JavaScript remoto y evita el bloqueo de Content Security Policy que afectaba a la primera versión.

## Qué valida esta etapa

Con el JSON podremos identificar endpoints de listado y detalle, estructura de productos/categorías/variantes/fotos/visibilidad, paginación o carga incremental, y si los productos ocultos aparecen en las respuestas del administrador.

La etapa siguiente será un adaptador que normalice esos datos y genere CSV + JSON completos, con un resumen de registros y controles de integridad.


## Fallback de captura por DOM (versión 0.2.0)

La versión actual del bookmarklet ya no depende de observar respuestas de red. Lee las tarjetas de productos que están renderizadas en la pantalla del catálogo, acumula resultados sin duplicarlos y descarga un JSON local.

Flujo Android:
1. Reemplazá el marcador por el contenido actualizado de bookmarklet.txt.
2. Ejecutalo en el administrador.
3. Tocá "Capturar productos visibles".
4. Cambiá de categoría y repetí la captura; desplazate por el listado para mostrar más tarjetas y volvé a capturar.
5. Descargá JSON al terminar.

Esta estrategia captura únicamente la información visible en las tarjetas. No garantiza todavía descripciones completas ni ingredientes del detalle del producto, y no puede asegurar por sí sola que se hayan recorrido todos los productos. La siguiente iteración debe incorporar lectura del detalle y verificación de cobertura.
