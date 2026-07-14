<?php
/**
 * Punto de entrada único de la API (front controller).
 * Todas las peticiones pasan por acá vía el .htaccess.
 */
declare(strict_types=1);

use Pizzalog\Core\Auth;
use Pizzalog\Core\Request;
use Pizzalog\Core\Router;
use Pizzalog\Controllers\AnalyticsController;
use Pizzalog\Controllers\AttendanceController;
use Pizzalog\Controllers\CashController;
use Pizzalog\Controllers\ComboController;
use Pizzalog\Controllers\InventoryController;
use Pizzalog\Controllers\KitchenController;
use Pizzalog\Controllers\OrderController;
use Pizzalog\Controllers\PublicController;
use Pizzalog\Controllers\AuthController;
use Pizzalog\Controllers\CategoryController;
use Pizzalog\Controllers\CustomerController;
use Pizzalog\Controllers\FiscalController;
use Pizzalog\Controllers\SupplierController;
use Pizzalog\Controllers\SupplyController;
use Pizzalog\Controllers\VariantController;
use Pizzalog\Controllers\BusinessController;
use Pizzalog\Controllers\UploadController;
use Pizzalog\Controllers\ProductController;
use Pizzalog\Controllers\SaleController;
use Pizzalog\Controllers\TableAreaController;
use Pizzalog\Controllers\TableController;
use Pizzalog\Controllers\TableSessionController;
use Pizzalog\Controllers\UserController;

require dirname(__DIR__) . '/bootstrap.php';

$router = new Router();
$auth   = Auth::authenticate();
$manage = Auth::requireRole(['admin', 'manager']);  // crear/editar/borrar catálogo
$admin  = Auth::requireRole(['admin']);             // gestión de empleados

// --- Salud ------------------------------------------------------------
$router->get('/', fn() => \Pizzalog\Core\Response::ok(['service' => 'pizzalog-api', 'status' => 'up']));

// --- Autenticación ----------------------------------------------------
$router->post('/auth/login', [AuthController::class, 'login']);
$router->get('/auth/me', [AuthController::class, 'me'], [$auth]);

// --- Categorías -------------------------------------------------------
$router->get('/categories', [CategoryController::class, 'index'], [$auth]);
$router->get('/categories/{id}', [CategoryController::class, 'show'], [$auth]);
$router->post('/categories', [CategoryController::class, 'store'], [$auth, $manage]);
$router->put('/categories/{id}', [CategoryController::class, 'update'], [$auth, $manage]);
$router->delete('/categories/{id}', [CategoryController::class, 'destroy'], [$auth, $manage]);

// --- Productos --------------------------------------------------------
// Lectura: cualquier usuario autenticado. Escritura: admin o manager.
$router->post('/products/preview-ingredients', [ProductController::class, 'previewIngredients'], [$auth]);
$router->post('/uploads/image', [UploadController::class, 'image'], [$auth, $manage]);

$router->get('/business', [BusinessController::class, 'show'], [$auth]);
$router->put('/business', [BusinessController::class, 'update'], [$auth, $admin]);
// Horarios de atención y redes: reemplazo total en cada PUT.
$router->get('/business/hours', [BusinessController::class, 'hours'], [$auth]);
$router->put('/business/hours', [BusinessController::class, 'updateHours'], [$auth, $manage]);
$router->get('/business/social-links', [BusinessController::class, 'socialLinks'], [$auth]);
$router->put('/business/social-links', [BusinessController::class, 'updateSocialLinks'], [$auth, $manage]);

$router->get('/products', [ProductController::class, 'index'], [$auth]);
// 'reorder' va antes de '{id}' para que no lo capture como id.
$router->put('/products/reorder', [ProductController::class, 'reorder'], [$auth, $manage]);
$router->get('/products/{id}', [ProductController::class, 'show'], [$auth]);
$router->post('/products', [ProductController::class, 'store'], [$auth, $manage]);
$router->put('/products/{id}', [ProductController::class, 'update'], [$auth, $manage]);
$router->delete('/products/{id}', [ProductController::class, 'destroy'], [$auth, $manage]);
$router->get('/products/{id}/variants', [VariantController::class, 'show'], [$auth]);
$router->put('/products/{id}/options', [VariantController::class, 'setOptions'], [$auth, $manage]);
$router->put('/products/{id}/variants', [VariantController::class, 'updateVariants'], [$auth, $manage]);
$router->get('/products/{id}/combo', [ComboController::class, 'show'], [$auth]);
$router->put('/products/{id}/combo', [ComboController::class, 'update'], [$auth, $manage]);

// --- Ventas -----------------------------------------------------------
// Registrar/listar/ver: cualquier usuario (el cajero vende). Anular: manager.
$router->get('/sales', [SaleController::class, 'index'], [$auth]);
$router->get('/sales/{id}', [SaleController::class, 'show'], [$auth]);
$router->post('/sales', [SaleController::class, 'store'], [$auth]);
$router->post('/sales/{id}/cancel', [SaleController::class, 'cancel'], [$auth, $manage]);

// --- Analytics (solo admin/manager) -----------------------------------
$router->get('/analytics/summary', [AnalyticsController::class, 'summary'], [$auth, $manage]);
$router->get('/analytics/top-products', [AnalyticsController::class, 'topProducts'], [$auth, $manage]);
$router->get('/analytics/product-margins', [AnalyticsController::class, 'productMargins'], [$auth, $manage]);
$router->get('/analytics/ingredients', [AnalyticsController::class, 'ingredients'], [$auth, $manage]);
$router->get('/analytics/sales-over-time', [AnalyticsController::class, 'salesOverTime'], [$auth, $manage]);

// --- Empleados (solo admin) -------------------------------------------
$router->get('/users', [UserController::class, 'index'], [$auth, $admin]);
$router->get('/users/{id}', [UserController::class, 'show'], [$auth, $admin]);
$router->post('/users', [UserController::class, 'store'], [$auth, $admin]);
$router->put('/users/{id}', [UserController::class, 'update'], [$auth, $admin]);
$router->delete('/users/{id}', [UserController::class, 'destroy'], [$auth, $admin]);

// --- Asistencia -------------------------------------------------------
// Fichaje: cualquier sesión (el dispositivo del local); identifica por PIN.
$router->post('/attendance/punch', [AttendanceController::class, 'punch'], [$auth]);
// Reportes y correcciones: admin/manager.
$router->get('/attendance', [AttendanceController::class, 'index'], [$auth, $manage]);
$router->get('/attendance/open', [AttendanceController::class, 'open'], [$auth, $manage]);
$router->get('/attendance/summary', [AttendanceController::class, 'summary'], [$auth, $manage]);
$router->post('/attendance', [AttendanceController::class, 'store'], [$auth, $manage]);
$router->put('/attendance/{id}', [AttendanceController::class, 'update'], [$auth, $manage]);
$router->delete('/attendance/{id}', [AttendanceController::class, 'destroy'], [$auth, $manage]);

// --- Caja / arqueo ----------------------------------------------------
// Operación (abrir, mover, cerrar, ver la propia): cualquier sesión.
$router->post('/cash/open', [CashController::class, 'open'], [$auth]);
$router->get('/cash/current', [CashController::class, 'current'], [$auth]);
$router->post('/cash/movement', [CashController::class, 'movement'], [$auth]);
$router->post('/cash/close', [CashController::class, 'close'], [$auth]);
// Historial: admin/manager.
$router->get('/cash', [CashController::class, 'index'], [$auth, $manage]);
$router->get('/cash/{id}', [CashController::class, 'show'], [$auth, $manage]);

// --- Inventario (admin/manager) ---------------------------------------
$router->get('/inventory/stock', [InventoryController::class, 'stock'], [$auth, $manage]);
$router->get('/inventory/low-stock', [InventoryController::class, 'lowStock'], [$auth, $manage]);
$router->get('/inventory/movements', [InventoryController::class, 'movements'], [$auth, $manage]);
$router->post('/inventory/restock', [InventoryController::class, 'restock'], [$auth, $manage]);
$router->post('/inventory/adjustment', [InventoryController::class, 'adjustment'], [$auth, $manage]);
$router->post('/inventory/count', [InventoryController::class, 'count'], [$auth, $manage]);

// --- Pedidos / delivery -----------------------------------------------
$router->get('/orders', [OrderController::class, 'index'], [$auth]);
$router->get('/orders/{id}', [OrderController::class, 'show'], [$auth]);
$router->post('/orders', [OrderController::class, 'store'], [$auth]);
$router->put('/orders/{id}/status', [OrderController::class, 'updateStatus'], [$auth]);
$router->post('/orders/{id}/complete', [OrderController::class, 'complete'], [$auth]);
$router->post('/orders/{id}/cancel', [OrderController::class, 'cancel'], [$auth]);

// --- Menú público / checkout (SIN autenticación) ----------------------
// El negocio se identifica por su slug. Precios siempre del servidor.
// 'menu/secreta' va antes de 'menu' por claridad; son rutas distintas.
$router->get('/public/{slug}/menu/secreta', [PublicController::class, 'secretMenu']);
$router->get('/public/{slug}/menu', [PublicController::class, 'menu']);
$router->post('/public/{slug}/orders', [PublicController::class, 'createOrder']);

// --- Facturación ------------------------------------------------------
// Emisores (cuentas): solo admin. Comprobantes y resumen: admin/manager.
$router->get('/fiscal/issuers', [FiscalController::class, 'issuersIndex'], [$auth, $admin]);
$router->post('/fiscal/issuers', [FiscalController::class, 'issuerStore'], [$auth, $admin]);
$router->get('/fiscal/issuers/{id}', [FiscalController::class, 'issuerShow'], [$auth, $admin]);
$router->put('/fiscal/issuers/{id}', [FiscalController::class, 'issuerUpdate'], [$auth, $admin]);
$router->delete('/fiscal/issuers/{id}', [FiscalController::class, 'issuerDestroy'], [$auth, $admin]);
$router->get('/fiscal/summary', [FiscalController::class, 'summary'], [$auth, $manage]);
$router->get('/fiscal/invoices', [FiscalController::class, 'invoicesIndex'], [$auth, $manage]);
$router->post('/fiscal/invoices', [FiscalController::class, 'invoiceStore'], [$auth, $manage]);
$router->get('/fiscal/invoices/{id}', [FiscalController::class, 'invoiceShow'], [$auth, $manage]);
$router->post('/fiscal/invoices/{id}/retry', [FiscalController::class, 'invoiceRetry'], [$auth, $manage]);

// --- Salón: áreas y mesas ---------------------------------------------
// Lectura: cualquier usuario autenticado. Escritura: admin/manager.
$router->get('/table-areas', [TableAreaController::class, 'index'], [$auth]);
$router->post('/table-areas', [TableAreaController::class, 'store'], [$auth, $manage]);
$router->put('/table-areas/{id}', [TableAreaController::class, 'update'], [$auth, $manage]);
$router->delete('/table-areas/{id}', [TableAreaController::class, 'destroy'], [$auth, $manage]);

$router->get('/floor', [TableController::class, 'floor'], [$auth]);
$router->get('/tables', [TableController::class, 'index'], [$auth]);
// 'layout' va antes de '{id}' para que no lo capture como id.
$router->put('/tables/layout', [TableController::class, 'layout'], [$auth, $manage]);
$router->get('/tables/{id}', [TableController::class, 'show'], [$auth]);
$router->post('/tables', [TableController::class, 'store'], [$auth, $manage]);
$router->put('/tables/{id}', [TableController::class, 'update'], [$auth, $manage]);
$router->delete('/tables/{id}', [TableController::class, 'destroy'], [$auth, $manage]);

// --- Salón: cuentas de mesa (operación) -------------------------------
$router->get('/table-sessions', [TableSessionController::class, 'index'], [$auth]);
$router->post('/table-sessions', [TableSessionController::class, 'store'], [$auth]);
$router->get('/table-sessions/{id}', [TableSessionController::class, 'show'], [$auth]);
$router->post('/table-sessions/{id}/rounds', [TableSessionController::class, 'addRound'], [$auth]);
$router->post('/table-sessions/{id}/request-bill', [TableSessionController::class, 'requestBill'], [$auth]);
$router->put('/table-sessions/{id}/tables', [TableSessionController::class, 'setTables'], [$auth]);
$router->post('/table-sessions/{id}/merge', [TableSessionController::class, 'merge'], [$auth]);
$router->post('/table-sessions/{id}/close', [TableSessionController::class, 'close'], [$auth]);
$router->post('/table-sessions/{id}/cancel', [TableSessionController::class, 'cancel'], [$auth, $manage]);
$router->delete('/table-sessions/{id}/items/{itemId}', [TableSessionController::class, 'cancelItem'], [$auth]);

// --- Cocina (KDS) -----------------------------------------------------
$router->get('/kitchen/rounds', [KitchenController::class, 'index'], [$auth]);
$router->put('/kitchen/rounds/{id}/status', [KitchenController::class, 'updateStatus'], [$auth]);
$router->post('/kitchen/rounds/{id}/print', [KitchenController::class, 'print'], [$auth]);

// --- Proveedores ------------------------------------------------------
$router->get('/suppliers', [SupplierController::class, 'index'], [$auth]);
$router->post('/suppliers', [SupplierController::class, 'store'], [$auth, $manage]);
$router->get('/suppliers/{id}', [SupplierController::class, 'show'], [$auth]);
$router->put('/suppliers/{id}', [SupplierController::class, 'update'], [$auth, $manage]);
$router->delete('/suppliers/{id}', [SupplierController::class, 'destroy'], [$auth, $manage]);

// --- Insumos ----------------------------------------------------------
$router->get('/supplies', [SupplyController::class, 'index'], [$auth]);
$router->get('/supplies/low-stock', [SupplyController::class, 'lowStock'], [$auth]);
$router->post('/supplies', [SupplyController::class, 'store'], [$auth, $manage]);
$router->get('/supplies/{id}', [SupplyController::class, 'show'], [$auth]);
$router->put('/supplies/{id}', [SupplyController::class, 'update'], [$auth, $manage]);
$router->delete('/supplies/{id}', [SupplyController::class, 'destroy'], [$auth, $manage]);
$router->get('/supplies/{id}/movements', [SupplyController::class, 'movements'], [$auth]);
$router->post('/supplies/{id}/movement', [SupplyController::class, 'movement'], [$auth, $manage]);

// --- Clientes ---------------------------------------------------------
$router->get('/customers', [CustomerController::class, 'index'], [$auth]);
$router->post('/customers', [CustomerController::class, 'store'], [$auth]);
$router->get('/customers/{id}', [CustomerController::class, 'show'], [$auth]);
$router->put('/customers/{id}', [CustomerController::class, 'update'], [$auth, $manage]);
$router->delete('/customers/{id}', [CustomerController::class, 'destroy'], [$auth, $manage]);

$router->dispatch(Request::capture());
