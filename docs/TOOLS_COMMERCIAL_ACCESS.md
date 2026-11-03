# Pizzalog Tools — acceso comercial inicial

Tools se distribuye como producto pago y no ofrece registro público. Cada comprador recibe una cuenta habilitada manualmente.

## Despliegue

1. Ejecutar una sola vez `backend/migrations/migration_031_tools_accounts_workspace.sql` sobre la base de datos de la API.
2. Publicar el frontend de `frontend/apps/tools` con `VITE_API_URL` apuntando a la API de Pizzalog (por defecto: `https://api.pizzalog.net`).
3. La API debe tener configurada la credencial DeepSeek en el entorno PHP mediante `PIZZALOG_DEEPSEEK_API_KEY` o en la configuración server-side existente. La credencial nunca se envía al navegador.
4. El origen de Tools debe ser un subdominio de `pizzalog.net` o estar incluido en la lista CORS permitida.

## Alta manual de comprador

Un administrador de Pizzalog App puede habilitar o renovar una cuenta mediante:

```http
POST /tools/admin/accounts
Authorization: Bearer <JWT de administrador de Pizzalog App>
Content-Type: application/json
```

```json
{
  "email": "comprador@example.com",
  "name": "Nombre del comprador",
  "password": "una-contraseña-inicial-de-12-o-más-caracteres",
  "expires_at": "2027-11-03 23:59:59"
}
```

- `expires_at` es opcional; si se omite o es `null`, el acceso no tiene vencimiento automático.
- Repetir el alta para el mismo email actualiza la contraseña, reactiva la cuenta y actualiza su vencimiento.
- No hay endpoint de registro público ni de checkout en esta primera entrega.

## Seguridad y límites del importador

- Login de Tools usa una identidad separada de los usuarios operativos de App.
- Todos los endpoints de workspace e importación requieren JWT con audiencia `pizzalog-tools` y validan la cuenta activa y su vencimiento.
- El login limita a 10 intentos por combinación de email/IP cada 15 minutos; solo se almacenan hashes de email e IP.
- El workspace queda aislado por `tools_account_id`; no se guarda en `localStorage`.
- El parser del navegador solo lee valores; no ejecuta macros ni fórmulas.
- Archivos: XLSX/CSV, hasta 8 MB, 5 hojas, 500 filas, 25 columnas y 250 caracteres por celda.
- La previsualización IA requiere sesión y tiene un límite de 20 solicitudes diarias por cuenta.
- DeepSeek propone exclusivamente el mapeo de columnas. La aplicación normaliza y valida los valores de forma determinística; la persona revisa la vista previa y confirma antes de incorporar datos.
- La importación no inserta datos en la base operativa de App.

## Endpoints de Tools

- `POST /tools/auth/login`
- `GET /tools/auth/me`
- `GET /tools/workspace`
- `PUT /tools/workspace`
- `POST /tools/import/preview`
- `POST /tools/admin/accounts` (requiere administrador de App)

## Cost Engine compartido

- Restaurant Profit Kit y Recipe Studio construyen el mismo contrato `CostCatalog` y calculan lotes, costo unitario y precio sugerido con `@pizzalog/cost-engine`.
- `RecipeCostingController` entrega recetas, componentes e insumos; ya no calcula costos ni precios en PHP.
- Al guardar una receta, el panel envía snapshots calculados por Cost Engine. La API solo valida y persiste la proyección en `products.cost`; no vuelve a calcular.
- Si una receta tiene costos faltantes o unidades no soportadas, se muestra como incompleta. No se convierte un costo ausente en cero ni se infieren equivalencias para unidades como `porción` o `bandeja`.
- El backend conserva la expansión de ingredientes como proyección operativa para el catálogo legado; esa rutina no calcula costos ni precios.
