# Entorno staging de Pizzalog App (Ferozo)

Este procedimiento separa completamente el panel de pruebas de la API y la base de datos de producción.

## Arquitectura esperada

| Componente | Producción | Staging |
|---|---|---|
| Panel | `app.pizzalog.net` | `app-staging.pizzalog.net` |
| API | `api.pizzalog.net` | `api-staging.pizzalog.net` |
| Base MySQL | `a0140456_app` | `a0140456_staging` |

**No apuntar la API de staging a producción.** La configuración pública `app/config.js` selecciona la API de staging únicamente cuando el hostname es exactamente `app-staging.pizzalog.net`; los demás hostnames usan producción.

## 1. Crear el subdominio en Ferozo

Crear `api-staging.pizzalog.net` y asignarle como directorio raíz (document root):

```text
/public_html/staging/app-test/backend/public
```

Esta ruta corresponde al clon del repositorio que ya está ubicado en `/public_html/staging/app-test` (confirmar el nombre real de la carpeta en el Administrador de archivos antes de guardar).

Activar PHP 8.1 o superior y emitir/activar SSL para `api-staging.pizzalog.net`.

### DNS

El subdominio debe tener un registro DNS válido (normalmente un A hacia la IP del hosting o el mecanismo automático de Ferozo). Esperar la propagación. Si el navegador devuelve `DNS_PROBE_FINISHED_NXDOMAIN`, todavía no existe/resuelve el registro: no es un error PHP ni CORS.

## 2. Crear la configuración privada de la API de staging

En el servidor, crear manualmente:

```text
/public_html/staging/app-test/backend/config/config.local.php
```

Este archivo **no se versiona** (`.gitignore` lo excluye). No copiar las credenciales de producción. Usar las credenciales MySQL de la base `a0140456_staging` y un JWT secret independiente y aleatorio.

Plantilla orientativa (completar en el servidor; nunca subir valores reales a GitHub):

```php
<?php
return [
    'debug' => false,
    'db' => [
        'host' => 'localhost',
        'name' => 'a0140456_staging',
        'user' => 'USUARIO_MYSQL_STAGING',
        'pass' => 'PASSWORD_MYSQL_STAGING',
        'charset' => 'utf8mb4',
    ],
    'jwt' => [
        'secret' => 'REEMPLAZAR_POR_UN_SECRET_ALEATORIO_NUEVO_DE_64_HEX',
        'issuer' => 'pizzalog-staging',
        'ttl' => 28800,
    ],
    'deepseek' => [
        'api_key' => '',
        'base_url' => 'https://api.deepseek.com/chat/completions',
        'model' => 'deepseek-v4-flash',
        'timeout' => 8,
    ],
    'fiscal' => ['driver' => 'stub'],
    'cors' => [
        'allowed_origins' => [
            'https://app-staging.pizzalog.net',
        ],
    ],
];
```

El bootstrap admite `config.local.php` incluso si no existe `config.php`. La configuración privada debe estar dentro de `backend/config/`, que está bloqueada por `.htaccess`.

## 3. Publicar el código

El subdominio debe apuntar al clon de staging, no al directorio de producción. Actualizar/pull de la rama que contenga este cambio en el repositorio ubicado en `/public_html/staging/app-test`.

No cambiar el document root de `api.pizzalog.net` ni el de `app.pizzalog.net`.

## 4. Pruebas de humo

Primero comprobar DNS y SSL:

```bash
curl -i https://api-staging.pizzalog.net/
```

Resultado esperado: HTTP 200 y JSON con `service=pizzalog-api`, `status=up`. Este endpoint arranca el bootstrap y conecta a MySQL; por tanto, si la configuración o DB no funcionan, no debe considerarse saludable.

Comprobar que el preflight CORS permite el origen del panel:

```bash
curl -i -X OPTIONS 'https://api-staging.pizzalog.net/auth/login' \
  -H 'Origin: https://app-staging.pizzalog.net' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

Esperado: HTTP 204 y `Access-Control-Allow-Origin: https://app-staging.pizzalog.net`.

Comprobar login (usar credenciales de prueba de staging; nunca pegar la contraseña en tickets/logs):

```bash
curl -i -X POST 'https://api-staging.pizzalog.net/auth/login' \
  -H 'Origin: https://app-staging.pizzalog.net' \
  -H 'Content-Type: application/json' \
  --data '{"email":"USUARIO_STAGING","password":"PASSWORD_STAGING"}'
```

Esperado: HTTP 200 con `ok: true` y token, o un error de credenciales (401/422) en JSON. Un 404 indica que el despliegue/routing no corresponde al código esperado.

Finalmente, entrar a `https://app-staging.pizzalog.net/login` y verificar en el navegador que las peticiones van a `api-staging.pizzalog.net`.

## 5. Criterios de aislamiento antes de probar escrituras

- La API staging debe conectar a `a0140456_staging`, nunca a `a0140456_app`.
- Usar un JWT secret distinto del de producción.
- Confirmar el host de API en `app-staging.pizzalog.net/config.js`.
- No probar ventas, importaciones ni cambios de catálogo hasta confirmar los tres puntos anteriores.
- No ejecutar migraciones en producción como parte de esta configuración.

## Qué no puede hacer GitHub

GitHub puede versionar la selección de URL y esta guía, pero no puede crear el subdominio, cambiar el document root, crear DNS/SSL ni escribir el archivo privado `config.local.php` en Ferozo. Esos pasos requieren el panel/administrador de archivos del hosting.
