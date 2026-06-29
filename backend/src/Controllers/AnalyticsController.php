<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

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

        $stmt = $pdo->prepare(
            'SELECT COALESCE(SUM(si.quantity), 0)
               FROM sale_items si
               JOIN sales s ON s.id = si.sale_id
              WHERE s.business_id = ? AND s.status = "completed"
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
            $bucket = $r['channel'] === 'counter' ? 'local' : 'delivery';
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
     */
    public function topProducts(Request $req): void
    {
        [$bid, $fromDt, $toDt] = $this->ctx($req);
        $limit = min(max((int) ($req->query['limit'] ?? 10), 1), 100);

        $stmt = Database::pdo()->prepare(
            'SELECT si.product_id,
                    MAX(COALESCE(p.name, si.product_name)) AS name,
                    SUM(si.quantity)   AS units,
                    SUM(si.line_total) AS revenue
               FROM sale_items si
               JOIN sales s ON s.id = si.sale_id
          LEFT JOIN products p ON p.id = si.product_id
              WHERE s.business_id = ? AND s.status = "completed"
                AND s.created_at BETWEEN ? AND ?
              GROUP BY si.product_id
              ORDER BY units DESC
              LIMIT ' . $limit
        );
        $stmt->execute([$bid, $fromDt, $toDt]);

        Response::ok(['products' => array_map(static fn(array $r): array => [
            'product_id' => $r['product_id'] !== null ? (int) $r['product_id'] : null,
            'name'       => $r['name'],
            'units'      => (float) $r['units'],
            'revenue'    => (float) $r['revenue'],
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
     * GET /analytics/ingredients?limit=20
     * EL diferencial: qué ingredientes prefiere la gente, por unidades
     * vendidas de las pizzas que los contienen, más un desglose por tipo.
     */
    public function ingredients(Request $req): void
    {
        [$bid, $fromDt, $toDt] = $this->ctx($req);
        $limit = min(max((int) ($req->query['limit'] ?? 20), 1), 100);
        $pdo = Database::pdo();

        $stmt = $pdo->prepare(
            'SELECT i.id, i.name, i.category,
                    SUM(si.quantity)           AS units,
                    COUNT(DISTINCT si.sale_id) AS sales_count
               FROM sale_items si
               JOIN sales s ON s.id = si.sale_id
               JOIN product_ingredients pi ON pi.product_id = si.product_id
               JOIN ingredients i ON i.id = pi.ingredient_id
              WHERE s.business_id = ? AND s.status = "completed"
                AND s.created_at BETWEEN ? AND ?
              GROUP BY i.id, i.name, i.category
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
                AND s.created_at BETWEEN ? AND ?
              GROUP BY i.category
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
        $bid  = (int) $req->auth['business_id'];
        $to   = $req->query['to']   ?? date('Y-m-d');
        $from = $req->query['from'] ?? date('Y-m-d', strtotime('-29 days'));
        return [$bid, $from . ' 00:00:00', $to . ' 23:59:59', $from, $to];
    }
}
