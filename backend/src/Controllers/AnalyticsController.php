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
        $pdo = Database::pdo();

        $stmt = $pdo->prepare(
            'SELECT COUNT(*)                 AS sales_count,
                    COALESCE(SUM(total), 0)    AS revenue,
                    COALESCE(SUM(discount), 0) AS discounts,
                    COALESCE(AVG(total), 0)    AS avg_ticket
               FROM sales
              WHERE business_id = ? AND status = "completed"
                AND created_at BETWEEN ? AND ?'
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
                AND s.created_at BETWEEN ? AND ?'
        );
        $stmt->execute([$bid, $fromDt, $toDt]);
        $units = (float) $stmt->fetchColumn();

        // Desglose por canal y separación delivery vs mostrador.
        $stmt = $pdo->prepare(
            'SELECT channel, COUNT(*) AS c, COALESCE(SUM(total), 0) AS r
               FROM sales
              WHERE business_id = ? AND status = "completed"
                AND created_at BETWEEN ? AND ?
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
                AND s.created_at BETWEEN ? AND ?
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
     * GET /analytics/top-categories?from=YYYY-MM-DD&to=YYYY-MM-DD
     * Ranking por categoría (p. ej. cervezas), respetando unidades históricas
     * aunque el product_id no haya podido vincularse al catálogo.
     */
    public function topCategories(Request $req): void
    {
        [$bid, $fromDt, $toDt] = $this->ctx($req);
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
                AND s.created_at BETWEEN ? AND ?
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
                AND s.created_at BETWEEN ? AND ?
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
                 AND LOWER({$alias}.name) NOT LIKE '%mozzarella%' ";
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
                AND s.created_at BETWEEN ? AND ?'
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
                AND s.created_at BETWEEN ? AND ?'
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
        $pdo = Database::pdo();

        // 1) Combinaciones de productos comprados juntos en el mismo ticket/pedido
        $stmtProd = $pdo->prepare(
            'SELECT 
                LEAST(si1.product_id, si2.product_id) AS p1_id,
                GREATEST(si1.product_id, si2.product_id) AS p2_id,
                MAX(CASE WHEN si1.product_id <= si2.product_id THEN COALESCE(p1.name, si1.product_name) ELSE COALESCE(p2.name, si2.product_name) END) AS p1_name,
                MAX(CASE WHEN si1.product_id <= si2.product_id THEN COALESCE(p2.name, si2.product_name) ELSE COALESCE(p1.name, si1.product_name) END) AS p2_name,
                COUNT(DISTINCT s.id) AS pair_orders,
                SUM(si1.line_total + si2.line_total) AS total_revenue
             FROM sale_items si1
             JOIN sale_items si2 ON si1.sale_id = si2.sale_id AND si1.id < si2.id
             JOIN sales s ON s.id = si1.sale_id
             LEFT JOIN products p1 ON p1.id = si1.product_id
             LEFT JOIN products p2 ON p2.id = si2.product_id
             WHERE s.business_id = ? AND s.status = "completed"
               AND s.created_at BETWEEN ? AND ?
               AND si1.product_id IS NOT NULL AND si2.product_id IS NOT NULL
               AND si1.product_id != si2.product_id
             GROUP BY p1_id, p2_id
             ORDER BY pair_orders DESC, total_revenue DESC
             LIMIT 10'
        );
        $stmtProd->execute([$bid, $fromDt, $toDt]);
        $productCombinations = array_map(static fn(array $r): array => [
            'p1_id'         => (int) $r['p1_id'],
            'p2_id'         => (int) $r['p2_id'],
            'p1_name'       => $r['p1_name'] ?? 'Producto 1',
            'p2_name'       => $r['p2_name'] ?? 'Producto 2',
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
               AND s.created_at BETWEEN ? AND ?'
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

        Response::ok([
            'product_combinations'    => $productCombinations,
            'ingredient_combinations' => $ingredientCombinations,
        ]);
    }

    /**
     * GET /analytics/sales-over-time
     * Serie diaria para graficar la tendencia de facturación.
     */
    public function salesOverTime(Request $req): void
    {
        [$bid, $fromDt, $toDt] = $this->ctx($req);

        $stmt = Database::pdo()->prepare(
            'SELECT DATE(created_at) AS day,
                    COUNT(*)         AS sales_count,
                    SUM(total)       AS revenue
               FROM sales
              WHERE business_id = ? AND status = "completed"
                AND created_at BETWEEN ? AND ?
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

    // -----------------------------------------------------------------

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
