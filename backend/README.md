# Pizzalog API

API REST del sistema **Pizzalog**: TPV + administración multi-tenant para
pizzerías (pensado como producto SaaS, con Arrabbiata como primer local).

PHP 8.1+ puro, sin framework ni dependencias de Composer. Pensado para correr
en hosting compartido (Ferozo/DonWeb) sobre MySQL/MariaDB.

---

## Qué incluye

El backend cubre el núcleo completo de operación de una pizzería:

- **Auth** — login con JWT (HS256), roles `admin` / `manager` / `cashier` / `kitchen`.
- **Catálogo** — categorías y productos, con costo y extracción automática de
  ingredientes (diccionario local + DeepSeek opcional como fallback).
- **Ventas (TPV)** — ventas con snapshot de precio, soporte offline por
  `client_uuid`, anulaciones y descuento de stock.
- **Caja** — apertura, movimientos, arqueo y cierre.
- **Delivery** — pedidos multicanal (mostrador, web, WhatsApp, PedidosYa,
  Rappi, teléfono) con ciclo de estados, menú público y checkout por WhatsApp.
- **Salón** — áreas con croquis, mesas posicionadas, cuentas de mesa con
  rondas/comandas, juntar/transferir/dividir, cobro y vista de cocina (KDS).
- **Operación** — empleados, asistencia por PIN, inventario con alertas.
- **Variantes** — opciones combinables (Tamaño × Masa…) que generan variantes
  con su propio precio, más productos de precio abierto (se ingresa al vender).
- **Perfil del negocio** — `GET/PUT /business`: nombre, slug (la URL pública
  `pizzalog.net/{slug}`), descripción, foto, redes, coordenadas del mapa y
  **tema de la carta** (colores hex y patrón validados, estilo Fotolog).
- **Canales del TPV** — la venta acepta y valida el canal (`counter`,
  `takeaway`, `delivery`, apps…), que queda registrado para los reportes.
- **Barras** — lugares tipo `bar` que admiten varias cuentas abiertas a la vez
  (cada cuenta con nombre y cantidad de personas propia); el plano informa
  `open_count` por barra. Las mesas conservan el comportamiento clásico.
- **Abastecimiento** — proveedores, insumos (consumibles no vendibles, con
  su propio stock y movimientos) y clientes (CRM básico para delivery).
- **Analytics** — resúmenes por canal, top de productos, márgenes y el
  ranking de ingredientes (el diferencial del producto).
- **Fiscal** — facturación electrónica ARCA con múltiples emisores
  (monotributo), hoy en modo `stub`; la integración real queda lista para
  enchufar (ver más abajo).

---

## Estructura

```
pizzalog-api/
├── public/                 <- docroot del subdominio api.pizzalog.net
│   ├── index.php           <- front controller + todas las rutas
│   └── .htaccess           <- rewrite + pase del header Authorization
├── src/
│   ├── Core/               <- Router, Request, Response, Database, Jwt, Auth, Cors, Config, Text
│   ├── Controllers/        <- un controlador por módulo
│   ├── Services/           <- SaleService, OrderService, TableCheckoutService
│   ├── Repositories/       <- acceso a datos por dominio
│   ├── Ingredients/        <- motor de extracción de ingredientes
│   └── Fiscal/             <- servicio fiscal (stub + esqueleto ARCA)
├── migrations/             <- SQL en orden: 000 (base) → 004 (salón)
├── config/
│   ├── config.php          <- credenciales reales (NO va al repo)
│   ├── config.example.php
│   └── .htaccess           <- bloquea acceso web a la config
├── bootstrap.php           <- autoloader, config, CORS, errores, DB
└── .gitignore
```

Regla de oro: **el docroot apunta a `public/`**. Todo el código sensible
(config, src, bootstrap) queda fuera del alcance web.

---

## Instalación en Ferozo / DonWeb

### 1. Subdominio y PHP
Creá `api.pizzalog.net` y apuntá su carpeta raíz a `.../pizzalog-api/public`.
Si el panel no deja elegir una subcarpeta como raíz, subí el contenido de
`public/` a la raíz del subdominio y el resto (`src/`, `config/`,
`bootstrap.php`, `migrations/`) un nivel por encima, y ajustá en `index.php`
el `require` de `bootstrap.php`. Fijá **PHP 8.1 o superior** para el subdominio.

### 2. Base de datos
Importá los archivos de `migrations/` **en orden** desde phpMyAdmin:

```
migration_000_schema_base.sql   <- tablas base (businesses, users, products, sales, ...)
migration_001_costos_ingredientes.sql
migration_002_pedidos.sql        <- OBLIGATORIA: las ventas usan 'channel'
migration_003_facturacion.sql
migration_004_salon.sql
migration_005_abastecimiento.sql   <- proveedores, insumos, clientes
migration_006_variantes.sql        <- opciones combinables, variantes, precio abierto
migration_007_barras.sql           <- barras (varias cuentas por lugar) y nombre de cuenta
migration_008_canales_tpv.sql      <- canales de venta del TPV: para llevar y delivery
migration_009_perfil_negocio.sql   <- perfil público: foto, bio, redes, ubicación
migration_010_tema_carta.sql       <- tema de la carta: colores y patrón por negocio
```

> El orden importa: las migraciones 001–004 hacen `ALTER`/`CREATE` que dependen
> de las tablas base. No saltees la 002.

### 3. Configuración
Copiá `config/config.example.php` a `config/config.php` y completá:

- **`db`** — host (`localhost`), nombre de base y usuario de Ferozo, y la
  password real.
- **`jwt.secret`** — generá uno propio:
  ```
  php -r "echo bin2hex(random_bytes(32));"
  ```
- **`deepseek.api_key`** — opcional. Vacío = la extracción de ingredientes usa
  solo el diccionario local (gratis). Con clave, usa DeepSeek como fallback.
- **`fiscal.driver`** — `stub` para desarrollo (simula la emisión sin tocar
  ARCA). Dejalo en `stub` hasta tener la integración real.

### 4. Usuario admin
El seed del esquema base deja un usuario con hash de ejemplo. Generá el real
y actualizalo:

```
php -r "echo password_hash('TU_CLAVE', PASSWORD_DEFAULT), PHP_EOL;"
```
```sql
UPDATE users SET password_hash = '<<hash>>' WHERE email = 'eze@arrabbiata.com.ar';
```

---

## Probar

```bash
# Salud del servicio
curl https://api.pizzalog.net/

# Login (devuelve el token)
curl -X POST https://api.pizzalog.net/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"eze@arrabbiata.com.ar","password":"TU_CLAVE"}'

# Validar sesión
curl https://api.pizzalog.net/auth/me \
  -H "Authorization: Bearer EL_TOKEN"
```

---

## Mapa de endpoints

Todos bajo `https://api.pizzalog.net`. Salvo los públicos, requieren
`Authorization: Bearer <token>`.

| Módulo       | Rutas principales |
|--------------|-------------------|
| Auth         | `POST /auth/login`, `GET /auth/me` |
| Categorías   | `GET/POST /categories`, `GET/PUT/DELETE /categories/{id}` |
| Productos    | `GET/POST /products`, `GET/PUT/DELETE /products/{id}`, `POST /products/preview-ingredients` |
| Ventas       | `GET/POST /sales`, `GET /sales/{id}`, `POST /sales/{id}/cancel` |
| Caja         | `POST /cash/open`, `GET /cash/current`, `POST /cash/movement`, `POST /cash/close`, `GET /cash` |
| Inventario   | `GET /inventory/stock`, `GET /inventory/low-stock`, `GET /inventory/movements`, `POST /inventory/restock`, `POST /inventory/adjustment`, `POST /inventory/count` |
| Empleados    | `GET/POST /users`, `GET/PUT/DELETE /users/{id}` (admin) |
| Asistencia   | `POST /attendance/punch`, `GET /attendance`, `GET /attendance/open`, `GET /attendance/summary` |
| Delivery     | `GET/POST /orders`, `GET /orders/{id}`, `PUT /orders/{id}/status`, `POST /orders/{id}/complete`, `POST /orders/{id}/cancel` |
| Menú público | `GET /public/{slug}/menu`, `POST /public/{slug}/orders` (sin auth) |
| Salón · config | `GET/POST /table-areas`, `PUT/DELETE /table-areas/{id}`, `GET /floor`, `GET/POST /tables`, `PUT /tables/layout`, `GET/PUT/DELETE /tables/{id}` |
| Salón · cuentas | `GET/POST /table-sessions`, `GET /table-sessions/{id}`, `POST /table-sessions/{id}/rounds`, `POST /table-sessions/{id}/request-bill`, `PUT /table-sessions/{id}/tables`, `POST /table-sessions/{id}/merge`, `POST /table-sessions/{id}/close`, `POST /table-sessions/{id}/cancel`, `DELETE /table-sessions/{id}/items/{itemId}` |
| Cocina (KDS) | `GET /kitchen/rounds`, `PUT /kitchen/rounds/{id}/status`, `POST /kitchen/rounds/{id}/print` |
| Variantes    | `GET /products/{id}/variants`, `PUT /products/{id}/options`, `PUT /products/{id}/variants` |
| Proveedores  | `GET/POST /suppliers`, `GET/PUT/DELETE /suppliers/{id}` |
| Insumos      | `GET/POST /supplies`, `GET /supplies/low-stock`, `GET/PUT/DELETE /supplies/{id}`, `GET /supplies/{id}/movements`, `POST /supplies/{id}/movement` |
| Clientes     | `GET/POST /customers`, `GET/PUT/DELETE /customers/{id}` |
| Analytics    | `GET /analytics/summary`, `/top-products`, `/product-margins`, `/ingredients`, `/sales-over-time` |
| Fiscal       | `GET/POST /fiscal/issuers`, `GET/PUT/DELETE /fiscal/issuers/{id}`, `POST/GET /fiscal/invoices`, `GET /fiscal/invoices/{id}`, `POST /fiscal/invoices/{id}/retry`, `GET /fiscal/summary` |

---

## Formato de respuestas

```jsonc
// éxito
{ "ok": true,  "data": { ... } }
// error
{ "ok": false, "error": "mensaje legible" }
```

---

## Notas de diseño

- **Multi-tenant.** El token lleva `business_id`. Todo endpoint filtra SIEMPRE
  por `$req->auth['business_id']` para aislar a cada local.
- **Stateless.** No hay sesiones de servidor: el JWT viaja en cada request.
  Sirve igual para el panel web y la app Android (Capacitor).
- **Snapshots.** Ventas y comandas guardan copia del nombre y precio del
  producto: cambiar o borrar un producto no altera los tickets viejos.
- **El cobro es el punto de unión.** Mostrador, delivery y salón tienen flujos
  distintos pero los tres terminan en una venta (`sales`), con su `channel`.
  Por eso analytics separa los canales sin lógica extra.
- **Seguridad.** Credenciales fuera del docroot y del repo; password y PIN con
  `password_hash`; mensajes de login genéricos.

### Gotchas de Ferozo/DonWeb
- **Header Authorization.** Apache en hosting compartido suele descartarlo; el
  `.htaccess` de `public/` lo reinyecta. Si el login da 401 con token válido,
  revisá que ese `.htaccess` esté presente.
- **Zona horaria.** `bootstrap.php` fija `America/Argentina/Cordoba` y la DB
  usa `-03:00`. No dependas de la hora del servidor.
- **mod_headers.** Puede no estar disponible; el código no depende de él.

---

## Estado y pendientes

- **ARCA real.** `src/Fiscal/ArcaFiscalService.php` tiene el flujo marcado
  (WSAA → WSFEv1) pero lanza "pendiente". Para activarlo: tramitar el
  certificado, dar de alta el punto de venta, enchufar una librería WSFEv1 y
  pasar `fiscal.driver` a `arca`. Probar primero contra homologación.
- **División en partes iguales.** Hoy la división de cuenta es por ítems
  (genera ventas reales, stock y analytics correctos). Partir por monto igual
  es un tema de cobro: se resuelve en el panel o con un módulo de pagos futuro.
- **Frontend.** Panel de administración + app TPV (Capacitor) con impresión
  Bluetooth (ESC/POS) y capa offline. Próximo gran paso.
