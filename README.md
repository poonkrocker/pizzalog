# Pizzalog

Sistema **POS + gestión multi-tenant para pizzerías**, pensado como producto
SaaS, con la pizzería Arrabbiata (Córdoba) como primer local.

Este repositorio está estructurado para **deployarse con el Git de Ferozo**:
el hosting clona el repo en `/public_html/` y cada push se publica con la
acción de actualizar (pull) desde el panel de Ferozo. Sin FTP.

```
/                  La Carta compilada  → pizzalog.net/{slug}   (raíz del dominio)
├── app/           Panel compilado     → app.pizzalog.net      (subdominio → /public_html/app)
├── backend/       API PHP             → api.pizzalog.net      (subdominio → /public_html/backend/public)
│   ├── public/       único punto accesible por web
│   ├── config/       config.php local (gitignoreado, NO se pisa con los pulls)
│   ├── migrations/   correr en orden 000 → 010 (protegida por .htaccess)
│   └── tools/        reimportación de catálogo Loyverse (protegida)
└── frontend/      Código fuente React (protegido por .htaccess; se compila
                   en desarrollo y sus builds se comitean en / y /app)
```

## Flujo de publicación

1. Cambios en el código (backend o frontend fuente + builds regenerados).
2. `git add -A && git commit && git push`
3. En Ferozo → Mi Sitio Web → GIT → acción **actualizar/pull** del repositorio.
4. Listo: API, panel y carta quedan en la versión nueva.

> `backend/config/config.php` vive solo en el servidor (el `.gitignore` lo
> excluye), así que los pulls nunca tocan las credenciales.

## Qué hace

- **Catálogo** con variantes combinables (Tamaño × Masa…) y precio abierto.
- **Ventas (TPV)** táctil con cola offline idempotente, selector de canal
  (Acá / Llevar / Delivery) e impresión Bluetooth ESC/POS (ticket y comanda).
- **Salón** con mesas y **barras multi-cuenta** (cada cuenta con nombre), 
  comandas por ronda y vista de cocina.
- **La Carta** — perfil público estilo internet 2008 en `pizzalog.net/{slug}`:
  foto, bio, redes, teléfono, dirección con mapa, muro de productos y
  **temas de colores** personalizables desde el panel («Mi local»).
- **Abastecimiento** (proveedores, insumos, clientes), caja, empleados,
  analytics y facturación ARCA (modo simulado).

## Base de datos

Migraciones en `backend/migrations/`, correr **en orden (000 → 010)** en la
base del negocio. `backend/tools/reimport_loyverse_variantes.sql` recarga el
catálogo desde Loyverse con el modelo de variantes (una sola vez).

## Desarrollo local

```bash
cd frontend
pnpm install
pnpm --filter @pizzalog/panel dev    # panel en localhost:5173
pnpm --filter @pizzalog/pos dev      # TPV en localhost:5174
pnpm --filter @pizzalog/carta dev    # carta en localhost:5175
```

Para regenerar los deployables tras cambiar el frontend:
`pnpm --filter @pizzalog/panel build` → copiar `apps/panel/dist/*` a `/app`;
`pnpm --filter @pizzalog/carta build` → copiar `apps/carta/dist/*` a `/`
(index.html, assets, config.js). Los `.htaccess` de `/` y `/app` ya están
versionados y no hay que tocarlos.

La app TPV (Android) se genera aparte con Capacitor + Android Studio
(`npx cap add android`, `npx cap sync` dentro de `frontend/apps/pos`).

## Stack

PHP 8.1+ · MySQL · JWT · React 18 · TypeScript · Vite · pnpm ·
TanStack Query · Capacitor · Dexie · Konva.
