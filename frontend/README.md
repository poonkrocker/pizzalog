# Pizzalog Frontend

Monorepo del frontend de Pizzalog. React + TypeScript, gestionado con
**pnpm workspaces** y construido con **Vite**.

## Estructura

```
pizzalog/
├── packages/
│   └── shared/          ← núcleo reutilizable (sin React, TS puro)
│       └── src/
│           ├── api/     ← wrapper fetch + un módulo por dominio (espeja el backend)
│           ├── types/   ← tipos de las entidades
│           ├── auth/    ← token, sesión y storage abstracto
│           ├── sync/    ← outbox para el reenvío offline de ventas
│           ├── utils/   ← formato ARS, fechas, uuid
│           └── ui/      ← tokens de marca
└── apps/                ← (próximo) panel/ y pos/
    ├── panel/           ← administración web
    └── pos/             ← app TPV (Capacitor) con impresión Bluetooth
```

El paquete `shared` no depende de React: es lógica y tipos que consumen las
dos apps. El panel evita así cargar dependencias de Capacitor, y ambas
comparten una sola fuente para la API, los tipos y la autenticación.

## Principio de modularidad

Cada app organiza sus features por **dominio** (no por tipo técnico): una
carpeta autocontenida en `modules/` con sus vistas, componentes, estado y
llamadas. Un **registro de módulos** declara, por feature, sus rutas, su
entrada de menú y los roles que la ven; ese registro alimenta el router, la
navegación y los permisos. Sumar un feature (olvidado o nuevo) es crear su
carpeta y agregar una línea al registro.

## La capa `shared`

- **`api`** — `createApi({ baseUrl, getToken, onUnauthorized })` devuelve una
  fachada con un módulo por dominio (`auth`, `products`, `sales`, `tables`,
  `kitchen`, …). El cliente centraliza el Bearer token, el formato
  `{ ok, data }` y el 401. Agregar un dominio = un archivo + una línea.
- **`auth`** — `decodeToken` / `isTokenExpired` para UI y permisos; el token
  se guarda vía `TokenStorage` (web usa `localStorage`; el TPV inyecta su
  almacenamiento seguro de Capacitor).
- **`sync`** — `Outbox`: cola de operaciones para el TPV. Hoy se usa solo para
  ventas: si el cobro ocurre sin red, se encola y se reenvía al reconectar,
  sin duplicar gracias al `client_uuid` (idempotencia ya soportada por el
  backend). La persistencia es abstracta (`OutboxStorage`): el TPV la
  implementa sobre IndexedDB.
- **`utils`** — `formatARS`, `formatDateTime`, `uuid` (genera el `client_uuid`).
- **`ui`** — tokens de marca (colores, tipografías). Ajustar los hex a los
  valores exactos de `arrabbiata.css` al integrar.

## Requisitos y comandos

Requiere Node 18+ y pnpm 9+.

```bash
pnpm install         # instala todo el workspace
pnpm typecheck       # chequeo de tipos de todos los paquetes
pnpm format          # prettier
```

## Estado

- [x] Scaffolding del monorepo + paquete `shared`
- [x] App `panel`: base con login, registro de módulos (router + navegación +
      permisos por rol) y módulo de Resumen. Falta sumar los módulos de gestión.
- [ ] App `pos` (TPV con impresión Bluetooth y cola de ventas offline)

`shared` y `panel` compilan sin errores de tipos y el panel buildea con Vite.
Pendiente para la UI: agregar el `.woff2` de Alberdini en `apps/panel/public/fonts/`.
