<?php

declare(strict_types=1);

namespace Pizzalog\Controllers;

use Pizzalog\Database;
use Pizzalog\Http\Request;
use Pizzalog\Http\Response;
use Pizzalog\Services\LoyverseMigrationService;

final class SalesReportController
{
    /**
     * GET /reports/sales/items
     * Ventas desglosadas por artículo.
     */
    public function byItem(Request $req): void
    {
        [$bid, $fromDt, $toDt, $timeFilter] = $this->ctx($req);
        $pdo = Database::pdo();

        $params = [$bid, $fromDt, $toDt];
        $whereExtra = '';

        $categoryId = isset($req->query['category_id']) && is_numeric($req->query['category_id']) && (int)$req->query['category_id'] > 0
            ? (int)$req->query['category_id']
            : null;
        if ($categoryId !== null) {
            $whereExtra .= ' AND p.category_id = ?';
            $params[] = $categoryId;
        }

        $productId = isset($req->query['product_id']) && is_numeric($req->query['product_id']) && (int)$req->query['product_id'] > 0
            ? (int)$req->query['product_id']
            : null;
        if ($productId !== null) {
            $whereExtra .= ' AND si.product_id = ?';
            $params[] = $productId;
        }

        $sql = "SELECT COALESCE(si.product_id, 0) AS product_id,
                       si.product_name,
                       MAX(COALESCE(c.name, 'Sin categoría')) AS category_name,
                       SUM(si.quantity) AS units,
                       SUM(si.line_total) AS gross_sales,
                       MAX(COALESCE(p.cost, 0)) AS unit_cost
                  FROM sale_items si
                  JOIN sales s ON s.id = si.sale_id
             LEFT JOIN products p ON p.id = si.product_id
             LEFT JOIN categories c ON c.id = p.category_id
                 WHERE s.business_id = ? AND s.status = 'completed'
                   AND s.created_at BETWEEN ? AND ? $timeFilter
                   AND si.product_name NOT LIKE 'Cobro compartido%'
                   $whereExtra
                 GROUP BY COALESCE(si.product_id, 0), si.product_name
                 ORDER BY gross_sales DESC";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $totalUnits = 0.0;
        $totalGross = 0.0;
        $totalCost  = 0.0;

        foreach ($rows as $r) {
            $totalUnits += (float)$r['units'];
            $totalGross += (float)$r['gross_sales'];
            $totalCost  += (float)$r['units'] * (float)$r['unit_cost'];
        }

        $items = array_map(static function (array $r) use ($totalGross): array {
            $units = (float)$r['units'];
            $gross = (float)$r['gross_sales'];
            $cost  = (float)$r['unit_cost'] * $units;
            $marginPct = $gross > 0 && (float)$r['unit_cost'] > 0
                ? round((($gross - $cost) / $gross) * 100, 1)
                : null;
            $sharePct = $totalGross > 0 ? round(($gross / $totalGross) * 100, 1) : 0.0;

            return [
                'product_id'    => (int)$r['product_id'],
                'product_name'  => (string)$r['product_name'],
                'category_name' => (string)$r['category_name'],
                'units'         => $units,
                'gross_sales'   => $gross,
                'cost'          => round($cost, 2),
                'margin_pct'    => $marginPct,
                'share_pct'     => $sharePct,
            ];
        }, $rows);

        Response::ok([
            'summary' => [
                'total_units' => round($totalUnits, 2),
                'total_gross' => round($totalGross, 2),
                'total_cost'  => round($totalCost, 2),
                'margin_pct'  => $totalGross > 0 && $totalCost > 0 ? round((($totalGross - $totalCost) / $totalGross) * 100, 1) : null,
                'items_count' => count($items),
            ],
            'items' => $items,
        ]);
    }

    /**
     * GET /reports/sales/categories
     * Ventas agrupadas por categoría.
     */
    public function byCategory(Request $req): void
    {
        [$bid, $fromDt, $toDt, $timeFilter] = $this->ctx($req);
        $pdo = Database::pdo();

        $params = [$bid, $fromDt, $toDt];
        $whereExtra = '';

        $categoryId = isset($req->query['category_id']) && is_numeric($req->query['category_id']) && (int)$req->query['category_id'] > 0
            ? (int)$req->query['category_id']
            : null;
        if ($categoryId !== null) {
            $whereExtra .= ' AND c.id = ?';
            $params[] = $categoryId;
        }

        $sql = "SELECT COALESCE(c.id, 0) AS category_id,
                       MAX(COALESCE(c.name, 'Sin categoría')) AS category_name,
                       SUM(si.quantity) AS units,
                       SUM(si.line_total) AS gross_sales
                  FROM sale_items si
                  JOIN sales s ON s.id = si.sale_id
             LEFT JOIN products p ON p.id = si.product_id
             LEFT JOIN categories c ON c.id = p.category_id
                 WHERE s.business_id = ? AND s.status = 'completed'
                   AND s.created_at BETWEEN ? AND ? $timeFilter
                   AND si.product_name NOT LIKE 'Cobro compartido%'
                   $whereExtra
                 GROUP BY COALESCE(c.id, 0)
                 ORDER BY gross_sales DESC";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $totalUnits = 0.0;
        $totalGross = 0.0;
        foreach ($rows as $r) {
            $totalUnits += (float)$r['units'];
            $totalGross += (float)$r['gross_sales'];
        }

        $categories = array_map(static function (array $r) use ($totalGross): array {
            $gross = (float)$r['gross_sales'];
            return [
                'category_id'   => (int)$r['category_id'],
                'category_name' => (string)$r['category_name'],
                'units'         => (float)$r['units'],
                'gross_sales'   => $gross,
                'share_pct'     => $totalGross > 0 ? round(($gross / $totalGross) * 100, 1) : 0.0,
            ];
        }, $rows);

        // Desglose de artículos cuando se filtra por categoría específica
        $items = [];
        if ($categoryId !== null) {
            $itemSql = "SELECT COALESCE(si.product_id, 0) AS product_id,
                               si.product_name,
                               SUM(si.quantity) AS units,
                               SUM(si.line_total) AS gross_sales
                          FROM sale_items si
                          JOIN sales s ON s.id = si.sale_id
                     LEFT JOIN products p ON p.id = si.product_id
                         WHERE s.business_id = ? AND s.status = 'completed'
                           AND s.created_at BETWEEN ? AND ? $timeFilter
                           AND p.category_id = ?
                           AND si.product_name NOT LIKE 'Cobro compartido%'
                         GROUP BY COALESCE(si.product_id, 0), si.product_name
                         ORDER BY gross_sales DESC";
            $itemStmt = $pdo->prepare($itemSql);
            $itemStmt->execute([$bid, $fromDt, $toDt, $categoryId]);
            $itemRows = $itemStmt->fetchAll();
            $catGross = $totalGross;
            $items = array_map(static function (array $r) use ($catGross): array {
                $gross = (float)$r['gross_sales'];
                return [
                    'product_id'   => (int)$r['product_id'],
                    'product_name' => (string)$r['product_name'],
                    'units'        => (float)$r['units'],
                    'gross_sales'  => $gross,
                    'share_pct'    => $catGross > 0 ? round(($gross / $catGross) * 100, 1) : 0.0,
                ];
            }, $itemRows);
        }

        Response::ok([
            'summary' => [
                'total_units' => round($totalUnits, 2),
                'total_gross' => round($totalGross, 2),
                'categories_count' => count($categories),
            ],
            'categories' => $categories,
            'items' => $items,
        ]);
    }

    /**
     * GET /reports/sales/employees
     * Ventas desglosadas por empleado / cajero.
     */
    public function byEmployee(Request $req): void
    {
        [$bid, $fromDt, $toDt, $timeFilter] = $this->ctx($req);
        $pdo = Database::pdo();

        $sql = "SELECT COALESCE(u.id, 0) AS user_id,
                       MAX(COALESCE(u.name, 'Sin asignar / Automático')) AS employee_name,
                       COUNT(DISTINCT s.id) AS tickets_count,
                       SUM(s.subtotal) AS gross_sales,
                       SUM(s.discount) AS discounts,
                       SUM(s.total) AS net_sales,
                       AVG(s.total) AS avg_ticket
                  FROM sales s
             LEFT JOIN users u ON u.id = s.user_id
                 WHERE s.business_id = ? AND s.status = 'completed'
                   AND s.created_at BETWEEN ? AND ? $timeFilter
                 GROUP BY COALESCE(u.id, 0)
                 ORDER BY net_sales DESC";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([$bid, $fromDt, $toDt]);
        $rows = $stmt->fetchAll();

        $totalTickets   = 0;
        $totalGross     = 0.0;
        $totalDiscounts = 0.0;
        $totalNet       = 0.0;

        foreach ($rows as $r) {
            $totalTickets   += (int)$r['tickets_count'];
            $totalGross     += (float)$r['gross_sales'];
            $totalDiscounts += (float)$r['discounts'];
            $totalNet       += (float)$r['net_sales'];
        }

        $employees = array_map(static function (array $r) use ($totalNet): array {
            $net = (float)$r['net_sales'];
            return [
                'user_id'       => (int)$r['user_id'],
                'employee_name' => (string)$r['employee_name'],
                'tickets_count' => (int)$r['tickets_count'],
                'gross_sales'   => (float)$r['gross_sales'],
                'discounts'     => (float)$r['discounts'],
                'net_sales'     => $net,
                'avg_ticket'    => round((float)$r['avg_ticket'], 2),
                'share_pct'     => $totalNet > 0 ? round(($net / $totalNet) * 100, 1) : 0.0,
            ];
        }, $rows);

        Response::ok([
            'summary' => [
                'total_tickets'   => $totalTickets,
                'total_gross'     => round($totalGross, 2),
                'total_discounts' => round($totalDiscounts, 2),
                'total_net'       => round($totalNet, 2),
                'avg_ticket'      => $totalTickets > 0 ? round($totalNet / $totalTickets, 2) : 0.0,
            ],
            'employees' => $employees,
        ]);
    }

    /**
     * GET /reports/sales/payments
     * Ventas desglosadas por método de pago.
     */
    public function byPayment(Request $req): void
    {
        [$bid, $fromDt, $toDt, $timeFilter] = $this->ctx($req);
        $pdo = Database::pdo();

        $sql = "SELECT s.payment_method,
                       COUNT(*) AS transactions_count,
                       SUM(s.total) AS total_amount
                  FROM sales s
                 WHERE s.business_id = ? AND s.status = 'completed'
                   AND s.created_at BETWEEN ? AND ? $timeFilter
                 GROUP BY s.payment_method
                 ORDER BY total_amount DESC";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([$bid, $fromDt, $toDt]);
        $rows = $stmt->fetchAll();

        $labels = [
            'cash'     => 'Efectivo',
            'card'     => 'Tarjeta de Débito / Crédito',
            'transfer' => 'Transferencia Bancaria',
            'mp'       => 'Mercado Pago / QR',
            'other'    => 'Otros medios de pago',
        ];

        $totalCount  = 0;
        $totalAmount = 0.0;
        foreach ($rows as $r) {
            $totalCount  += (int)$r['transactions_count'];
            $totalAmount += (float)$r['total_amount'];
        }

        $payments = array_map(static function (array $r) use ($labels, $totalAmount): array {
            $method = (string)$r['payment_method'];
            $amount = (float)$r['total_amount'];
            return [
                'payment_method'     => $method,
                'method_label'       => $labels[$method] ?? ucfirst($method),
                'transactions_count' => (int)$r['transactions_count'],
                'total_amount'       => $amount,
                'share_pct'          => $totalAmount > 0 ? round(($amount / $totalAmount) * 100, 1) : 0.0,
            ];
        }, $rows);

        Response::ok([
            'summary' => [
                'total_transactions' => $totalCount,
                'total_amount'       => round($totalAmount, 2),
            ],
            'payments' => $payments,
        ]);
    }

    /**
     * GET /reports/sales/discounts
     * Descuentos aplicados en ventas.
     */
    public function discounts(Request $req): void
    {
        [$bid, $fromDt, $toDt, $timeFilter] = $this->ctx($req);
        $pdo = Database::pdo();

        // 1) Totales
        $stmtTot = $pdo->prepare(
            "SELECT COUNT(*) AS total_discounted_sales,
                    COALESCE(SUM(s.discount), 0) AS total_discounts,
                    COALESCE(SUM(s.subtotal), 0) AS total_gross_discounted,
                    COALESCE(SUM(s.total), 0)    AS total_net_discounted
               FROM sales s
              WHERE s.business_id = ? AND s.status = 'completed'
                AND s.discount > 0
                AND s.created_at BETWEEN ? AND ? $timeFilter"
        );
        $stmtTot->execute([$bid, $fromDt, $toDt]);
        $tot = $stmtTot->fetch() ?: [];

        // 2) Listado de ventas con descuento
        $stmtList = $pdo->prepare(
            "SELECT s.id, s.sale_number, s.created_at, s.subtotal, s.discount, s.total,
                    s.payment_method, s.note,
                    COALESCE(u.name, 'Sistema') AS user_name
               FROM sales s
          LEFT JOIN users u ON u.id = s.user_id
              WHERE s.business_id = ? AND s.status = 'completed'
                AND s.discount > 0
                AND s.created_at BETWEEN ? AND ? $timeFilter
              ORDER BY s.created_at DESC
              LIMIT 250"
        );
        $stmtList->execute([$bid, $fromDt, $toDt]);
        $sales = array_map(static fn(array $r): array => [
            'id'             => (int)$r['id'],
            'sale_number'    => $r['sale_number'] !== null ? (int)$r['sale_number'] : null,
            'created_at'     => (string)$r['created_at'],
            'subtotal'       => (float)$r['subtotal'],
            'discount'       => (float)$r['discount'],
            'total'          => (float)$r['total'],
            'discount_pct'   => (float)$r['subtotal'] > 0 ? round(((float)$r['discount'] / (float)$r['subtotal']) * 100, 1) : 0.0,
            'payment_method' => (string)$r['payment_method'],
            'user_name'      => (string)$r['user_name'],
            'note'           => (string)($r['note'] ?? ''),
        ], $stmtList->fetchAll());

        Response::ok([
            'summary' => [
                'discounted_sales_count' => (int)($tot['total_discounted_sales'] ?? 0),
                'total_discounts'        => (float)($tot['total_discounts'] ?? 0.0),
                'total_gross_discounted' => (float)($tot['total_gross_discounted'] ?? 0.0),
                'total_net_discounted'   => (float)($tot['total_net_discounted'] ?? 0.0),
                'avg_discount_pct'       => (float)($tot['total_gross_discounted'] ?? 0) > 0
                    ? round(((float)$tot['total_discounts'] / (float)$tot['total_gross_discounted']) * 100, 1)
                    : 0.0,
            ],
            'sales' => $sales,
        ]);
    }

    /**
     * GET /reports/sales/taxes
     * Reporte impositivo / facturación electrónica.
     */
    public function taxes(Request $req): void
    {
        [$bid, $fromDt, $toDt, $timeFilter] = $this->ctx($req);
        $pdo = Database::pdo();

        // Total de ventas registradas
        $stmtSales = $pdo->prepare(
            "SELECT COUNT(*) AS total_sales,
                    COALESCE(SUM(total), 0) AS total_revenue
               FROM sales s
              WHERE s.business_id = ? AND s.status = 'completed'
                AND s.created_at BETWEEN ? AND ? $timeFilter"
        );
        $stmtSales->execute([$bid, $fromDt, $toDt]);
        $sSummary = $stmtSales->fetch() ?: ['total_sales' => 0, 'total_revenue' => 0.0];

        // Comprobantes emitidos en la tabla invoices
        $invoices = [];
        $totalInvoiced = 0.0;
        $totalNet = 0.0;
        $totalVat = 0.0;

        try {
            $stmtInv = $pdo->prepare(
                "SELECT invoice_type,
                        COUNT(*) AS invoices_count,
                        COALESCE(SUM(net_amount), 0)   AS net_amount,
                        COALESCE(SUM(vat_amount), 0)   AS vat_amount,
                        COALESCE(SUM(total_amount), 0) AS total_amount
                   FROM invoices
                  WHERE business_id = ? AND status = 'issued'
                    AND created_at BETWEEN ? AND ?
                  GROUP BY invoice_type"
            );
            $stmtInv->execute([$bid, $fromDt, $toDt]);
            foreach ($stmtInv->fetchAll() as $r) {
                $net = (float)$r['net_amount'];
                $vat = (float)$r['vat_amount'];
                $tot = (float)$r['total_amount'];
                $totalNet += $net;
                $totalVat += $vat;
                $totalInvoiced += $tot;
                $invoices[] = [
                    'invoice_type'   => (string)$r['invoice_type'],
                    'invoices_count' => (int)$r['invoices_count'],
                    'net_amount'     => $net,
                    'vat_amount'     => $vat,
                    'total_amount'   => $tot,
                ];
            }
        } catch (\PDOException) {
            // Tabla invoices vacía o sin registros
        }

        Response::ok([
            'summary' => [
                'total_sales_count' => (int)$sSummary['total_sales'],
                'total_revenue'     => (float)$sSummary['total_revenue'],
                'total_invoiced'    => $totalInvoiced,
                'total_taxed_net'   => $totalNet,
                'total_vat'         => $totalVat,
                'has_tax_breakdown' => count($invoices) > 0,
            ],
            'invoices_by_type' => $invoices,
        ]);
    }

    /**
     * Contexto común: negocio + rango de fechas + filtro horario opcional.
     * @return array{0:int, 1:string, 2:string, 3:string}
     */
    private function ctx(Request $req): array
    {
        LoyverseMigrationService::ensureMigrated();
        $bid  = (int)$req->auth['business_id'];
        $from = $req->query['from'] ?? date('Y-m-d', strtotime('-29 days'));
        $to   = $req->query['to']   ?? date('Y-m-d');

        $fromDt = $from . ' 00:00:00';
        $toDt   = $to . ' 23:59:59';

        $hourFrom = isset($req->query['hour_from']) && is_numeric($req->query['hour_from']) ? (int)$req->query['hour_from'] : null;
        $hourTo   = isset($req->query['hour_to']) && is_numeric($req->query['hour_to']) ? (int)$req->query['hour_to'] : null;

        $timeFilter = '';
        if ($hourFrom !== null && $hourTo !== null) {
            if ($hourFrom <= $hourTo) {
                $timeFilter = " AND HOUR(s.created_at) >= $hourFrom AND HOUR(s.created_at) < $hourTo";
            } else {
                $timeFilter = " AND (HOUR(s.created_at) >= $hourFrom OR HOUR(s.created_at) < $hourTo)";
            }
        }

        return [$bid, $fromDt, $toDt, $timeFilter];
    }
}
