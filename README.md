# Pizzalog

Sistema **POS + gestión multi-tenant para pizzerías**, pensado como producto
SaaS, con la pizzería Arrabbiata (Córdoba) como primer local.

Este repositorio reúne las dos mitades del sistema:

```
pizzalog/
├── backend/     API REST en PHP 8.1+ / MySQL (sin framework)
└── frontend/    Monorepo React + TypeScript (panel de gestión; TPV en camino)
```

Cada mitad tiene su propio README con el detalle de instalación y arquitectura:
- [`backend/README.md`](backend/README.md)
- [`frontend/README.md`](frontend/README.md)

---

## Qué hace

Cubre la operación completa de una pizzería:

- **Catálogo** — productos y categorías, con costo y extracción automática de
  ingredientes (diccionario local + IA opcional).
- **Ventas (TPV)** — con snapshot de precio, soporte offline por `client_uuid`,
  anulaciones y descuento de stock.
- **Caja** — apertura, movimientos, arqueo y cierre.
- **Delivery** — pedidos multicanal (mostrador, web, WhatsApp, PedidosYa,
  Rappi, teléfono), menú público y checkout por WhatsApp.
- **Salón** — áreas con croquis, mesas, cuentas con rondas/comandas,
  juntar/transferir/dividir, cobro, y vista de cocina (KDS).
- **Abastecimiento** — proveedores, insumos (consumibles no vendibles, con
  stock y movimientos) y clientes (CRM básico).
- **Operación** — empleados, asistencia por PIN, inventario.
- **Analytics** — resúmenes por canal, márgenes y ranking de ingredientes.
- **Fiscal** — facturación ARCA con múltiples emisores (hoy en modo simulado).

---

## Arquitectura en una mirada

**Backend** — PHP puro sobre MySQL, pensado para hosting compartido
(Ferozo/DonWeb). Router propio, JWT, multi-tenant por `business_id`. API REST
con respuestas `{ ok, data }`. El cobro (`sales`) es el punto donde convergen
todos los canales: mostrador, delivery y salón.

**Frontend** — monorepo con pnpm + Vite. Un paquete `shared` (cliente API,
tipos, auth, motor de sync offline) que consumen las apps. Hoy está el `panel`
de administración (React + TypeScript); la app `pos` (TPV con impresión
Bluetooth y cola de ventas offline) es el próximo paso. La modularidad es por
**registro de módulos**: cada feature declara sus rutas, su menú y sus roles.

```
Cliente (panel web / TPV)
        │  JWT Bearer
        ▼
  API REST (backend/public)
        │
        ▼
     MySQL
```

---

## Puesta en marcha rápida

### Backend
1. Importar `backend/migrations/` en orden (000 → 005) en MySQL.
2. Copiar `backend/config/config.example.php` a `config.php` y completar
   credenciales, `jwt.secret` y demás.
3. Apuntar el docroot del subdominio de la API a `backend/public/`.

Detalle completo (deploy en Ferozo, gotchas, endpoints): `backend/README.md`.

### Frontend
```bash
cd frontend
pnpm install
cp apps/panel/.env.example apps/panel/.env   # apuntar VITE_API_URL al backend
pnpm --filter @pizzalog/panel dev
```

Detalle completo: `frontend/README.md`.

---

## Estado del proyecto

| Parte | Estado |
|-------|--------|
| Backend — core (catálogo, ventas, caja, delivery, salón, operación, analytics) | ✅ |
| Backend — fiscal ARCA | ✅ esqueleto (modo simulado; integración real pendiente) |
| Backend — abastecimiento (proveedores, insumos, clientes) | ✅ |
| Frontend — `shared` (API, tipos, auth, sync) | ✅ |
| Frontend — `panel` (catálogo, ventas, salón, insumos, proveedores, clientes) | ✅ |
| Frontend — `pos` (app TPV) | ⏳ próximo |
| Menú QR de solo lectura | ⏳ pendiente (el backend ya sirve la carta) |
| Integración real con ARCA | ⏳ pendiente (requiere certificado y librería WSFEv1) |

---

## Subir a GitHub

Desde la raíz de este directorio:

```bash
git init
git add .
git commit -m "Pizzalog: backend + panel"
git branch -M main
git remote add origin git@github.com:<usuario>/pizzalog.git
git push -u origin main
```

> **Importante:** antes del primer push, verificá con `git status` que
> `backend/config/config.php` **no** esté en la lista. El `.gitignore` ya lo
> excluye, pero conviene chequearlo para no filtrar credenciales ni el
> `jwt.secret`.

---

## Stack

PHP 8.1+ · MySQL · JWT · React 18 · TypeScript · Vite · pnpm ·
TanStack Query · React Router · Konva (editor de croquis).
