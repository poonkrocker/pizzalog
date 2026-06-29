<?php
namespace Pizzalog\Repositories;

use Pizzalog\Core\Database;

/**
 * Persistencia del módulo fiscal: emisores (cuentas) y comprobantes.
 */
class FiscalRepository
{
    public function getIssuer(int $bid, int $issuerId): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, business_id, name, cuit, tax_condition, default_invoice_type,
                    point_of_sale, cert_path, key_path, environment, is_active, is_default
               FROM fiscal_issuers
              WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$issuerId, $bid]);
        return $stmt->fetch() ?: null;
    }

    /** Emisores activos del negocio (para elegir / alternar). */
    public function getActiveIssuers(int $bid): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, name, cuit, tax_condition, default_invoice_type, point_of_sale,
                    environment, is_default
               FROM fiscal_issuers
              WHERE business_id = ? AND is_active = 1
              ORDER BY is_default DESC, name'
        );
        $stmt->execute([$bid]);
        return $stmt->fetchAll();
    }

    /** Total facturado por un emisor en un período (para controlar topes). */
    public function issuedTotalByIssuer(int $bid, int $issuerId, string $fromDate, string $toDate): float
    {
        $stmt = Database::pdo()->prepare(
            'SELECT COALESCE(SUM(total), 0)
               FROM invoices
              WHERE business_id = ? AND fiscal_issuer_id = ?
                AND status = "issued"
                AND issued_at BETWEEN ? AND ?'
        );
        $stmt->execute([$bid, $issuerId, $fromDate . ' 00:00:00', $toDate . ' 23:59:59']);
        return (float) $stmt->fetchColumn();
    }

    public function getSaleTotals(int $bid, int $saleId): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, total, status FROM sales WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$saleId, $bid]);
        return $stmt->fetch() ?: null;
    }

    /** Crea el comprobante en estado 'pending' y devuelve su id. */
    public function createInvoice(array $d): int
    {
        $pdo  = Database::pdo();
        $stmt = $pdo->prepare(
            'INSERT INTO invoices
                (business_id, fiscal_issuer_id, sale_id, invoice_type, point_of_sale,
                 receptor_doc_type, receptor_doc_number, net_amount, iva_amount, total,
                 environment, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "pending")'
        );
        $stmt->execute([
            $d['business_id'], $d['fiscal_issuer_id'], $d['sale_id'], $d['invoice_type'],
            $d['point_of_sale'], $d['receptor_doc_type'], $d['receptor_doc_number'],
            $d['net_amount'], $d['iva_amount'], $d['total'], $d['environment'],
        ]);
        return (int) $pdo->lastInsertId();
    }

    public function markIssued(int $invoiceId, int $number, string $cae, string $caeExpiration): void
    {
        Database::pdo()->prepare(
            'UPDATE invoices
                SET status = "issued", number = ?, cae = ?, cae_expiration = ?, issued_at = NOW(),
                    error_message = NULL
              WHERE id = ?'
        )->execute([$number, $cae, $caeExpiration, $invoiceId]);
    }

    public function markError(int $invoiceId, string $message): void
    {
        Database::pdo()->prepare(
            'UPDATE invoices SET status = "error", error_message = ? WHERE id = ?'
        )->execute([mb_substr($message, 0, 500), $invoiceId]);
    }

    /** Próximo número correlativo para el modo stub (en real lo asigna ARCA). */
    public function nextStubNumber(int $issuerId, int $pointOfSale, string $type): int
    {
        $stmt = Database::pdo()->prepare(
            'SELECT COALESCE(MAX(number), 0) + 1
               FROM invoices
              WHERE fiscal_issuer_id = ? AND point_of_sale = ? AND invoice_type = ?
                AND status = "issued"'
        );
        $stmt->execute([$issuerId, $pointOfSale, $type]);
        return (int) $stmt->fetchColumn();
    }

    public function getInvoice(int $bid, int $invoiceId): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, business_id, fiscal_issuer_id, sale_id, invoice_type, point_of_sale,
                    number, receptor_doc_type, receptor_doc_number, net_amount, iva_amount,
                    total, cae, cae_expiration, issued_at, environment, status, error_message,
                    created_at
               FROM invoices
              WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$invoiceId, $bid]);
        $inv = $stmt->fetch();
        if (!$inv) {
            return null;
        }

        $inv['id']               = (int) $inv['id'];
        $inv['fiscal_issuer_id'] = (int) $inv['fiscal_issuer_id'];
        $inv['sale_id']          = $inv['sale_id'] !== null ? (int) $inv['sale_id'] : null;
        $inv['point_of_sale']    = (int) $inv['point_of_sale'];
        $inv['number']           = $inv['number'] !== null ? (int) $inv['number'] : null;
        foreach (['net_amount', 'iva_amount', 'total'] as $k) {
            $inv[$k] = (float) $inv[$k];
        }
        return $inv;
    }

    // --- Administración de emisores -----------------------------------

    /** Todos los emisores del negocio (activos e inactivos), para el panel. */
    public function getAllIssuers(int $bid): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, name, cuit, tax_condition, default_invoice_type, point_of_sale,
                    cert_path, key_path, environment, is_active, is_default
               FROM fiscal_issuers
              WHERE business_id = ?
              ORDER BY is_active DESC, is_default DESC, name'
        );
        $stmt->execute([$bid]);
        return $stmt->fetchAll();
    }

    public function createIssuer(int $bid, array $d): int
    {
        $pdo  = Database::pdo();
        $stmt = $pdo->prepare(
            'INSERT INTO fiscal_issuers
                (business_id, name, cuit, tax_condition, default_invoice_type, point_of_sale,
                 cert_path, key_path, environment, is_active, is_default)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)'
        );
        $stmt->execute([
            $bid, $d['name'], $d['cuit'], $d['tax_condition'], $d['default_invoice_type'],
            $d['point_of_sale'], $d['cert_path'], $d['key_path'], $d['environment'], $d['is_default'],
        ]);
        return (int) $pdo->lastInsertId();
    }

    public function updateIssuer(int $bid, int $id, array $d): void
    {
        Database::pdo()->prepare(
            'UPDATE fiscal_issuers
                SET name = ?, cuit = ?, tax_condition = ?, default_invoice_type = ?,
                    point_of_sale = ?, cert_path = ?, key_path = ?, environment = ?,
                    is_active = ?, is_default = ?
              WHERE id = ? AND business_id = ?'
        )->execute([
            $d['name'], $d['cuit'], $d['tax_condition'], $d['default_invoice_type'],
            $d['point_of_sale'], $d['cert_path'], $d['key_path'], $d['environment'],
            $d['is_active'], $d['is_default'], $id, $bid,
        ]);
    }

    public function deactivateIssuer(int $bid, int $id): void
    {
        Database::pdo()
            ->prepare('UPDATE fiscal_issuers SET is_active = 0, is_default = 0 WHERE id = ? AND business_id = ?')
            ->execute([$id, $bid]);
    }

    /** Quita la marca de default a todos (antes de fijar uno nuevo). */
    public function unsetDefaultIssuers(int $bid): void
    {
        Database::pdo()
            ->prepare('UPDATE fiscal_issuers SET is_default = 0 WHERE business_id = ?')
            ->execute([$bid]);
    }

    // --- Comprobantes -------------------------------------------------

    public function hasIssuedForSale(int $bid, int $saleId): bool
    {
        $stmt = Database::pdo()->prepare(
            'SELECT 1 FROM invoices WHERE business_id = ? AND sale_id = ? AND status = "issued" LIMIT 1'
        );
        $stmt->execute([$bid, $saleId]);
        return (bool) $stmt->fetch();
    }

    /** @param array{issuer_id?:int, status?:string, from?:string, to?:string, limit?:int, offset?:int} $f */
    public function listInvoices(int $bid, array $f): array
    {
        $where  = ['i.business_id = ?'];
        $params = [$bid];

        if (!empty($f['issuer_id'])) {
            $where[]  = 'i.fiscal_issuer_id = ?';
            $params[] = (int) $f['issuer_id'];
        }
        if (!empty($f['status'])) {
            $where[]  = 'i.status = ?';
            $params[] = $f['status'];
        }
        if (!empty($f['from'])) {
            $where[]  = 'i.created_at >= ?';
            $params[] = $f['from'] . ' 00:00:00';
        }
        if (!empty($f['to'])) {
            $where[]  = 'i.created_at <= ?';
            $params[] = $f['to'] . ' 23:59:59';
        }

        $limit  = min(max((int) ($f['limit'] ?? 100), 1), 500);
        $offset = max((int) ($f['offset'] ?? 0), 0);

        $sql = 'SELECT i.id, i.fiscal_issuer_id, fi.name AS issuer_name, i.sale_id,
                       i.invoice_type, i.point_of_sale, i.number, i.total, i.cae,
                       i.cae_expiration, i.issued_at, i.environment, i.status, i.created_at
                  FROM invoices i
             LEFT JOIN fiscal_issuers fi ON fi.id = i.fiscal_issuer_id
                 WHERE ' . implode(' AND ', $where) . '
                 ORDER BY i.created_at DESC
                 LIMIT ' . $limit . ' OFFSET ' . $offset;

        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);

        return array_map(static function (array $r): array {
            $r['id']               = (int) $r['id'];
            $r['fiscal_issuer_id'] = (int) $r['fiscal_issuer_id'];
            $r['sale_id']          = $r['sale_id'] !== null ? (int) $r['sale_id'] : null;
            $r['point_of_sale']    = (int) $r['point_of_sale'];
            $r['number']           = $r['number'] !== null ? (int) $r['number'] : null;
            $r['total']            = (float) $r['total'];
            return $r;
        }, $stmt->fetchAll());
    }
}
