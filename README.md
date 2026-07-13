# Pizzalog

Sistema **POS + gestión multi-tenant para pizzerías**, pensado como producto
SaaS, con la pizzería Arrabbiata (Córdoba) como primer local.

```
pizzalog/
├── backend/     API REST en PHP 8.1+ / MySQL (sin framework)
│   └── tools/   scripts de datos (re-importación de catálogo Loyverse)
└── frontend/    Monorepo React + TypeScript (panel de gestión + app TPV)
```

Cada mitad tiene su README con el detalle:
- [`backend/README.md`](backend/README.md)
- [`frontend/README.md`](frontend/README.md)

---

## Qué hace

- **Catálogo** — productos y categorías, con costo e ingredientes.
- **Variantes** — opciones combinables (Tamaño × Masa…) que generan variantes
  con su propio precio, más productos de **precio abierto** (se ingresa al vender).
- **Ventas (TPV)** — mostrador táctil con **cola offline** (idempotente por
  `client_uuid`): si se corta internet, la venta se guarda y se envía al volver.
  Vende variantes (selector) y precio abierto (teclado). Selector de canal
  siempre a la vista: **Acá** (va a una cuenta del salón), **Llevar** y
  **Delivery** (se cobran al momento y quedan distinguidos en los reportes).
  **Impresión Bluetooth (ESC/POS)** a comandera térmica: ticket al cobrar y
  comanda al enviar a cuenta, con pantalla de Ajustes (impresora, papel,
  automáticos y prueba).
- **Salón** — plano de mesas **y barras**: una barra admite varias cuentas
  abiertas a la vez, cada una con nombre y cantidad de personas propia.
  Comandas por ronda, cobro y vista de cocina (KDS).
- **Delivery** — pedidos multicanal, menú público y checkout por WhatsApp.
- **La Carta (QR)** — perfil público mobile-first con estética internet 2008
  en `pizzalog.net/{slug}` (como los fotologs): foto de perfil, bio, redes,
  teléfono y dirección con mapa; debajo, la grilla de productos donde cada
  uno es una entrada y sus variantes, los comentarios. El slug se administra
  desde el panel («Mi local»), donde también se personalizan los colores y
  el patrón de fondo de la carta, con vista previa.
- **Abastecimiento** — proveedores, insumos y clientes (CRM básico).
- **Caja, inventario, empleados, analytics y facturación** (ARCA, modo simulado).

---

## Arquitectura

**Backend** — PHP puro sobre MySQL, para hosting compartido (Ferozo/DonWeb).
Router propio, JWT, multi-tenant por `business_id`. El cobro (`sales`) es el
punto donde convergen mostrador, delivery y salón.

**Frontend** — monorepo pnpm + Vite. Un paquete `shared` (cliente API, tipos,
auth, motor de sync offline) que consumen las apps: `panel` (administración web)
y `pos` (TPV táctil con Capacitor, cola offline e impresión Bluetooth).

```
  panel (web)        pos / TPV (Android vía Capacitor)
       \                   /
        \   JWT Bearer     /
         ▼                ▼
        API REST (backend/public)  ──►  MySQL
```

---

## Puesta en marcha

### Backend
1. Importar `backend/migrations/` **en orden (000 → 010)** en MySQL.
2. Copiar `backend/config/config.example.php` a `config.php` y completar.
3. Apuntar el docroot del subdominio de la API a `backend/public/`.

(Opcional) `backend/tools/reimport_loyverse_variantes.sql` carga el catálogo
exportado de Loyverse **con el modelo de variantes** (requiere la migración
006 aplicada; borra y recrea el catálogo del negocio 1 — correr una sola vez).

### Frontend (panel, en tu compu)
```bash
cd frontend
pnpm install
cp apps/panel/.env.example apps/panel/.env   # VITE_API_URL = tu backend
pnpm --filter @pizzalog/panel dev
```

Para producción por FTP: `pnpm --filter @pizzalog/panel build` genera
`apps/panel/dist/`; se sube su contenido junto con un `.htaccess` de SPA.
La URL del backend se puede cambiar sin recompilar editando `config.js`.

### La Carta (perfil público + menú QR)
```bash
pnpm --filter @pizzalog/carta build   # genera apps/carta/dist para subir por FTP
```
Se sube al **docroot de pizzalog.net** (con su `.htaccess`): cada local vive
en `pizzalog.net/{slug}`. En el servidor se edita `config.js` (apiUrl y el
slug al que redirige la raíz) sin recompilar. El slug y el perfil se editan
en el panel, sección **Mi local**.

### App TPV (pos)
Se desarrolla igual (`pnpm --filter @pizzalog/pos dev` para verla en el
navegador). Para generar el APK de Android se usa Android Studio:
`npx cap add android` y `npx cap sync` dentro de `apps/pos`.

---

## Estado del proyecto

| Parte | Estado |
|-------|--------|
| Backend — core (catálogo, ventas, caja, delivery, salón, operación, analytics) | ✅ |
| Backend — abastecimiento (proveedores, insumos, clientes) | ✅ |
| Backend — variantes combinables y precio abierto | ✅ |
| Backend — barras con varias cuentas (migración 007) | ✅ |
| Backend — fiscal ARCA | ✅ esqueleto (modo simulado) |
| Frontend — `shared` (API, tipos, auth, sync) | ✅ |
| Frontend — `panel` (catálogo con variantes, salón con barras, insumos, proveedores, clientes) | ✅ |
| Frontend — `panel` responsive móvil (sidebar vertical, tablas como tarjetas) | ✅ |
| Frontend — `pos` / TPV (venta con variantes y precio abierto, cola offline, salón con barras, cocina) | ✅ |
| Frontend — `pos` — selector de canal (acá / llevar / delivery) | ✅ |
| Frontend — `carta` — perfil público en `/{slug}` + menú QR (estética 2008) | ✅ (falta cargar fotos y datos del perfil) |
| Frontend — `panel` — «Mi local» (perfil, slug de la URL y tema de la carta con vista previa) | ✅ |
| Frontend — `pos` — impresión Bluetooth (ESC/POS): tickets, comandas, ajustes | 🔶 lista para probar con la impresora real |
| Integración real con ARCA | ⏳ pendiente |

---

## Subir cambios a GitHub

Desde la raíz del proyecto:

```bash
git add .
git commit -m "Actualización"
git push
```

> Antes del primer push, verificá con `git status` que
> `backend/config/config.php` **no** aparezca (el `.gitignore` ya lo excluye).

---

## Stack

PHP 8.1+ · MySQL · JWT · React 18 · TypeScript · Vite · pnpm ·
TanStack Query · React Router · Capacitor · Dexie · Konva.
