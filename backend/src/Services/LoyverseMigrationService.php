<?php
namespace Pizzalog\Services;

use PDO;
use Pizzalog\Controllers\StaffController;
use Pizzalog\Controllers\UserController;
use Pizzalog\Core\Database;

/**
 * Migración integral e idempotente del histórico completo de Loyverse (Sep 2022 – Oct 2026)
 * para Pizzería Arrabbiata (business_id = 1), limpieza de datos de prueba previos y
 * creación del vendor independiente "Pizza Test" (slug = 'pizza-test') con catálogo,
 * recetas, insumos, salón y usuarios clonados para pruebas seguras.
 */
class LoyverseMigrationService
{
    public const MIGRATION_KEY = 'loyverse_full_2026_10_22_v1';

    private static bool $checkedInProcess = false;

    public static function ensureMigrated(bool $force = false): ?array
    {
        if (self::$checkedInProcess && !$force) {
            return null;
        }

        try {
            $pdo = Database::pdo();
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS system_migrations (
                    migration_key VARCHAR(80) NOT NULL PRIMARY KEY,
                    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    details TEXT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");

            if (!$force) {
                $stmt = $pdo->prepare('SELECT details FROM system_migrations WHERE migration_key = ? LIMIT 1');
                $stmt->execute([self::MIGRATION_KEY]);
                $existing = $stmt->fetchColumn();
                if ($existing !== false) {
                    $decoded = json_decode((string) $existing, true);
                    if (!isset($decoded['error'])) {
                        self::$checkedInProcess = true;
                        return $decoded ?: ['already_applied' => true];
                    }
                }
            }

            $res = (new self())->run($pdo);
            self::$checkedInProcess = true;
            return $res;
        } catch (\Throwable $e) {
            error_log('LoyverseMigrationService error: ' . $e->getMessage());
            return ['error' => $e->getMessage()];
        }
    }

    public function run(PDO $pdo): array
    {
        @set_time_limit(300);
        @ini_set('memory_limit', '512M');

        $bundlePath = dirname(__DIR__, 2) . '/data/loyverse_arrabbiata_2022_2026.json.gz';
        if (!is_file($bundlePath)) {
            throw new \RuntimeException('No se encontró el paquete de datos Loyverse: ' . $bundlePath);
        }

        $gz = file_get_contents($bundlePath);
        $json = $gz !== false ? @gzdecode($gz) : false;
        if ($json === false) {
            throw new \RuntimeException('No se pudo descomprimir el paquete de datos Loyverse');
        }

        $bundle = json_decode($json, true);
        if (!is_array($bundle) || empty($bundle['receipts'])) {
            throw new \RuntimeException('El paquete de datos Loyverse es inválido');
        }

        $bid = 1; // Arrabbiata

        // 1) Sincronizar recetas y costos entre nombres con y sin prefijo "Pizza " / "Margherita" <-> "Margarita"
        $this->syncArrabbiataProductRecipes($pdo, $bid);

        // Construir mapa de productos de Arrabbiata para vincular sale_items.product_id
        $productMap = $this->buildProductLookupMap($pdo, $bid);

        // Usuario administrador de Arrabbiata
        $uStmt = $pdo->prepare("SELECT id FROM users WHERE business_id = ? ORDER BY role = 'admin' DESC, id ASC LIMIT 1");
        $uStmt->execute([$bid]);
        $adminUserId = (int) ($uStmt->fetchColumn() ?: 1);

        // 2) Eliminar todos los pedidos, ventas, turnos y sesiones de prueba de Arrabbiata (business_id = 1)
        $this->cleanArrabbiataTestData($pdo, $bid);

        // 3) Insertar en lote Turnos (cash_sessions), Movimientos (cash_movements), Recibos (sales) e Ítems (sale_items)
        $baseShiftId = (int) $pdo->query('SELECT COALESCE(MAX(id), 0) FROM cash_sessions')->fetchColumn();
        $baseSaleId  = (int) $pdo->query('SELECT COALESCE(MAX(id), 0) FROM sales')->fetchColumn();

        $shifts    = $bundle['shifts'] ?? [];
        $movements = $bundle['movements'] ?? [];
        $receipts  = $bundle['receipts'] ?? [];

        $pdo->beginTransaction();
        try {
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');

            // 3a) Turnos de caja (1.145 turnos)
            $shiftBatches = array_chunk($shifts, 250, true);
            foreach ($shiftBatches as $batch) {
                $placeholders = [];
                $params = [];
                foreach ($batch as $idx => $s) {
                    // $s = [openAt, closeAt, opening, closing, expected, diff, note]
                    $shiftId = $baseShiftId + $idx + 1;
                    $placeholders[] = '(?, ?, ?, ?, ?, ?, ?, ?, ?, "closed", ?)';
                    $params[] = $shiftId;
                    $params[] = $bid;
                    $params[] = $adminUserId;
                    $params[] = $s[0];
                    $params[] = $s[1];
                    $params[] = (float) $s[2];
                    $params[] = (float) $s[3];
                    $params[] = (float) $s[4];
                    $params[] = (float) $s[5];
                    $params[] = mb_substr((string) $s[6], 0, 255);
                }
                $sql = 'INSERT INTO cash_sessions
                            (id, business_id, opened_by, opened_at, closed_at,
                             opening_amount, closing_amount, expected_amount, difference, status, note)
                        VALUES ' . implode(',', $placeholders);
                $pdo->prepare($sql)->execute($params);
            }

            // 3b) Entradas y salidas de caja (370 movimientos)
            $movBatches = array_chunk($movements, 250);
            foreach ($movBatches as $batch) {
                $placeholders = [];
                $params = [];
                foreach ($batch as $m) {
                    // $m = [shiftSeq, dt, type, amount, reason]
                    $placeholders[] = '(?, ?, ?, ?, ?, ?)';
                    $params[] = $baseShiftId + (int) $m[0];
                    $params[] = $m[2] === 'in' ? 'in' : 'out';
                    $params[] = (float) $m[3];
                    $params[] = mb_substr((string) $m[4], 0, 160);
                    $params[] = $adminUserId;
                    $params[] = $m[1];
                }
                $sql = 'INSERT INTO cash_movements
                            (cash_session_id, type, amount, reason, created_by, created_at)
                        VALUES ' . implode(',', $placeholders);
                $pdo->prepare($sql)->execute($params);
            }

            // 3c) Primero: insertar TODAS las ventas (sales) en lotes
            $saleBatches = array_chunk($receipts, 350, true);
            foreach ($saleBatches as $batch) {
                $saleRows = [];
                $saleParams = [];
                foreach ($batch as $rIdx => $r) {
                    // $r = [0:num, 1:dt, 2:shiftSeq, 3:sub, 4:disc, 5:tot, 6:pm, 7:st, 8:ch, 9:nt, 10:items]
                    $saleId  = $baseSaleId + $rIdx + 1;
                    $saleNum = $rIdx + 1;
                    $csId    = !empty($r[2]) ? ($baseShiftId + (int) $r[2]) : null;

                    $saleRows[] = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
                    $saleParams[] = $saleId;
                    $saleParams[] = $bid;
                    $saleParams[] = $saleNum;
                    $saleParams[] = $adminUserId;
                    $saleParams[] = $csId;
                    $saleParams[] = (float) $r[3];
                    $saleParams[] = (float) $r[4];
                    $saleParams[] = (float) $r[5];
                    $saleParams[] = (string) $r[6];
                    $saleParams[] = (string) $r[7];
                    $saleParams[] = (string) $r[8];
                    $saleParams[] = mb_substr((string) $r[9], 0, 255);
                    $saleParams[] = (string) $r[1];
                }
                $this->flushSalesBatch($pdo, $saleRows, $saleParams);
            }

            // 3d) Segundo: insertar TODOS los ítems por venta (sale_items) en lotes
            $itemRowsBuffer = [];
            $itemParamsBuffer = [];

            foreach ($receipts as $rIdx => $r) {
                $saleId = $baseSaleId + $rIdx + 1;
                $items  = $r[10] ?? [];

                if ($items === []) {
                    $tot = (float) $r[5];
                    $itemRowsBuffer[] = '(?, NULL, ?, ?, 1, ?)';
                    $itemParamsBuffer[] = $saleId;
                    $itemParamsBuffer[] = 'Venta Loyverse #' . $r[0];
                    $itemParamsBuffer[] = $tot;
                    $itemParamsBuffer[] = $tot;
                } else {
                    foreach ($items as $it) {
                        // $it = [0:name, 1:variant, 2:mods, 3:cat, 4:qty, 5:netTotal]
                        $baseName = (string) $it[0];
                        $variant  = (string) ($it[1] ?? '');
                        $mods     = (string) ($it[2] ?? '');
                        $qty      = (float) $it[4];
                        $netTotal = (float) $it[5];
                        $absQty   = abs($qty) > 0.0001 ? abs($qty) : 1.0;
                        $unitP    = round(abs($netTotal) / $absQty, 2);

                        $pid = $this->resolveProductId($baseName, $productMap);

                        $fullLabel = $baseName;
                        if ($variant !== '') {
                            $fullLabel .= ' — ' . $variant;
                        }
                        if ($mods !== '') {
                            $fullLabel .= ' (' . $mods . ')';
                        }

                        $itemRowsBuffer[] = '(?, ?, ?, ?, ?, ?)';
                        $itemParamsBuffer[] = $saleId;
                        $itemParamsBuffer[] = $pid;
                        $itemParamsBuffer[] = mb_substr($fullLabel, 0, 120);
                        $itemParamsBuffer[] = $unitP;
                        $itemParamsBuffer[] = $qty;
                        $itemParamsBuffer[] = $netTotal;
                    }
                }

                if (count($itemRowsBuffer) >= 500) {
                    $this->flushItemsBatch($pdo, $itemRowsBuffer, $itemParamsBuffer);
                    $itemRowsBuffer = [];
                    $itemParamsBuffer = [];
                }
            }

            if ($itemRowsBuffer !== []) {
                $this->flushItemsBatch($pdo, $itemRowsBuffer, $itemParamsBuffer);
            }

            $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
            $pdo->commit();
        } catch (\Throwable $e) {
            try {
                $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
            } catch (\Throwable) {}
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        // 4) Crear y poblar el vendor de pruebas "Pizza Test"
        $pizzaTestInfo = $this->ensurePizzaTestVendor($pdo, $bid);

        $details = [
            'migrated_at'      => date('Y-m-d H:i:s'),
            'shifts_imported'  => count($shifts),
            'movements_imported' => count($movements),
            'receipts_imported'=> count($receipts),
            'pizza_test'       => $pizzaTestInfo,
        ];

        $insMig = $pdo->prepare('
            INSERT INTO system_migrations (migration_key, applied_at, details)
            VALUES (?, NOW(), ?)
            ON DUPLICATE KEY UPDATE applied_at = NOW(), details = VALUES(details)
        ');
        $insMig->execute([self::MIGRATION_KEY, json_encode($details, JSON_UNESCAPED_UNICODE)]);

        return $details;
    }

    private function flushSalesBatch(PDO $pdo, array $rows, array $params): void
    {
        $sql = 'INSERT INTO sales
                    (id, business_id, sale_number, user_id, cash_session_id,
                     subtotal, discount, total, payment_method, status, channel, note, created_at)
                VALUES ' . implode(',', $rows);
        $pdo->prepare($sql)->execute($params);
    }

    private function flushItemsBatch(PDO $pdo, array $rows, array $params): void
    {
        $sql = 'INSERT INTO sale_items
                    (sale_id, product_id, product_name, unit_price, quantity, line_total)
                VALUES ' . implode(',', $rows);
        $pdo->prepare($sql)->execute($params);
    }

    private function cleanArrabbiataTestData(PDO $pdo, int $bid): void
    {
        try {
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        } catch (\Throwable $e) {}

        $queries = [
            "DELETE oi FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.business_id = $bid",
            "DELETE FROM orders WHERE business_id = $bid",
            "DELETE FROM table_round_items WHERE business_id = $bid",
            "DELETE FROM table_rounds WHERE business_id = $bid",
            "DELETE st FROM session_tables st JOIN table_sessions ts ON ts.id = st.session_id WHERE ts.business_id = $bid",
            "DELETE tst FROM table_session_tables tst JOIN table_sessions ts ON ts.id = tst.session_id WHERE ts.business_id = $bid",
            "DELETE FROM table_sessions WHERE business_id = $bid",
            "DELETE FROM stock_movements WHERE business_id = $bid",
            "DELETE FROM invoices WHERE business_id = $bid",
            "DELETE si FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.business_id = $bid",
            "DELETE FROM sales WHERE business_id = $bid",
            "DELETE cm FROM cash_movements cm JOIN cash_sessions cs ON cs.id = cm.cash_session_id WHERE cs.business_id = $bid",
            "DELETE FROM cash_sessions WHERE business_id = $bid",
            "DELETE FROM customers WHERE business_id = $bid",
            "DELETE FROM sale_items WHERE sale_id NOT IN (SELECT id FROM sales)",
        ];

        foreach ($queries as $q) {
            try {
                $pdo->exec($q);
            } catch (\Throwable $e) {
                // Ignorar si alguna tabla opcional no existe
            }
        }

        try {
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        } catch (\Throwable $e) {}
    }

    private static function normName(string $s): string
    {
        $s = mb_strtolower(trim($s), 'UTF-8');
        $s = strtr($s, [
            'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u',
            'ä' => 'a', 'ë' => 'e', 'ï' => 'i', 'ö' => 'o', 'ü' => 'u',
        ]);
        $s = preg_replace('/\s+/', ' ', $s);
        return $s;
    }

    /**
     * Asegura que tanto 'Pizza Margarita' como 'Margherita' (y el resto de las pizzas de Arrabbiata)
     * compartan su costo y sus ingredientes de receta (product_ingredients).
     */
    private function syncArrabbiataProductRecipes(PDO $pdo, int $bid): void
    {
        try {
            $stmt = $pdo->prepare('SELECT id, name, cost FROM products WHERE business_id = ?');
            $stmt->execute([$bid]);
            $rows = $stmt->fetchAll();

            $byStrip = [];
            foreach ($rows as $r) {
                $key = preg_replace('/^pizza\s+/', '', self::normName($r['name']));
                if ($key === 'margherita') {
                    $key = 'margarita';
                }
                $byStrip[$key][] = $r;
            }

            foreach ($byStrip as $group) {
                if (count($group) < 2) {
                    continue;
                }
                // Buscar cuál producto del grupo tiene ingredientes / costo cargado
                $sourceId = null;
                $maxCost  = 0.0;
                foreach ($group as $p) {
                    if ((float) $p['cost'] > $maxCost) {
                        $maxCost = (float) $p['cost'];
                    }
                    $cStmt = $pdo->prepare('SELECT COUNT(*) FROM product_ingredients WHERE product_id = ?');
                    $cStmt->execute([(int) $p['id']]);
                    if ((int) $cStmt->fetchColumn() > 0) {
                        $sourceId = (int) $p['id'];
                    }
                }

                foreach ($group as $p) {
                    $pid = (int) $p['id'];
                    if ($maxCost > 0 && (float) $p['cost'] <= 0) {
                        $pdo->prepare('UPDATE products SET cost = ? WHERE id = ?')->execute([$maxCost, $pid]);
                    }
                    if ($sourceId !== null && $pid !== $sourceId) {
                        $pdo->prepare('
                            INSERT IGNORE INTO product_ingredients (product_id, ingredient_id, quantity, unit)
                            SELECT ?, ingredient_id, quantity, unit
                              FROM product_ingredients
                             WHERE product_id = ?
                        ')->execute([$pid, $sourceId]);
                    }
                }
            }
        } catch (\Throwable $e) {
            // No bloquear si falla la sincronización auxiliar
        }
    }

    private function buildProductLookupMap(PDO $pdo, int $bid): array
    {
        $stmt = $pdo->prepare('
            SELECT p.id, p.name, p.cost,
                   (SELECT COUNT(*) FROM product_ingredients pi WHERE pi.product_id = p.id) AS ing_count
              FROM products p
             WHERE p.business_id = ?
             ORDER BY ing_count DESC, p.cost DESC, p.is_active DESC, p.id ASC
        ');
        $stmt->execute([$bid]);

        $map = [];
        foreach ($stmt->fetchAll() as $r) {
            $id = (int) $r['id'];
            $n  = self::normName($r['name']);
            if (!isset($map[$n])) {
                $map[$n] = $id;
            }
            $stripped = preg_replace('/^pizza\s+/', '', $n);
            if (!isset($map[$stripped])) {
                $map[$stripped] = $id;
            }
            if (!isset($map['pizza ' . $stripped])) {
                $map['pizza ' . $stripped] = $id;
            }
            if ($stripped === 'margherita' || $stripped === 'margarita') {
                $map['margarita']        = $map['margarita'] ?? $id;
                $map['pizza margarita']  = $map['pizza margarita'] ?? $id;
                $map['margherita']       = $map['margherita'] ?? $id;
                $map['pizza margherita'] = $map['pizza margherita'] ?? $id;
            }
        }

        // Alias frecuentes del histórico de Loyverse
        $aliases = [
            '1 faina'            => 'faina',
            'margarita cg'       => 'margarita',
            'pizza romana'       => 'muzza romana',
            'vermut clasico'     => 'vermut comun',
            'vermu'              => 'vermut comun',
            'pizzuca'            => 'pizzucca',
            'gaseosa popup'      => 'gaseosa',
        ];
        foreach ($aliases as $from => $to) {
            if (!isset($map[$from]) && isset($map[$to])) {
                $map[$from] = $map[$to];
            }
        }

        return $map;
    }

    private function resolveProductId(string $rawName, array $map): ?int
    {
        $n = self::normName($rawName);
        if (isset($map[$n])) {
            return $map[$n];
        }
        $stripped = preg_replace('/^pizza\s+/', '', $n);
        return $map[$stripped] ?? null;
    }

    /**
     * Crea el negocio "Pizza Test" (slug: pizza-test) con su usuario admin y clona
     * el catálogo, recetas, insumos y salón de Arrabbiata para poder probar todo sin
     * afectar los datos reales de Arrabbiata.
     */
    private function ensurePizzaTestVendor(PDO $pdo, int $sourceBid): array
    {
        $stmt = $pdo->prepare("SELECT id FROM businesses WHERE slug = 'pizza-test' LIMIT 1");
        $stmt->execute();
        $testBid = (int) ($stmt->fetchColumn() ?: 0);

        if ($testBid <= 0) {
            // Copiar configuración base de Arrabbiata pero con nombre Pizza Test y slug pizza-test
            $srcStmt = $pdo->prepare('SELECT * FROM businesses WHERE id = ? LIMIT 1');
            $srcStmt->execute([$sourceBid]);
            $srcBiz = $srcStmt->fetch() ?: [];

            $pdo->prepare("
                INSERT INTO businesses
                    (name, slug, address, phone, description, logo_url, theme,
                     timezone, currency, is_active, accepts_online_orders)
                VALUES
                    ('Pizza Test', 'pizza-test', 'Local de Pruebas · Pizzalog', '5493510000000',
                     'Entorno de pruebas completo (clon de Arrabbiata)', ?, ?,
                     'America/Argentina/Cordoba', 'ARS', 1, 1)
            ")->execute([
                $srcBiz['logo_url'] ?? null,
                $srcBiz['theme'] ?? null,
            ]);
            $testBid = (int) $pdo->lastInsertId();
        }

        // Asegurar columna use_digital_kds activada en Pizza Test
        try {
            $pdo->prepare('UPDATE businesses SET use_digital_kds = 1, accepts_online_orders = 1 WHERE id = ?')
                ->execute([$testBid]);
        } catch (\Throwable $e) {}

        // Asegurar usuarios de Pizza Test
        UserController::ensureSchema();
        $uCheck = $pdo->prepare("SELECT id FROM users WHERE business_id = ? AND (username = 'pizzatest' OR email = 'test@pizzalog.net') LIMIT 1");
        $uCheck->execute([$testBid]);
        $testUserId = (int) ($uCheck->fetchColumn() ?: 0);
        $passHash = password_hash('pizza123', PASSWORD_DEFAULT);
        $pinHash  = password_hash('1234', PASSWORD_DEFAULT);

        if ($testUserId <= 0) {
            $pdo->prepare("
                INSERT INTO users
                    (business_id, name, username, email, password_hash, pin_hash, role, can_use_pos, is_active)
                VALUES
                    (?, 'Admin Pizza Test', 'pizzatest', 'test@pizzalog.net', ?, ?, 'admin', 1, 1)
            ")->execute([$testBid, $passHash, $pinHash]);
            $testUserId = (int) $pdo->lastInsertId();
        }

        // Asegurar horarios 24/7 en Pizza Test para poder probar pedidos online a cualquier hora
        $hCheck = $pdo->prepare('SELECT COUNT(*) FROM business_hours WHERE business_id = ?');
        $hCheck->execute([$testBid]);
        if ((int) $hCheck->fetchColumn() === 0) {
            $insH = $pdo->prepare('INSERT INTO business_hours (business_id, day_of_week, opens_at, closes_at) VALUES (?, ?, "00:00:00", "23:59:00")');
            for ($d = 0; $d <= 6; $d++) {
                $insH->execute([$testBid, $d]);
            }
        }

        // Clonar catálogo, insumos, recetas, perfiles de masa y salón si Pizza Test aún no tiene productos
        $pCheck = $pdo->prepare('SELECT COUNT(*) FROM products WHERE business_id = ?');
        $pCheck->execute([$testBid]);
        if ((int) $pCheck->fetchColumn() === 0) {
            $this->cloneCatalogAndSetup($pdo, $sourceBid, $testBid);
        }

        return [
            'business_id' => $testBid,
            'name'        => 'Pizza Test',
            'slug'        => 'pizza-test',
            'username'    => 'pizzatest',
            'email'       => 'test@pizzalog.net',
            'password'    => 'pizza123',
            'pin'         => '1234',
        ];
    }

    private function cloneCatalogAndSetup(PDO $pdo, int $srcBid, int $dstBid): void
    {
        // 1. Categorías
        $catMap = [];
        $cStmt = $pdo->prepare('SELECT * FROM categories WHERE business_id = ? ORDER BY sort_order, id');
        $cStmt->execute([$srcBid]);
        $insCat = $pdo->prepare('INSERT INTO categories (business_id, name, sort_order, is_active) VALUES (?, ?, ?, ?)');
        foreach ($cStmt->fetchAll() as $c) {
            $insCat->execute([$dstBid, $c['name'], (int) $c['sort_order'], (int) $c['is_active']]);
            $catMap[(int) $c['id']] = (int) $pdo->lastInsertId();
        }

        // 2. Ingredientes
        $ingMap = [];
        try {
            $iStmt = $pdo->prepare('SELECT * FROM ingredients WHERE business_id = ?');
            $iStmt->execute([$srcBid]);
            $insIng = $pdo->prepare('INSERT INTO ingredients (business_id, name, category, is_active) VALUES (?, ?, ?, ?)');
            foreach ($iStmt->fetchAll() as $ing) {
                $insIng->execute([$dstBid, $ing['name'], $ing['category'], (int) $ing['is_active']]);
                $ingMap[(int) $ing['id']] = (int) $pdo->lastInsertId();
            }
        } catch (\Throwable $e) {}

        // 3. Insumos (supplies) y Perfiles de Masa (dough_profiles)
        try {
            $sStmt = $pdo->prepare('SELECT * FROM supplies WHERE business_id = ?');
            $sStmt->execute([$srcBid]);
            $insSup = $pdo->prepare('
                INSERT INTO supplies (business_id, name, category, unit, cost, stock_quantity, stock_min, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ');
            foreach ($sStmt->fetchAll() as $sup) {
                $insSup->execute([
                    $dstBid, $sup['name'], $sup['category'] ?? null, $sup['unit'] ?? 'kg',
                    (float) ($sup['cost'] ?? 0), (float) ($sup['stock_quantity'] ?? 0),
                    (float) ($sup['stock_min'] ?? 0), (int) ($sup['is_active'] ?? 1),
                ]);
            }
        } catch (\Throwable $e) {}

        try {
            $dStmt = $pdo->prepare('SELECT * FROM dough_profiles WHERE business_id = ?');
            $dStmt->execute([$srcBid]);
            $insDough = $pdo->prepare('
                INSERT INTO dough_profiles
                    (business_id, name, unit_weight_grams, hydration_pct, biga_pct, biga_water_pct, biga_yeast_pct,
                     poolish_pct, poolish_water_pct, poolish_yeast_pct, direct_yeast_pct, salt_pct, sugar_pct, oil_pct,
                     flour_white_pct, flour_integral_pct, flour_semola_pct, cost_per_kg, notes, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ');
            foreach ($dStmt->fetchAll() as $dp) {
                $insDough->execute([
                    $dstBid, $dp['name'], $dp['unit_weight_grams'], $dp['hydration_pct'],
                    $dp['biga_pct'], $dp['biga_water_pct'], $dp['biga_yeast_pct'],
                    $dp['poolish_pct'], $dp['poolish_water_pct'], $dp['poolish_yeast_pct'],
                    $dp['direct_yeast_pct'], $dp['salt_pct'], $dp['sugar_pct'], $dp['oil_pct'],
                    $dp['flour_white_pct'], $dp['flour_integral_pct'], $dp['flour_semola_pct'],
                    $dp['cost_per_kg'], $dp['notes'], $dp['is_active'],
                ]);
            }
        } catch (\Throwable $e) {}

        // 4. Productos, Variantes y Recetas
        $prodMap = [];
        $pStmt = $pdo->prepare('SELECT * FROM products WHERE business_id = ? ORDER BY sort_order, id');
        $pStmt->execute([$srcBid]);
        $insProd = $pdo->prepare('
            INSERT INTO products
                (business_id, category_id, sort_order, name, description, price, cost, image_url,
                 track_stock, stock_quantity, stock_min, is_active, has_variants, is_combo,
                 is_open_price, is_combinable, show_online, show_in_salon, is_available, is_secret, is_vegan_opt, badge_text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');

        foreach ($pStmt->fetchAll() as $p) {
            $oldPid = (int) $p['id'];
            $newCatId = $p['category_id'] !== null ? ($catMap[(int) $p['category_id']] ?? null) : null;
            $insProd->execute([
                $dstBid,
                $newCatId,
                (int) ($p['sort_order'] ?? 0),
                $p['name'],
                $p['description'] ?? null,
                (float) ($p['price'] ?? 0),
                (float) ($p['cost'] ?? 0),
                $p['image_url'] ?? null,
                (int) ($p['track_stock'] ?? 0),
                (int) ($p['stock_quantity'] ?? 0),
                (int) ($p['stock_min'] ?? 0),
                (int) ($p['is_active'] ?? 1),
                (int) ($p['has_variants'] ?? 0),
                (int) ($p['is_combo'] ?? 0),
                (int) ($p['is_open_price'] ?? 0),
                (int) ($p['is_combinable'] ?? 0),
                (int) ($p['show_online'] ?? 1),
                (int) ($p['show_in_salon'] ?? 1),
                (int) ($p['is_available'] ?? 1),
                (int) ($p['is_secret'] ?? 0),
                (int) ($p['is_vegan_opt'] ?? 0),
                $p['badge_text'] ?? null,
            ]);
            $newPid = (int) $pdo->lastInsertId();
            $prodMap[$oldPid] = $newPid;

            // Clonar product_ingredients
            if ($ingMap !== []) {
                try {
                    $piStmt = $pdo->prepare('SELECT * FROM product_ingredients WHERE product_id = ?');
                    $piStmt->execute([$oldPid]);
                    $insPi = $pdo->prepare('INSERT IGNORE INTO product_ingredients (product_id, ingredient_id, quantity, unit) VALUES (?, ?, ?, ?)');
                    foreach ($piStmt->fetchAll() as $pi) {
                        $newIngId = $ingMap[(int) $pi['ingredient_id']] ?? null;
                        if ($newIngId) {
                            $insPi->execute([$newPid, $newIngId, $pi['quantity'] ?? null, $pi['unit'] ?? null]);
                        }
                    }
                } catch (\Throwable $e) {}
            }

            // Clonar opciones y variantes
            if ((int) ($p['has_variants'] ?? 0) === 1) {
                try {
                    $valMap = [];
                    $oStmt = $pdo->prepare('SELECT * FROM product_options WHERE product_id = ? AND business_id = ? ORDER BY sort_order, id');
                    $oStmt->execute([$oldPid, $srcBid]);
                    $insOpt = $pdo->prepare('INSERT INTO product_options (business_id, product_id, name, sort_order) VALUES (?, ?, ?, ?)');
                    $insVal = $pdo->prepare('INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (?, ?, ?, ?)');
                    foreach ($oStmt->fetchAll() as $opt) {
                        $insOpt->execute([$dstBid, $newPid, $opt['name'], (int) $opt['sort_order']]);
                        $newOptId = (int) $pdo->lastInsertId();
                        $vStmt = $pdo->prepare('SELECT * FROM product_option_values WHERE option_id = ? ORDER BY sort_order, id');
                        $vStmt->execute([(int) $opt['id']]);
                        foreach ($vStmt->fetchAll() as $val) {
                            $insVal->execute([$dstBid, $newOptId, $val['value'], (int) $val['sort_order']]);
                            $valMap[(int) $val['id']] = (int) $pdo->lastInsertId();
                        }
                    }

                    $pvStmt = $pdo->prepare('SELECT * FROM product_variants WHERE product_id = ? AND business_id = ? ORDER BY sort_order, id');
                    $pvStmt->execute([$oldPid, $srcBid]);
                    $insPv = $pdo->prepare('INSERT INTO product_variants (business_id, product_id, label, price, sku, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)');
                    $insBridge = $pdo->prepare('INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (?, ?)');
                    foreach ($pvStmt->fetchAll() as $pv) {
                        $insPv->execute([
                            $dstBid, $newPid, $pv['label'], (float) $pv['price'],
                            $pv['sku'] ?? null, (int) $pv['sort_order'], (int) $pv['is_active'],
                        ]);
                        $newVarId = (int) $pdo->lastInsertId();
                        $bStmt = $pdo->prepare('SELECT option_value_id FROM variant_option_values WHERE variant_id = ?');
                        $bStmt->execute([(int) $pv['id']]);
                        foreach ($bStmt->fetchAll() as $b) {
                            $mappedVal = $valMap[(int) $b['option_value_id']] ?? null;
                            if ($mappedVal) {
                                $insBridge->execute([$newVarId, $mappedVal]);
                            }
                        }
                    }
                } catch (\Throwable $e) {}
            }
        }

        // 4b. Clonar product_combos
        try {
            $insCombo = $pdo->prepare('INSERT INTO product_combos (business_id, combo_product_id, component_product_id, quantity, sort_order) VALUES (?, ?, ?, ?, ?)');
            foreach ($prodMap as $oldPid => $newPid) {
                $cbStmt = $pdo->prepare('SELECT * FROM product_combos WHERE combo_product_id = ? AND business_id = ?');
                $cbStmt->execute([$oldPid, $srcBid]);
                foreach ($cbStmt->fetchAll() as $cb) {
                    $newComp = $prodMap[(int) $cb['component_product_id']] ?? null;
                    if ($newComp) {
                        $insCombo->execute([$dstBid, $newPid, $newComp, (float) $cb['quantity'], (int) ($cb['sort_order'] ?? 0)]);
                    }
                }
            }
        } catch (\Throwable $e) {}

        // 5. Clonar Salón (Áreas y Mesas/Barras)
        try {
            $areaMap = [];
            $aStmt = $pdo->prepare('SELECT * FROM table_areas WHERE business_id = ? ORDER BY sort_order, id');
            $aStmt->execute([$srcBid]);
            $areas = $aStmt->fetchAll();
            $insArea = $pdo->prepare('INSERT INTO table_areas (business_id, name, sort_order) VALUES (?, ?, ?)');

            if ($areas === []) {
                $insArea->execute([$dstBid, 'Salón Principal', 1]);
                $defaultAreaId = (int) $pdo->lastInsertId();
                $insTbl = $pdo->prepare('INSERT INTO tables (business_id, area_id, label, kind, capacity, shape, pos_x, pos_y, width, height, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)');
                $insTbl->execute([$dstBid, $defaultAreaId, 'Barra 1', 'bar', 6, 'rect', 80, 60, 180, 56]);
                $insTbl->execute([$dstBid, $defaultAreaId, 'Mesa 1', 'table', 4, 'square', 80, 160, 80, 80]);
                $insTbl->execute([$dstBid, $defaultAreaId, 'Mesa 2', 'table', 4, 'square', 200, 160, 80, 80]);
                $insTbl->execute([$dstBid, $defaultAreaId, 'Mesa 3', 'table', 2, 'round', 320, 160, 72, 72]);
            } else {
                foreach ($areas as $a) {
                    $insArea->execute([$dstBid, $a['name'], (int) $a['sort_order']]);
                    $areaMap[(int) $a['id']] = (int) $pdo->lastInsertId();
                }
                $tStmt = $pdo->prepare('SELECT * FROM tables WHERE business_id = ? AND is_active = 1');
                $tStmt->execute([$srcBid]);
                $insTbl = $pdo->prepare('
                    INSERT INTO tables (business_id, area_id, label, kind, capacity, shape, pos_x, pos_y, width, height, rotation, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                ');
                foreach ($tStmt->fetchAll() as $t) {
                    $newAreaId = $areaMap[(int) $t['area_id']] ?? reset($areaMap);
                    if ($newAreaId) {
                        $insTbl->execute([
                            $dstBid, $newAreaId, $t['label'], $t['kind'] ?? 'table',
                            (int) ($t['capacity'] ?? 4), $t['shape'] ?? 'square',
                            (int) ($t['pos_x'] ?? 60), (int) ($t['pos_y'] ?? 60),
                            (int) ($t['width'] ?? 80), (int) ($t['height'] ?? 80),
                            (int) ($t['rotation'] ?? 0),
                        ]);
                    }
                }
            }
        } catch (\Throwable $e) {}

        // 6. Empleados de prueba en Pizza Test (para que no herede ni ensucie los de Arrabbiata)
        try {
            StaffController::ensureSchema();
            $insP = $pdo->prepare('INSERT IGNORE INTO staff_people (business_id, code, name, role, settlement_type, is_active, notes) VALUES (?, ?, ?, ?, ?, 1, ?)');
            $insP->execute([$dstBid, 'test-cocina', 'Empleado Test Cocina', 'Empleado', 'Semanal', 'Perfil de prueba']);
            $p1 = (int) $pdo->lastInsertId();
            $insP->execute([$dstBid, 'test-salon', 'Empleada Test Salón', 'Empleada', 'Semanal', 'Perfil de prueba']);
            $p2 = (int) $pdo->lastInsertId();

            $insR = $pdo->prepare('INSERT INTO staff_rates (business_id, person_id, hourly_rate, valid_from, valid_to, reason) VALUES (?, ?, ?, "2026-01-01", NULL, "Tarifa inicial de prueba")');
            if ($p1 > 0) $insR->execute([$dstBid, $p1, 7500]);
            if ($p2 > 0) $insR->execute([$dstBid, $p2, 7500]);
        } catch (\Throwable $e) {}
    }
}
