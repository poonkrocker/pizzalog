# Callbell Shop Extractor — discovery capture

Herramienta independiente de Pizzalog. Esta primera etapa identifica las respuestas JSON que el administrador de Callbell Shop carga en una sesión ya autenticada. No automatiza Google Login y no solicita contraseñas.

## Estado

**Etapa 1 — descubrimiento del API, no exportador final.** El formato interno de los productos y los endpoints todavía deben confirmarse con una captura real del administrador. No se deben presentar estos datos como una exportación completa hasta verificar paginación, productos ocultos y campos.

## Instalación del marcador en Chrome Android

1. Abrí este archivo en el repositorio y copiá el contenido de bookmarklet.txt.
2. En Chrome, agregá cualquier página a marcadores.
3. Editá ese marcador: nombre "Callbell - Capturar catálogo"; reemplazá la URL por el contenido de bookmarklet.txt.
4. Abrí Callbell Shop e iniciá sesión normalmente con Google.
5. Entrá al administrador y abrí la sección del catálogo.
6. Ejecutá el marcador desde el menú de marcadores.
7. Volvé a cargar el listado o navegá por sus páginas/categorías para que se produzcan nuevas llamadas de datos. El capturador solo ve respuestas cargadas después de activarlo.
8. Tocá "Descargar diagnóstico JSON".

## Seguridad y privacidad

- El script corre en la pestaña de Callbell.
- No lee ni exporta cookies, contraseñas, localStorage, sessionStorage ni encabezados de autenticación.
- No envía los datos a ningún servidor.
- Captura respuestas JSON de fetch y XMLHttpRequest de hasta 8 MiB cada una, con un máximo de 500 respuestas.
- El archivo puede contener información comercial o datos de clientes; revisalo antes de compartirlo.
- No captura archivos binarios ni respuestas HTML.
- Si Callbell bloquea scripts externos mediante Content Security Policy, el marcador no podrá cargar el archivo remoto; en ese caso prepararemos una variante autocontenida.

## Qué valida esta etapa

Con el JSON podremos identificar endpoints de listado y detalle, estructura de productos/categorías/variantes/fotos/visibilidad, paginación o carga incremental, y si los productos ocultos aparecen en las respuestas del administrador.

La etapa siguiente será un adaptador que normalice esos datos y genere CSV + JSON completos, con un resumen de registros y controles de integridad.
