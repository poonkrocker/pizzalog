<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Services\LoyverseMigrationService;

/**
 * Tableros de control. Todas las consultas:
 *  - se limitan al negocio del token (multi-tenant);
 *  - consideran solo ventas 'completed' (las anuladas no cuentan);
 *  - usan el período from/to (por defecto, últimos 30 días).
 */
class AnalyticsController
{
    /**
     * GET /analytics/summary
     * Resumen del período: facturación, ventas, ticket promedio, unidades.
     */
    public function summary(Request $req): void
    {
        [$bid, $fromDt, $toDt, $from, $to] = $this->ctx($req);
        $timeFilter = $this->timeFilterSql($req, 's.created_at');
        $pdo = Database::pdo();

        $stmt = $pdo->prepare(
            'SELECT COUNT(*)                 AS sales_count,
                    COALESCE(SUM(total), 0)    AS revenue,
                    COALESCE(SUM(discount), 0) AS discounts,
                    COALESCE(AVG(total), 0)    AS avg_ticket
               FROM sales s
              WHERE s.business_id = ? AND s.status = "completed"
                AND s.created_at BETWEEN ? AND ?' . $timeFilter . ''
        );
        $stmt->execute([$bid, $fromDt, $toDt]);
        $s = $stmt->fetch();

        // Las líneas hijas de un combo (parent_sale_item_id) no son unidades
        // vendidas aparte: son lo que el combo incluye. No cuentan acá.
        $stmt = $pdo->prepare(
            'SELECT COALESCE(SUM(si.quantity), 0)
               FROM sale_items si
               JOIN sales s ON s.id = si.sale_id
              WHERE s.business_id = ? AND s.status = "completed"
                AND si.parent_sale_item_id IS NULL
                AND s.created_at BETWEEN ? AND ?' . $timeFilter . ''
        );
        $stmt->execute([$bid, $fromDt, $toDt]);
        $units = (float) $stmt->fetchColumn();

        // Desglose por canal y separación delivery vs mostrador.
        $stmt = $pdo->prepare(
            'SELECT s.channel, COUNT(*) AS c, COALESCE(SUM(s.total), 0) AS r
               FROM sales s
              WHERE s.business_id = ? AND s.status = "completed"
                AND s.created_at BETWEEN ? AND ?' . $timeFilter . '
              GROUP BY channel'
        );
        $stmt->execute([$bid, $fromDt, $toDt]);

        $byChannel = [];
        $delivery  = ['sales_count' => 0, 'revenue' => 0.0];
        $local     = ['sales_count' => 0, 'revenue' => 0.0];
        foreach ($stmt->fetchAll() as $r) {
            $count = (int) $r['c'];
            $rev   = (float) $r['r'];
            $byChannel[] = ['channel' => $r['channel'], 'sales_count' => $count, 'revenue' => $rev];
            $bucket = in_array($r['channel'], ['counter', 'takeaway', 'dine_in'], true) ? 'local' : 'delivery';
            ${$bucket}['sales_count'] += $count;
            ${$bucket}['revenue']     += $rev;
        }
        $local['revenue']    = round($local['revenue'], 2);
        $delivery['revenue'] = round($delivery['revenue'], 2);

        Response::ok(['summary' => [
            'from'        => $from,
            'to'          => $to,
            'sales_count' => (int) $s['sales_count'],
            'revenue'     => (float) $s['revenue'],
            'discounts'   => (float) $s['discounts'],
            'avg_ticket'  => round((float) $s['avg_ticket'], 2),
            'units_sold'  => $units,
            'by_channel'  => $byChannel,
            'delivery'    => $delivery,
            'local'       => $local,
        ]]);
    }

    /**
     * GET /analytics/top-products?limit=10
     * Lo que más se vende, por unidades y por facturación.
     *
     * Las líneas hijas de los combos SÍ cuentan acá: son la popularidad real
     * de cada sabor. No inflan la facturación porque entran con line_total 0.
     */
    public function topProducts(Request $req): void
    {
        [$bid, $fromDt, $toDt] = $this->ctx($req);
        $timeFilter = $this->timeFilterSql($req, 's.created_at');
        $limit = min(max((int) ($req->query['limit'] ?? 10), 1), 100);

        $stmt = Database::pdo()->prepare(
            'SELECT si.product_id,
                    MAX(COALESCE(p.name, si.product_name)) AS name,
                    MAX(c.name) AS category_name,
                    SUM(si.quantity)   AS units,
                    SUM(si.line_total) AS revenue
               FROM sale_items si
               JOIN sales s ON s.id = si.sale_id
          LEFT JOIN products p ON p.id = si.product_id
          LEFT JOIN categories c ON c.id = p.category_id
              WHERE s.business_id = ? AND s.status = "completed"
                AND si.product_name NOT LIKE "Cobro compartido%"
                AND s.created_at BETWEEN ? AND ?' . $timeFilter . '
              GROUP BY COALESCE(CAST(si.product_id AS CHAR), si.product_name)
              ORDER BY units DESC
              LIMIT ' . $limit
        );
        $stmt->execute([$bid, $fromDt, $toDt]);

        Response::ok(['products' => array_map(static fn(array $r): array => [
            'product_id' => $r['product_id'] !== null ? (int) $r['product_id'] : null,
            'name'       => $r['name'],
            'category_name' => $r['category_name'],
            'units'      => (float) $r['units'],
            'revenue'    => (float) $r['revenue'],
        ], $stmt->fetchAll())]);
    }

    /**
     * GET /analytics/category-leaders — producto más vendido en cada categoría.
     * No limita el catálogo a los primeros N productos globales.
     */
    public function categoryLeaders(Request $req): void
    {
        [$bid, $fromDt, $toDt] = $this->ctx($req);
        $timeFilter = $this->timeFilterSql($req, 's.created_at');
        $stmt = Database::pdo()->prepare(
            'SELECT COALESCE(c.id, 0) AS category_id,
                    COALESCE(c.name, "Sin categoría") AS category_name,
                    si.product_id,
                    MAX(COALESCE(p.name, si.product_name)) AS product_name,
                    SUM(si.quantity) AS units,
                    SUM(si.line_total) AS revenue
               FROM sale_items si
               JOIN sales s ON s.id = si.sale_id
          LEFT JOIN products p ON p.id = si.product_id
          LEFT JOIN categories c ON c.id = p.category_id
              WHERE s.business_id = ? AND s.status = "completed"
                AND si.product_name NOT LIKE "Cobro compartido%"
                AND s.created_at BETWEEN ? AND ?' . $timeFilter . '
              GROUP BY COALESCE(c.id, 0), COALESCE(c.name, "Sin categoría"),
                       COALESCE(CAST(si.product_id AS CHAR), si.product_name), si.product_id
              ORDER BY category_id, units DESC, revenue DESC'
        );
        $stmt->execute([$bid, $fromDt, $toDt]);
        $leaders = [];
        foreach ($stmt->fetchAll() as $r) {
            $categoryId = (int)$r['category_id'];
            if (isset($leaders[$categoryId])) {
                continue;
            }
            $leaders[$categoryId] = [
                'category_id' => $categoryId,
                'category_name' => $r['category_name'],
                'product_id' => $r['product_id'] !== null ? (int)$r['product_id'] : null,
                'product_name' => $r['product_name'],
                'units' => (float)$r['units'],
                'revenue' => (float)$r['revenue'],
            ];
        }
        Response::ok(['leaders' => array_values($leaders)]);
    }

    /**
     * GET /analytics/top-categories?from=YYYY-MM-DD&to=YYYY-MM-DD
     * Ranking por categoría (p. ej. cervezas), respetando unidades históricas
     * aunque el product_id no haya podido vincularse al catálogo.
     */
    public function topCategories(Request $req): void
    {
        [$bid, $fromDt, $toDt] = $this->ctx($req);
        $timeFilter = $this->timeFilterSql($req, 's.created_at');
        $limit = min(max((int) ($req->query['limit'] ?? 20), 1), 100);

        $stmt = Database::pdo()->prepare(
            'SELECT COALESCE(c.id, 0) AS category_id,
                    COALESCE(c.name, "Sin categoría") AS category_name,
                    COUNT(DISTINCT si.sale_id) AS sales_count,
                    SUM(si.quantity) AS units,
                    SUM(si.line_total) AS revenue
               FROM sale_items si
               JOIN sales s ON s.id = si.sale_id
          LEFT JOIN products p ON p.id = si.product_id
          LEFT JOIN categories c ON c.id = p.category_id
              WHERE s.business_id = ? AND s.status = "completed"
                AND si.product_name NOT LIKE "Cobro compartido%"
                AND s.created_at BETWEEN ? AND ?' . $timeFilter . '
              GROUP BY COALESCE(c.id, 0), COALESCE(c.name, "Sin categoría")
              ORDER BY units DESC, revenue DESC
              LIMIT ' . $limit
        );
        $stmt->execute([$bid, $fromDt, $toDt]);

        Response::ok(['categories' => array_map(static fn(array $r): array => [
            'category_id' => (int) $r['category_id'],
            'category_name' => $r['category_name'],
            'sales_count' => (int) $r['sales_count'],
            'units' => (float) $r['units'],
            'revenue' => (float) $r['revenue'],
        ], $stmt->fetchAll())]);
    }

    /**
     * GET /analytics/product-margins
     * Qué genera más GANANCIA (no lo mismo que lo más vendido).
     * profit = facturado − (costo actual × unidades vendidas).
     */
    public function productMargins(Request $req): void
    {
        [$bid, $fromDt, $toDt] = $this->ctx($req);
        $timeFilter = $this->timeFilterSql($req, 's.created_at');

        $stmt = Database::pdo()->prepare(
            'SELECT si.product_id,
                    MAX(COALESCE(p.name, si.product_name)) AS name,
                    p.cost AS unit_cost,
                    SUM(si.quantity)   AS units,
                    SUM(si.line_total) AS revenue,
                    SUM(si.line_total) - (p.cost * SUM(si.quantity)) AS profit
               FROM sale_items si
               JOIN sales s ON s.id = si.sale_id
               JOIN products p ON p.id = si.product_id
              WHERE s.business_id = ? AND s.status = "completed"
                AND si.parent_sale_item_id IS NULL
                AND s.created_at BETWEEN ? AND ?' . $timeFilter . '
              GROUP BY si.product_id, p.cost
              ORDER BY profit DESC'
        );
        $stmt->execute([$bid, $fromDt, $toDt]);

        Response::ok(['products' => array_map(static function (array $r): array {
            $revenue = (float) $r['revenue'];
            $profit  = (float) $r['profit'];
            return [
                'product_id' => (int) $r['product_id'],
                'name'       => $r['name'],
                'unit_cost'  => (float) $r['unit_cost'],
                'units'      => (float) $r['units'],
                'revenue'    => round($revenue, 2),
                'profit'     => round($profit, 2),
                'margin_pct' => $revenue > 0 ? round($profit / $revenue * 100, 1) : null,
                // Si no cargaste el costo, el margen no es confiable: lo avisamos.
                'has_cost'   => (float) $r['unit_cost'] > 0,
            ];
        }, $stmt->fetchAll())]);
    }

    /**
     * Filtro SQL para excluir los ingredientes básicos de la pizza (masa, salsa, muzza)
     * en los rankings de ingredientes más demandados y toppings ganadores.
     */
    private function excludeBasicPizzaIngredientsSql(string $alias = 'i'): string
    {
        return " AND {$alias}.category NOT IN ('masa', 'salsa')
                 AND LOWER({$alias}.name) NOT LIKE '%masa%'
                 AND LOWER({$alias}.name) NOT LIKE '%bollo%'
                 AND LOWER({$alias}.name) NOT LIKE '%salsa%'
                 AND LOWER({$alias}.name) NOT LIKE '%pomodoro%'
                 AND LOWER({$alias}.name) NOT LIKE '%muzza%'
                 AND LOWER({$alias}.name) NOT LIKE '%mozzarella%' 
                 AND LOWER({$alias}.name) NOT LIKE '%albahaca%'
                 AND LOWER({$alias}.name) NOT LIKE '%basil%' ";
    }

    /**
     * GET /analytics/ingredients?limit=20
     * EL diferencial: qué ingredientes prefiere la gente, por unidades
     * vendidas de las pizzas que los contienen, más un desglose por tipo.
     * Excluye básicos de la pizza: masa, salsa y muzzarella.
     */
    public function ingredients(Request $req): void
    {
        [$bid, $fromDt, $toDt] = $this->ctx($req);
        $timeFilter = $this->timeFilterSql($req, 's.created_at');
        $limit = min(max((int) ($req->query['limit'] ?? 20), 1), 100);
        $pdo = Database::pdo();
        $excludeSql = $this->excludeBasicPizzaIngredientsSql('i');

        $stmt = $pdo->prepare(
            'SELECT i.id, i.name, i.category,
                    SUM(si.quantity)           AS units,
                    COUNT(DISTINCT si.sale_id) AS sales_count
               FROM sale_items si
               JOIN sales s ON s.id = si.sale_id
               JOIN product_ingredients pi ON pi.product_id = si.product_id
               JOIN ingredients i ON i.id = pi.ingredient_id
              WHERE s.business_id = ? AND s.status = "completed"
                AND si.product_name NOT LIKE "Cobro compartido%"
                AND s.created_at BETWEEN ? AND ?' . $timeFilter . ''
              . $excludeSql .
            ' GROUP BY i.id, i.name, i.category
              ORDER BY units DESC
              LIMIT ' . $limit
        );
        $stmt->execute([$bid, $fromDt, $toDt]);
        $ingredients = array_map(static fn(array $r): array => [
            'id'          => (int) $r['id'],
            'name'        => $r['name'],
            'category'    => $r['category'],
            'units'       => (float) $r['units'],
            'sales_count' => (int) $r['sales_count'],
        ], $stmt->fetchAll());

        $stmt = $pdo->prepare(
            'SELECT i.category, SUM(si.quantity) AS units
               FROM sale_items si
               JOIN sales s ON s.id = si.sale_id
               JOIN product_ingredients pi ON pi.product_id = si.product_id
               JOIN ingredients i ON i.id = pi.ingredient_id
              WHERE s.business_id = ? AND s.status = "completed"
                AND si.product_name NOT LIKE "Cobro compartido%"
                AND s.created_at BETWEEN ? AND ?' . $timeFilter . ''
              . $excludeSql .
            ' GROUP BY i.category
              ORDER BY units DESC'
        );
        $stmt->execute([$bid, $fromDt, $toDt]);
        $byCategory = array_map(static fn(array $r): array => [
            'category' => $r['category'],
            'units'    => (float) $r['units'],
        ], $stmt->fetchAll());

        Response::ok([
            'ingredients' => $ingredients,
            'by_category' => $byCategory,
        ]);
    }

    /**
     * GET /analytics/winning-combinations
     * Combinaciones ganadoras:
     *  - de productos (cross-selling: productos que se compran juntos en un mismo pedido)
     *  - de ingredientes (sabores / toppings que co-ocurren con mayor frecuencia en las ventas,
     *    excluyendo masa, salsa y muzzarella).
     */
    public function winningCombinations(Request $req): void
    {
        [$bid, $fromDt, $toDt] = $this->ctx($req);
        $timeFilter = $this->timeFilterSql($req, 's.created_at');
        $pdo = Database::pdo();

        // 1) Combinaciones de productos comprados juntos en el mismo ticket/pedido
        $stmtProd = $pdo->prepare(
            'SELECT a.product_id AS p1_id, b.product_id AS p2_id,
                    MAX(a.product_name) AS p1_name,
                    MAX(b.product_name) AS p2_name,
                    MAX(a.category_name) AS p1_category_name,
                    MAX(b.category_name) AS p2_category_name,
                    COUNT(*) AS pair_orders,
                    SUM(a.line_revenue + b.line_revenue) AS total_revenue
               FROM (
                    SELECT si.sale_id, si.product_id,
                           MAX(COALESCE(p.name, si.product_name)) AS product_name,
                           MAX(COALESCE(cat.name, "")) AS category_name,
                           SUM(si.line_total) AS line_revenue
                      FROM sale_items si
                      JOIN sales s ON s.id = si.sale_id
                 LEFT JOIN products p ON p.id = si.product_id
                 LEFT JOIN categories cat ON cat.id = p.category_id
                     WHERE s.business_id = ? AND s.status = "completed"
                       AND s.created_at BETWEEN ? AND ?' . $timeFilter . '
                       AND si.parent_sale_item_id IS NULL
                       AND si.product_id IS NOT NULL
                     GROUP BY si.sale_id, si.product_id
               ) a
               JOIN (
                    SELECT si.sale_id, si.product_id,
                           MAX(COALESCE(p.name, si.product_name)) AS product_name,
                           MAX(COALESCE(cat.name, "")) AS category_name,
                           SUM(si.line_total) AS line_revenue
                      FROM sale_items si
                      JOIN sales s ON s.id = si.sale_id
                 LEFT JOIN products p ON p.id = si.product_id
                 LEFT JOIN categories cat ON cat.id = p.category_id
                     WHERE s.business_id = ? AND s.status = "completed"
                       AND s.created_at BETWEEN ? AND ?' . $timeFilter . '
                       AND si.parent_sale_item_id IS NULL
                       AND si.product_id IS NOT NULL
                     GROUP BY si.sale_id, si.product_id
               ) b ON b.sale_id = a.sale_id AND b.product_id > a.product_id
              GROUP BY a.product_id, b.product_id
             HAVING COUNT(*) > 1
              ORDER BY (
                 (LOWER(COALESCE(p1_category_name, "")) LIKE "%pizza%" OR LOWER(COALESCE(p1_category_name, "")) LIKE "%pizzer%")
                 AND (LOWER(COALESCE(p2_category_name, "")) LIKE "%pizza%" OR LOWER(COALESCE(p2_category_name, "")) LIKE "%pizzer%")
              ) DESC, pair_orders DESC, total_revenue DESC
              LIMIT 10'
        );
        $stmtProd->execute([$bid, $fromDt, $toDt, $bid, $fromDt, $toDt]);
        $productCombinations = array_map(static fn(array $r): array => [
            'p1_id'         => (int) $r['p1_id'],
            'p2_id'         => (int) $r['p2_id'],
            'p1_name'       => $r['p1_name'] ?? 'Producto 1',
            'p2_name'       => $r['p2_name'] ?? 'Producto 2',
            'p1_category_name' => $r['p1_category_name'] ?? '',
            'p2_category_name' => $r['p2_category_name'] ?? '',
            'pair_orders'   => (int) $r['pair_orders'],
            'total_revenue' => (float) $r['total_revenue'],
        ], $stmtProd->fetchAll());

        // 2) Combinaciones de ingredientes vendidos juntos (excluyendo masa, salsa y muzza)
        $excludeI1 = $this->excludeBasicPizzaIngredientsSql('i1');
        $excludeI2 = $this->excludeBasicPizzaIngredientsSql('i2');

        $stmtIng = $pdo->prepare(
            'SELECT 
                LEAST(i1.id, i2.id) AS i1_id,
                GREATEST(i1.id, i2.id) AS i2_id,
                MAX(CASE WHEN i1.id <= i2.id THEN i1.name ELSE i2.name END) AS i1_name,
                MAX(CASE WHEN i1.id <= i2.id THEN i2.name ELSE i1.name END) AS i2_name,
                MAX(CASE WHEN i1.id <= i2.id THEN i1.category ELSE i2.category END) AS i1_category,
                MAX(CASE WHEN i1.id <= i2.id THEN i2.category ELSE i1.category END) AS i2_category,
                COUNT(DISTINCT s.id) AS orders_count,
                SUM(si.quantity)     AS occurrences
             FROM sale_items si
             JOIN sales s ON s.id = si.sale_id
             JOIN product_ingredients pi1 ON pi1.product_id = si.product_id
             JOIN product_ingredients pi2 ON pi2.product_id = si.product_id AND pi1.ingredient_id < pi2.ingredient_id
             JOIN ingredients i1 ON i1.id = pi1.ingredient_id
             JOIN ingredients i2 ON i2.id = pi2.ingredient_id
             WHERE s.business_id = ? AND s.status = "completed"
               AND s.created_at BETWEEN ? AND ?' . $timeFilter . ''
             . $excludeI1
             . $excludeI2 .
            ' GROUP BY i1_id, i2_id
             ORDER BY occurrences DESC, orders_count DESC
             LIMIT 12'
        );
        $stmtIng->execute([$bid, $fromDt, $toDt]);
        $ingredientCombinations = array_map(static fn(array $r): array => [
            'i1_id'        => (int) $r['i1_id'],
            'i2_id'        => (int) $r['i2_id'],
            'i1_name'      => $r['i1_name'],
            'i2_name'      => $r['i2_name'],
            'i1_category'  => $r['i1_category'],
            'i2_category'  => $r['i2_category'],
            'orders_count' => (int) $r['orders_count'],
            'occurrences'  => (float) $r['occurrences'],
        ], $stmtIng->fetchAll());

        // 3) Tríos de productos por ticket. Normalizamos los ids en PHP para
        // agrupar los tríos independientemente del orden de las líneas.
        $stmtTriples = $pdo->prepare(
            'SELECT a.sale_id, a.product_id AS id1, b.product_id AS id2, c.product_id AS id3,
                    a.line_revenue + b.line_revenue + c.line_revenue AS trio_revenue
               FROM (
                    SELECT si.sale_id, si.product_id, SUM(si.line_total) AS line_revenue
                      FROM sale_items si
                      JOIN sales s ON s.id = si.sale_id
                     WHERE s.business_id = ? AND s.status = "completed"
                       AND s.created_at BETWEEN ? AND ?' . $timeFilter . '
                       AND si.parent_sale_item_id IS NULL AND si.product_id IS NOT NULL
                     GROUP BY si.sale_id, si.product_id
               ) a
               JOIN (
                    SELECT si.sale_id, si.product_id, SUM(si.line_total) AS line_revenue
                      FROM sale_items si
                      JOIN sales s ON s.id = si.sale_id
                     WHERE s.business_id = ? AND s.status = "completed"
                       AND s.created_at BETWEEN ? AND ?' . $timeFilter . '
                       AND si.parent_sale_item_id IS NULL AND si.product_id IS NOT NULL
                     GROUP BY si.sale_id, si.product_id
               ) b ON b.sale_id = a.sale_id AND b.product_id > a.product_id
               JOIN (
                    SELECT si.sale_id, si.product_id, SUM(si.line_total) AS line_revenue
                      FROM sale_items si
                      JOIN sales s ON s.id = si.sale_id
                     WHERE s.business_id = ? AND s.status = "completed"
                       AND s.created_at BETWEEN ? AND ?' . $timeFilter . '
                       AND si.parent_sale_item_id IS NULL AND si.product_id IS NOT NULL
                     GROUP BY si.sale_id, si.product_id
               ) c ON c.sale_id = b.sale_id AND c.product_id > b.product_id'
        );
        $stmtTriples->execute([$bid, $fromDt, $toDt, $bid, $fromDt, $toDt, $bid, $fromDt, $toDt]);
        $trioStats = [];
        foreach ($stmtTriples->fetchAll() as $r) {
            $ids = [(int)$r['id1'], (int)$r['id2'], (int)$r['id3']];
            sort($ids);
            $key = implode(':', $ids);
            if (!isset($trioStats[$key])) {
                $trioStats[$key] = ['ids' => $ids, 'sales' => [], 'revenue' => 0.0];
            }
            $trioStats[$key]['sales'][(int)$r['sale_id']] = true;
            $trioStats[$key]['revenue'] += (float)$r['trio_revenue'];
        }
        uasort($trioStats, static fn(array $a, array $b): int =>
            (count($b['sales']) <=> count($a['sales'])) ?: ($b['revenue'] <=> $a['revenue'])
        );
        $productTriples = [];
        // Mostrar solo tríos que se repiten en al menos dos tickets distintos.
        $trioStats = array_filter($trioStats, static fn(array $trio): bool => count($trio['sales']) > 1);
        foreach (array_slice($trioStats, 0, 12) as $trio) {
            $ids = $trio['ids'];
            $namesStmt = $pdo->prepare('SELECT id, name FROM products WHERE id IN (?, ?, ?) AND business_id = ?');
            $namesStmt->execute([$ids[0], $ids[1], $ids[2], $bid]);
            $names = [];
            foreach ($namesStmt->fetchAll() as $n) $names[(int)$n['id']] = $n['name'];
            $productTriples[] = [
                'p1_id' => $ids[0], 'p2_id' => $ids[1], 'p3_id' => $ids[2],
                'p1_name' => $names[$ids[0]] ?? 'Producto',
                'p2_name' => $names[$ids[1]] ?? 'Producto',
                'p3_name' => $names[$ids[2]] ?? 'Producto',
                'triple_orders' => count($trio['sales']),
                'total_revenue' => (float)$trio['revenue'],
            ];
        }

        Response::ok([
            'product_combinations'    => $productCombinations,
            'product_triples'         => $productTriples,
            'ingredient_combinations' => $ingredientCombinations,
        ]);
    }

 
    /**
     * Preferencias analíticas por negocio: presets de horarios y selección actual.
     * La tabla se administra mediante migration_026_analytics_preferences.sql.
     */
    public function timePreferences(Request $req): void
    {
        $bid = (int)$req->auth['business_id'];
        $stmt = Database::pdo()->prepare('SELECT settings_json FROM analytics_preferences WHERE business_id = ? LIMIT 1');
        $stmt->execute([$bid]);
        $raw = $stmt->fetchColumn();
        $defaults = [
            'selected_preset' => 'all',
            'presets' => [
                'midday' => ['weekdays' => [1, 2, 3, 4], 'start_hour' => 11, 'end_hour' => 16],
                'night' => ['weekdays' => [3, 4, 5, 6], 'start_hour' => 20, 'end_hour' => 2],
            ],
        ];
        $saved = is_string($raw) ? json_decode($raw, true) : null;
        Response::ok(['preferences' => is_array($saved) ? array_replace_recursive($defaults, $saved) : $defaults]);
    }

    public function saveTimePreferences(Request $req): void
    {
        $bid = (int)$req->auth['business_id'];
        $raw = $req->input('preferences');
        if (!is_array($raw)) {
            Response::error('Las preferencias analíticas son inválidas.', 422);
        }
        $selected = (string)($raw['selected_preset'] ?? 'all');
        if (!in_array($selected, ['all', 'midday', 'night'], true)) {
            Response::error('Preset de horario inválido.', 422);
        }
        $defaults = [
            'selected_preset' => $selected,
            'presets' => [
                'midday' => ['weekdays' => [1, 2, 3, 4], 'start_hour' => 11, 'end_hour' => 16],
                'night' => ['weekdays' => [3, 4, 5, 6], 'start_hour' => 20, 'end_hour' => 2],
            ],
        ];
        $json = json_encode($defaults, JSON_UNESCAPED_UNICODE);
        $stmt = Database::pdo()->prepare(
            'INSERT INTO analytics_preferences (business_id, settings_json) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json)'
        );
        $stmt->execute([$bid, $json]);
        Response::ok(['preferences' => $defaults]);
    }

    /**
     * GET /analytics/time-heatmap — distribución de ventas por día y hora local.
     * DAYOFWEEK de MySQL: 1 domingo ... 7 sábado.
     */
    public function timeHeatmap(Request $req): void
    {
        [$bid, $fromDt, $toDt] = $this->ctx($req);
        $timeFilter = $this->timeFilterSql($req, 'created_at');
        $stmt = Database::pdo()->prepare(
            'SELECT DAYOFWEEK(created_at) AS weekday, HOUR(created_at) AS hour,
                    COUNT(*) AS sales_count, COALESCE(SUM(total), 0) AS revenue
               FROM sales
              WHERE business_id = ? AND status = "completed"
                AND created_at BETWEEN ? AND ?' . $timeFilter . '
              GROUP BY DAYOFWEEK(created_at), HOUR(created_at)
              ORDER BY weekday, hour'
        );
        $stmt->execute([$bid, $fromDt, $toDt]);
        Response::ok(['cells' => array_map(static fn(array $r): array => [
            'weekday' => ((int)$r['weekday'] + 5) % 7,
            'hour' => (int)$r['hour'],
            'sales_count' => (int)$r['sales_count'],
            'revenue' => (float)$r['revenue'],
        ], $stmt->fetchAll())]);
    }

    /**
     * GET /analytics/sales-over-time
     * Serie diaria para graficar la tendencia de facturación.
     */
    public function salesOverTime(Request $req): void
    {
        [$bid, $fromDt, $toDt] = $this->ctx($req);
        $timeFilter = $this->timeFilterSql($req, 'created_at');

        $stmt = Database::pdo()->prepare(
            'SELECT DATE(created_at) AS day,
                    COUNT(*)         AS sales_count,
                    SUM(total)       AS revenue
               FROM sales
              WHERE business_id = ? AND status = "completed"
                AND created_at BETWEEN ? AND ?' . $timeFilter . '
              GROUP BY DATE(created_at)
              ORDER BY day'
        );
        $stmt->execute([$bid, $fromDt, $toDt]);

        Response::ok(['points' => array_map(static fn(array $r): array => [
            'day'         => $r['day'],
            'sales_count' => (int) $r['sales_count'],
            'revenue'     => (float) $r['revenue'],
        ], $stmt->fetchAll())]);
    }


    /**
     * GET /analytics/weekly-pizzas
     * Compara unidades de pizzas por semana (lunes-domingo) y lista su evolución.
     * Incorpora filtro horario independiente: "Mediodía" (11-16 hs), "Noche" (19-03 hs) o personalizado.
     * En el turno noche, las ventas entre 00:00 y 03:00 se atribuyen al día/semana del turno iniciado la noche anterior.
     */
    public function weeklyPizzas(Request $req): void
    {
        [$bid, $fromDt, $toDt] = $this->ctx($req);
        $pdo = Database::pdo();

        $startHour = null;
        $endHour   = null;

        $preset = (string)($req->query['hour_preset'] ?? '');
        if ($preset === 'midday') {
            $startHour = 11;
            $endHour   = 16;
        } elseif ($preset === 'night') {
            $startHour = 19;
            $endHour   = 3;
        } else {
            if (isset($req->query['start_hour']) && is_numeric($req->query['start_hour'])) {
                $startHour = (int)$req->query['start_hour'];
            }
            if (isset($req->query['end_hour']) && is_numeric($req->query['end_hour'])) {
                $endHour = (int)$req->query['end_hour'];
            }
        }

        $hourSql = '';
        $isOvernight = false;
        if ($startHour !== null && $endHour !== null) {
            if ($startHour <= $endHour) {
                $hourSql = " AND HOUR(s.created_at) >= $startHour AND HOUR(s.created_at) < $endHour";
            } else {
                $hourSql = " AND (HOUR(s.created_at) >= $startHour OR HOUR(s.created_at) < $endHour)";
                $isOvernight = true;
            }
        }

        // Si es turno nocturno que cruza medianoche, se resta 3 horas para agrupar ventas de madrugada
        // en la fecha de negocio y semana a la que pertenece el turno.
        $weekDateExpr = $isOvernight
            ? 'DATE_SUB(DATE(DATE_SUB(s.created_at, INTERVAL 3 HOUR)), INTERVAL WEEKDAY(DATE_SUB(s.created_at, INTERVAL 3 HOUR)) DAY)'
            : 'DATE_SUB(DATE(s.created_at), INTERVAL WEEKDAY(s.created_at) DAY)';

        $sql = "SELECT $weekDateExpr AS week_start,
                       si.product_id,
                       MAX(COALESCE(p.name, si.product_name)) AS product_name,
                       SUM(si.quantity) AS units,
                       SUM(si.line_total) AS revenue,
                       COUNT(DISTINCT si.sale_id) AS tickets
                  FROM sale_items si
                  JOIN sales s ON s.id = si.sale_id
             LEFT JOIN products p ON p.id = si.product_id
             LEFT JOIN categories c ON c.id = p.category_id
                 WHERE s.business_id = ? AND s.status = 'completed'
                   AND s.created_at BETWEEN ? AND ? $hourSql
                   AND si.product_name NOT LIKE 'Cobro compartido%'
                   AND (
                     LOWER(COALESCE(c.name, '')) LIKE '%pizza%'
                     OR LOWER(COALESCE(c.name, '')) LIKE '%pizzer%'
                     OR LOWER(COALESCE(p.name, si.product_name)) LIKE '%pizza%'
                     OR LOWER(COALESCE(p.name, si.product_name)) LIKE '%fugazz%'
                     OR LOWER(COALESCE(p.name, si.product_name)) LIKE '%muzza%'
                     OR LOWER(COALESCE(p.name, si.product_name)) LIKE '%napolitana%'
                     OR LOWER(COALESCE(p.name, si.product_name)) LIKE '%calabresa%'
                     OR LOWER(COALESCE(p.name, si.product_name)) LIKE '%margherita%'
                     OR LOWER(COALESCE(p.name, si.product_name)) LIKE '%margarita%'
                     OR LOWER(COALESCE(p.name, si.product_name)) LIKE '%arrabbiata%'
                     OR LOWER(COALESCE(p.name, si.product_name)) LIKE '%cipollina%'
                     OR LOWER(COALESCE(p.name, si.product_name)) LIKE '%pineta%'
                     OR LOWER(COALESCE(p.name, si.product_name)) LIKE '%quattro%'
                     OR LOWER(COALESCE(p.name, si.product_name)) LIKE '%cuore%'
                     OR LOWER(COALESCE(p.name, si.product_name)) LIKE '%plantasia%'
                     OR LOWER(COALESCE(p.name, si.product_name)) LIKE '%marinara%'
                     OR LOWER(COALESCE(p.name, si.product_name)) LIKE '%calzone%'
                     OR LOWER(COALESCE(p.name, si.product_name)) LIKE '%romana%'
                     OR LOWER(COALESCE(p.name, si.product_name)) LIKE '%roquefort%'
                     OR LOWER(COALESCE(p.name, si.product_name)) LIKE '%provolone%'
                     OR LOWER(COALESCE(p.name, si.product_name)) LIKE '%especial%'
                   )
                 GROUP BY week_start, COALESCE(CAST(si.product_id AS CHAR), si.product_name)
                 ORDER BY week_start ASC, units DESC";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([$bid, $fromDt, $toDt]);

        $weekly = [];
        $productTotals = [];
        foreach ($stmt->fetchAll() as $r) {
            $week = (string)$r['week_start'];
            $key = $r['product_id'] !== null ? 'id:' . (int)$r['product_id'] : 'name:' . mb_strtolower((string)$r['product_name']);
            if (!isset($weekly[$week])) {
                $weekly[$week] = ['week_start' => $week, 'week_end' => date('Y-m-d', strtotime($week . ' +6 days')), 'units' => 0.0, 'revenue' => 0.0, 'tickets' => 0, 'products' => []];
            }
            $product = [
                'product_id' => $r['product_id'] !== null ? (int)$r['product_id'] : null,
                'name'       => (string)$r['product_name'],
                'units'      => (float)$r['units'],
                'revenue'    => (float)$r['revenue'],
                'tickets'    => (int)$r['tickets'],
            ];
            $weekly[$week]['units']   += $product['units'];
            $weekly[$week]['revenue'] += $product['revenue'];
            $weekly[$week]['tickets'] += $product['tickets'];
            $weekly[$week]['products'][] = $product;

            if (!isset($productTotals[$key])) {
                $productTotals[$key] = ['product_id' => $product['product_id'], 'name' => $product['name'], 'units' => 0.0, 'revenue' => 0.0, 'tickets' => 0, 'weeks' => []];
            }
            $productTotals[$key]['units']   += $product['units'];
            $productTotals[$key]['revenue'] += $product['revenue'];
            $productTotals[$key]['tickets'] += $product['tickets'];
            $productTotals[$key]['weeks'][$week] = $product['units'];
        }

        $weeks = array_values($weekly);
        usort($weeks, static fn(array $a, array $b): int => strcmp($a['week_start'], $b['week_start']));
        $bestWeek = null;
        foreach ($weeks as $week) {
            if ($bestWeek === null || $week['units'] > $bestWeek['units']) $bestWeek = $week;
            usort($week['products'], static fn(array $a, array $b): int => $b['units'] <=> $a['units']);
        }
        $products = array_values(array_map(static function (array $p): array {
            $series = $p['weeks'];
            unset($p['weeks']);
            $values = array_values($series);
            $first = $values[0] ?? 0;
            $last = $values[count($values) - 1] ?? 0;
            $p['weekly_units'] = $series;
            $p['change_pct'] = $first > 0 ? round(($last - $first) / $first * 100, 1) : null;
            return $p;
        }, $productTotals));
        usort($products, static fn(array $a, array $b): int => $b['units'] <=> $a['units']);

        Response::ok([
            'weeks'     => $weeks,
            'products'  => array_slice($products, 0, 30),
            'best_week' => $bestWeek,
        ]);
    }

    /**
     * GET /analytics/product-trends?product_ids=1,2,3&from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=day|week
     * Tendencia lineal de unidades vendidas en el tiempo para comparar múltiples productos.
     */
    public function productTrends(Request $req): void
    {
        [$bid, $fromDt, $toDt, $from, $to] = $this->ctx($req);
        $pdo = Database::pdo();

        $rawIds = $req->query['product_ids'] ?? '';
        $productIds = [];
        if (is_array($rawIds)) {
            $productIds = array_values(array_unique(array_filter(array_map('intval', $rawIds))));
        } elseif (is_string($rawIds) && trim($rawIds) !== '') {
            $productIds = array_values(array_unique(array_filter(array_map('intval', explode(',', $rawIds)))));
        }

        // Si no se pasaron IDs, seleccionar automáticamente los top 3 productos más vendidos en el período
        if (empty($productIds)) {
            $topStmt = $pdo->prepare(
                'SELECT si.product_id
                   FROM sale_items si
                   JOIN sales s ON s.id = si.sale_id
                  WHERE s.business_id = ? AND s.status = "completed"
                    AND s.created_at BETWEEN ? AND ?
                    AND si.product_id IS NOT NULL
                    AND si.product_name NOT LIKE "Cobro compartido%"
                  GROUP BY si.product_id
                  ORDER BY SUM(si.quantity) DESC
                  LIMIT 3'
            );
            $topStmt->execute([$bid, $fromDt, $toDt]);
            $productIds = array_map('intval', $topStmt->fetchAll(\PDO::FETCH_COLUMN));
        }

        if (empty($productIds)) {
            Response::ok([
                'granularity' => 'day',
                'labels'      => [],
                'series'      => [],
            ]);
            return;
        }

        // Determinar granularidad: día o semana
        $granularity = (string)($req->query['granularity'] ?? '');
        if ($granularity !== 'day' && $granularity !== 'week') {
            $diffDays = (strtotime($to) - strtotime($from)) / 86400;
            $granularity = $diffDays > 45 ? 'week' : 'day';
        }

        // Generar lista continua de buckets en el rango de fechas
        $labels = [];
        if ($granularity === 'day') {
            $curr = strtotime($from);
            $end  = strtotime($to);
            while ($curr <= $end) {
                $labels[] = date('Y-m-d', $curr);
                $curr = strtotime('+1 day', $curr);
            }
            $dateExpr = 'DATE(s.created_at)';
        } else {
            // Semanal (lunes como inicio de semana)
            $curr = strtotime('monday this week', strtotime($from));
            $end  = strtotime($to);
            while ($curr <= $end) {
                $labels[] = date('Y-m-d', $curr);
                $curr = strtotime('+1 week', $curr);
            }
            $dateExpr = 'DATE_SUB(DATE(s.created_at), INTERVAL WEEKDAY(s.created_at) DAY)';
        }

        // Cargar nombres de los productos
        $inPlaceholders = implode(',', array_fill(0, count($productIds), '?'));
        $namesStmt = $pdo->prepare("SELECT id, name FROM products WHERE id IN ($inPlaceholders) AND business_id = ?");
        $namesStmt->execute([...$productIds, $bid]);
        $productNames = [];
        foreach ($namesStmt->fetchAll() as $row) {
            $productNames[(int)$row['id']] = (string)$row['name'];
        }

        // Consultar unidades vendidas por producto y bucket
        $sql = "SELECT $dateExpr AS bucket,
                       si.product_id,
                       MAX(COALESCE(p.name, si.product_name)) AS prod_name,
                       SUM(si.quantity) AS units,
                       SUM(si.line_total) AS revenue
                  FROM sale_items si
                  JOIN sales s ON s.id = si.sale_id
             LEFT JOIN products p ON p.id = si.product_id
                 WHERE s.business_id = ? AND s.status = 'completed'
                   AND s.created_at BETWEEN ? AND ?
                   AND si.product_id IN ($inPlaceholders)
                 GROUP BY bucket, si.product_id
                 ORDER BY bucket ASC";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([$bid, $fromDt, $toDt, ...$productIds]);
        $rows = $stmt->fetchAll();

        // Mapear los datos a cada serie
        $seriesMap = [];
        foreach ($productIds as $pid) {
            $name = $productNames[$pid] ?? "Producto #$pid";
            $seriesMap[$pid] = [
                'product_id'    => $pid,
                'name'          => $name,
                'total_units'   => 0.0,
                'total_revenue' => 0.0,
                'points'        => array_fill_keys($labels, 0.0),
            ];
        }

        foreach ($rows as $r) {
            $pid = (int)$r['product_id'];
            $b   = (string)$r['bucket'];
            $u   = (float)$r['units'];
            $rev = (float)$r['revenue'];

            if (isset($seriesMap[$pid])) {
                $seriesMap[$pid]['total_units']   += $u;
                $seriesMap[$pid]['total_revenue'] += $rev;
                if (isset($seriesMap[$pid]['points'][$b])) {
                    $seriesMap[$pid]['points'][$b] += $u;
                }
            }
        }

        $series = [];
        foreach ($seriesMap as $s) {
            $series[] = [
                'product_id'    => $s['product_id'],
                'name'          => $s['name'],
                'total_units'   => round($s['total_units'], 2),
                'total_revenue' => round($s['total_revenue'], 2),
                'data'          => array_values($s['points']),
            ];
        }

        Response::ok([
            'granularity' => $granularity,
            'labels'      => $labels,
            'series'      => $series,
        ]);
    }

    /**
     * GET /analytics/products-list
     * Lista de productos con ventas para el selector de comparación.
     */
    public function productsList(Request $req): void
    {
        $bid = (int)$req->auth['business_id'];
        $pdo = Database::pdo();

        $stmt = $pdo->prepare(
            'SELECT p.id, p.name, COALESCE(c.name, "Sin categoría") AS category_name,
                    COALESCE(SUM(si.quantity), 0) AS total_units_sold
               FROM products p
          LEFT JOIN categories c ON c.id = p.category_id
          LEFT JOIN sale_items si ON si.product_id = p.id
              WHERE p.business_id = ?
              GROUP BY p.id, p.name, c.name
              ORDER BY total_units_sold DESC, p.name ASC'
        );
        $stmt->execute([$bid]);

        $products = array_map(static fn(array $r): array => [
            'id'               => (int)$r['id'],
            'name'             => (string)$r['name'],
            'category_name'    => (string)$r['category_name'],
            'total_units_sold' => (float)$r['total_units_sold'],
        ], $stmt->fetchAll());

        Response::ok(['products' => $products]);
    }

    // -----------------------------------------------------------------

    /**
     * Filtro horario común para todas las métricas.
     * Mediodía: martes-viernes 11:00–15:59.
     * Noche: jueves-domingo desde las 20:00 y madrugada hasta las 01:59
     * del día siguiente, incluyendo el cruce de medianoche.
     */
    private function timeFilterSql(Request $req, string $column): string
    {
        $preset = (string)($req->query['time_preset'] ?? 'all');
        if ($preset === 'midday') {
            return " AND DAYOFWEEK($column) IN (3, 4, 5, 6) AND HOUR($column) >= 11 AND HOUR($column) < 16";
        }
        if ($preset === 'night') {
            return " AND ((HOUR($column) >= 20 AND DAYOFWEEK($column) IN (5, 6, 7, 1)) OR (HOUR($column) < 2 AND DAYOFWEEK($column) IN (6, 7, 1, 2)))";
        }
        return '';
    }

    /**
     * Contexto común: negocio + rango del período.
     * @return array{0:int, 1:string, 2:string, 3:string, 4:string}
     */
    private function ctx(Request $req): array
    {
        LoyverseMigrationService::ensureMigrated();
        $bid  = (int) $req->auth['business_id'];
        $to   = $req->query['to']   ?? date('Y-m-d');
        $from = $req->query['from'] ?? date('Y-m-d', strtotime('-29 days'));
        return [$bid, $from . ' 00:00:00', $to . ' 23:59:59', $from, $to];
    }
}
