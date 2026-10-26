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
use Pizzalog\Controllers\DeliveryDriverController;
use Pizzalog\Controllers\FiscalController;
use Pizzalog\Controllers\SupplierController;
use Pizzalog\Controllers\SupplyController;
use Pizzalog\Controllers\VariantController;
use Pizzalog\Controllers\BusinessController;
use Pizzalog\Controllers\UploadController;
use Pizzalog\Controllers\ProductController;
use Pizzalog\Controllers\ProductionController;
use Pizzalog\Controllers\RecipeCostingController;
use Pizzalog\Controllers\SaleController;
use Pizzalog\Controllers\TableAreaController;
use Pizzalog\Controllers\TableController;
use Pizzalog\Controllers\TableSessionController;
use Pizzalog\Controllers\UserController;
use Pizzalog\Controllers\StaffController;

require dirname(__DIR__) . '/bootstrap.php';

$router = new Router();
$auth   = Auth::authenticate();
$manage = Auth::requireRole(['admin', 'manager']);  // crear/editar/borrar catálogo o empleado con permisos
$admin  = Auth::requireRole(['admin']);             // gestión de usuarios

// --- Salud ------------------------------------------------------------
$router->get('/', fn() => \Pizzalog\Core\Response::ok(['service' => 'pizzalog-api', 'status' => 'up']));

// --- Autenticación ----------------------------------------------------
$router->post('/auth/login', [AuthController::class, 'login']);
$router->get('/auth/me', [AuthController::class, 'me'], [$auth]);
$router->post('/auth/change-password', [AuthController::class, 'changePassword'], [$auth]);

// --- Categorías -------------------------------------------------------
$router->get('/categories', [CategoryController::class, 'index'], [$auth]);
$router->put('/categories/reorder', [CategoryController::class, 'reorder'], [$auth, $manage]);
$router->get('/categories/{id}', [CategoryController::class, 'show'], [$auth]);
$router->post('/categories', [CategoryController::class, 'store'], [$auth, $manage]);
$router->put('/categories/{id}', [CategoryController::class, 'update'], [$auth, $manage]);
$router->delete('/categories/{id}', [CategoryController::class, 'destroy'], [$auth, $manage]);

// --- Productos --------------------------------------------------------
$router->post('/products/preview-ingredients', [ProductController::class, 'previewIngredients'], [$auth]);
$router->post('/uploads/image', [UploadController::class, 'image'], [$auth, $manage]);

$router->get('/business', [BusinessController::class, 'show'], [$auth]);
$router->put('/business', [BusinessController::class, 'update'], [$auth, $admin]);
$router->get('/business/hours', [BusinessController::class, 'hours'], [$auth]);
$router->put('/business/hours', [BusinessController::class, 'updateHours'], [$auth, $manage]);
$router->get('/business/social-links', [BusinessController::class, 'socialLinks'], [$auth]);
$router->put('/business/social-links', [BusinessController::class, 'updateSocialLinks'], [$auth, $manage]);

$router->get('/products', [ProductController::class, 'index'], [$auth]);
$router->put('/products/reorder', [ProductController::class, 'reorder'], [$auth, $manage]);
$router->post('/products/bulk-price', [ProductController::class, 'bulkPriceUpdate'], [$auth, $manage]);
$router->get('/products/{id}', [ProductController::class, 'show'], [$auth]);
$router->post('/products', [ProductController::class, 'store'], [$auth, $manage]);
$router->put('/products/{id}', [ProductController::class, 'update'], [$auth, $manage]);
$router->put('/products/{id}/quick', [ProductController::class, 'quickUpdate'], [$auth, $manage]);
$router->put('/products/{id}/availability', [ProductController::class, 'setAvailability'], [$auth, $manage]);
$router->delete('/products/{id}', [ProductController::class, 'destroy'], [$auth, $manage]);
$router->get('/products/{id}/variants', [VariantController::class, 'show'], [$auth]);
$router->put('/products/{id}/options', [VariantController::class, 'setOptions'], [$auth, $manage]);
$router->put('/products/{id}/variants', [VariantController::class, 'updateVariants'], [$auth, $manage]);
$router->get('/products/{id}/combo', [ComboController::class, 'show'], [$auth]);
$router->put('/products/{id}/combo', [ComboController::class, 'update'], [$auth, $manage]);

// --- Ventas -----------------------------------------------------------
$router->get('/public/run-loyverse-migration', [SaleController::class, 'publicMigrateLoyverse']);
$router->get('/sales', [SaleController::class, 'index'], [$auth]);
$router->post('/sales/import', [SaleController::class, 'import'], [$auth, $manage]);
$router->post('/sales/migrate-loyverse', [SaleController::class, 'migrateLoyverse'], [$auth, $manage]);
$router->get('/sales/{id}', [SaleController::class, 'show'], [$auth]);
$router->post('/sales', [SaleController::class, 'store'], [$auth]);
$router->post('/sales/{id}/cancel', [SaleController::class, 'cancel'], [$auth, $manage]);

// --- Reportes de Ventas (submenú Loyverse) -----------------------------
$router->get('/reports/sales/items', [SalesReportController::class, 'byItem'], [$auth, $manage]);
$router->get('/reports/sales/categories', [SalesReportController::class, 'byCategory'], [$auth, $manage]);
$router->get('/reports/sales/employees', [SalesReportController::class, 'byEmployee'], [$auth, $manage]);
$router->get('/reports/sales/payments', [SalesReportController::class, 'byPayment'], [$auth, $manage]);
$router->get('/reports/sales/discounts', [SalesReportController::class, 'discounts'], [$auth, $manage]);
$router->get('/reports/sales/taxes', [SalesReportController::class, 'taxes'], [$auth, $manage]);


// --- Analytics (admin/manager o empleado con permiso) -----------------
$router->get('/analytics/summary', [AnalyticsController::class, 'summary'], [$auth, $manage]);
$router->get('/analytics/top-products', [AnalyticsController::class, 'topProducts'], [$auth, $manage]);
$router->get('/analytics/category-leaders', [AnalyticsController::class, 'categoryLeaders'], [$auth, $manage]);
$router->get('/analytics/top-categories', [AnalyticsController::class, 'topCategories'], [$auth, $manage]);
$router->get('/analytics/product-margins', [AnalyticsController::class, 'productMargins'], [$auth, $manage]);
$router->get('/analytics/ingredients', [AnalyticsController::class, 'ingredients'], [$auth, $manage]);
$router->get('/analytics/winning-combinations', [AnalyticsController::class, 'winningCombinations'], [$auth, $manage]);
$router->get('/analytics/time-heatmap', [AnalyticsController::class, 'timeHeatmap'], [$auth, $manage]);
$router->get('/analytics/time-preferences', [AnalyticsController::class, 'timePreferences'], [$auth, $manage]);
$router->put('/analytics/time-preferences', [AnalyticsController::class, 'saveTimePreferences'], [$auth, $manage]);
$router->get('/analytics/sales-over-time', [AnalyticsController::class, 'salesOverTime'], [$auth, $manage]);
$router->get('/analytics/weekly-pizzas', [AnalyticsController::class, 'weeklyPizzas'], [$auth, $manage]);
$router->get('/analytics/product-trends', [AnalyticsController::class, 'productTrends'], [$auth, $manage]);
$router->get('/analytics/products-list', [AnalyticsController::class, 'productsList'], [$auth, $manage]);

// --- Producción / Masas / Escandallos (Calculadora) -------------------
$router->get('/production/dough-profiles', [ProductionController::class, 'doughProfiles'], [$auth]);
$router->post('/production/dough-profiles', [ProductionController::class, 'doughProfileStore'], [$auth, $manage]);
$router->put('/production/dough-profiles/{id}', [ProductionController::class, 'doughProfileUpdate'], [$auth, $manage]);
$router->delete('/production/dough-profiles/{id}', [ProductionController::class, 'doughProfileDestroy'], [$auth, $manage]);
$router->post('/production/dough-calculate', [ProductionController::class, 'doughCalculate'], [$auth]);
$router->get('/production/cost-margins', [ProductionController::class, 'costMargins'], [$auth, $manage]);
$router->post('/production/recipes', [ProductionController::class, 'saveRecipe'], [$auth, $manage]);
$router->post('/production/simulate', [ProductionController::class, 'simulate'], [$auth, $manage]);
$router->get('/production/recipe-studio', [RecipeCostingController::class, 'recipesIndex'], [$auth, $manage]);
$router->post('/production/recipe-studio/recipes', [RecipeCostingController::class, 'recipesSave'], [$auth, $manage]);
$router->get('/production/business-costs', [RecipeCostingController::class, 'businessCostsGet'], [$auth, $manage]);
$router->put('/production/business-costs', [RecipeCostingController::class, 'businessCostsSave'], [$auth, $manage]);

// --- Empleados / Usuarios ---------------------------------------------
$router->get('/users', [UserController::class, 'index'], [$auth, $manage]);
$router->get('/users/{id}', [UserController::class, 'show'], [$auth, $manage]);
$router->post('/users', [UserController::class, 'store'], [$auth, $admin]);
$router->put('/users/{id}', [UserController::class, 'update'], [$auth, $admin]);
$router->delete('/users/{id}', [UserController::class, 'destroy'], [$auth, $admin]);

// --- Asistencia -------------------------------------------------------
$router->post('/attendance/punch', [AttendanceController::class, 'punch'], [$auth]);
$router->get('/attendance', [AttendanceController::class, 'index'], [$auth, $manage]);
$router->get('/attendance/open', [AttendanceController::class, 'open'], [$auth, $manage]);
$router->get('/attendance/summary', [AttendanceController::class, 'summary'], [$auth, $manage]);
$router->post('/attendance', [AttendanceController::class, 'store'], [$auth, $manage]);
$router->put('/attendance/{id}', [AttendanceController::class, 'update'], [$auth, $manage]);
$router->delete('/attendance/{id}', [AttendanceController::class, 'destroy'], [$auth, $manage]);

// --- Personal: Horas, Retiros a Cuenta, Liquidaciones y Portal --------
$router->get('/staff/overview', [StaffController::class, 'overview'], [$auth, $manage]);
$router->post('/staff/people', [StaffController::class, 'storePerson'], [$auth, $manage]);
$router->put('/staff/people/{id}', [StaffController::class, 'updatePerson'], [$auth, $manage]);
$router->get('/staff/hours', [StaffController::class, 'listHours'], [$auth, $manage]);
$router->post('/staff/hours', [StaffController::class, 'storeHour'], [$auth, $manage]);
$router->post('/staff/hours/shift-batch', [StaffController::class, 'storeShiftBatch'], [$auth, $manage]);
$router->delete('/staff/hours/{id}', [StaffController::class, 'destroyHour'], [$auth, $manage]);
$router->get('/staff/withdrawals', [StaffController::class, 'listWithdrawals'], [$auth, $manage]);
$router->post('/staff/withdrawals', [StaffController::class, 'storeWithdrawal'], [$auth, $manage]);
$router->put('/staff/withdrawals/{id}', [StaffController::class, 'updateWithdrawal'], [$auth, $manage]);
$router->delete('/staff/withdrawals/{id}', [StaffController::class, 'destroyWithdrawal'], [$auth, $manage]);
$router->get('/staff/settlements', [StaffController::class, 'listSettlements'], [$auth, $manage]);
$router->post('/staff/settlements/preview', [StaffController::class, 'previewSettlement'], [$auth, $manage]);
$router->post('/staff/settlements', [StaffController::class, 'storeSettlement'], [$auth, $manage]);
$router->put('/staff/settlements/{id}/status', [StaffController::class, 'updateSettlementStatus'], [$auth, $manage]);
$router->delete('/staff/settlements/{id}', [StaffController::class, 'destroySettlement'], [$auth, $manage]);

// --- Portal Online Individual de Empleado (protegido por token de empleado o admin)
$router->get('/public/staff-portal/{code}', [StaffController::class, 'portalShow']);
$router->post('/public/staff-portal/{code}/withdrawals', [StaffController::class, 'portalStoreWithdrawal']);
$router->post('/public/staff-portal/{code}/hours', [StaffController::class, 'portalStoreHour']);

// --- Caja / arqueo ----------------------------------------------------
$router->post('/cash/open', [CashController::class, 'open'], [$auth]);
$router->get('/cash/current', [CashController::class, 'current'], [$auth]);
$router->post('/cash/movement', [CashController::class, 'movement'], [$auth]);
$router->post('/cash/close', [CashController::class, 'close'], [$auth]);
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
$router->put('/orders/{id}/assign-driver', [OrderController::class, 'assignDriver'], [$auth]);
$router->post('/orders/{id}/complete', [OrderController::class, 'complete'], [$auth]);
$router->post('/orders/{id}/cancel', [OrderController::class, 'cancel'], [$auth]);

// --- Cadetes / Repartidores ------------------------------------------
$router->get('/drivers', [DeliveryDriverController::class, 'index'], [$auth]);
$router->get('/drivers/settlement', [DeliveryDriverController::class, 'settlement'], [$auth, $manage]);
$router->get('/drivers/{id}', [DeliveryDriverController::class, 'show'], [$auth]);
$router->post('/drivers', [DeliveryDriverController::class, 'store'], [$auth, $manage]);
$router->put('/drivers/{id}', [DeliveryDriverController::class, 'update'], [$auth, $manage]);
$router->delete('/drivers/{id}', [DeliveryDriverController::class, 'destroy'], [$auth, $manage]);

// --- Menú público / checkout (SIN autenticación) ----------------------
$router->get('/public/{slug}/menu/secreta', [PublicController::class, 'secretMenu']);
$router->get('/public/{slug}/menu', [PublicController::class, 'menu']);
$router->post('/public/{slug}/orders', [PublicController::class, 'createOrder']);
$router->post('/public/{slug}/external-order', [PublicController::class, 'externalOrder']);
$router->get('/public/{slug}/table/{id}', [PublicController::class, 'tableInfo']);
$router->post('/public/{slug}/table-order', [PublicController::class, 'createTableOrder']);

// --- Facturación ------------------------------------------------------
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
$router->get('/table-areas', [TableAreaController::class, 'index'], [$auth]);
$router->post('/table-areas', [TableAreaController::class, 'store'], [$auth, $manage]);
$router->put('/table-areas/{id}', [TableAreaController::class, 'update'], [$auth, $manage]);
$router->delete('/table-areas/{id}', [TableAreaController::class, 'destroy'], [$auth, $manage]);

$router->get('/floor', [TableController::class, 'floor'], [$auth]);
$router->get('/tables', [TableController::class, 'index'], [$auth]);
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
$router->put('/table-sessions/{id}/items/{itemId}/discount', [TableSessionController::class, 'discountItem'], [$auth]);
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
