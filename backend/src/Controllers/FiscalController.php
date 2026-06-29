<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Fiscal\FiscalException;
use Pizzalog\Fiscal\FiscalServiceFactory;
use Pizzalog\Repositories\FiscalRepository;

/**
 * Endpoints de facturación: administración de emisores (cuentas), emisión de
 * comprobantes y resumen de lo facturado por cada emisor.
 *
 * Emisores: solo admin. Comprobantes y resumen: admin/manager (ver rutas).
 */
class FiscalController
{
    private const CONDITIONS    = ['monotributo', 'responsable_inscripto', 'exento'];
    private const INVOICE_TYPES = ['A', 'B', 'C'];
    private const ENVIRONMENTS  = ['homologation', 'production'];
    private const DOC_TYPES     = ['CUIT', 'CUIL', 'DNI', 'CF'];

    private FiscalRepository $repo;

    public function __construct()
    {
        $this->repo = new FiscalRepository();
    }

    // ===== Emisores ===================================================

    /** GET /fiscal/issuers */
    public function issuersIndex(Request $req): void
    {
        $issuers = array_map([$this, 'issuerToPublic'], $this->repo->getAllIssuers((int) $req->auth['business_id']));
        Response::ok(['issuers' => $issuers]);
    }

    /** GET /fiscal/issuers/{id} */
    public function issuerShow(Request $req): void
    {
        $issuer = $this->repo->getIssuer((int) $req->auth['business_id'], (int) $req->param('id'));
        if (!$issuer) {
            Response::error('Emisor no encontrado', 404);
        }
        Response::ok(['issuer' => $this->issuerToPublic($issuer)]);
    }

    /** POST /fiscal/issuers */
    public function issuerStore(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $d   = $this->validateIssuer($req);

        if ($d['is_default']) {
            $this->repo->unsetDefaultIssuers($bid);
        }
        $id = $this->repo->createIssuer($bid, $d);

        Response::ok(['issuer' => $this->issuerToPublic($this->repo->getIssuer($bid, $id))], 201);
    }

    /** PUT /fiscal/issuers/{id} */
    public function issuerUpdate(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        if (!$this->repo->getIssuer($bid, $id)) {
            Response::error('Emisor no encontrado', 404);
        }

        $d = $this->validateIssuer($req);
        $d['is_active'] = (int) (bool) $req->input('is_active', true);

        if ($d['is_default']) {
            $this->repo->unsetDefaultIssuers($bid);
        }
        $this->repo->updateIssuer($bid, $id, $d);

        Response::ok(['issuer' => $this->issuerToPublic($this->repo->getIssuer($bid, $id))]);
    }

    /** DELETE /fiscal/issuers/{id} (baja lógica) */
    public function issuerDestroy(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        if (!$this->repo->getIssuer($bid, $id)) {
            Response::error('Emisor no encontrado', 404);
        }
        $this->repo->deactivateIssuer($bid, $id);
        Response::ok(['deleted' => true]);
    }

    // ===== Comprobantes ===============================================

    /**
     * POST /fiscal/invoices
     * Body: { sale_id, issuer_id, receptor?: { doc_type, doc_number } }
     */
    public function invoiceStore(Request $req): void
    {
        $bid     = (int) $req->auth['business_id'];
        $saleId  = (int) $req->input('sale_id', 0);
        $issuerId = (int) $req->input('issuer_id', 0);

        if ($saleId <= 0 || $issuerId <= 0) {
            Response::error('sale_id e issuer_id son obligatorios', 422);
        }
        if ($this->repo->hasIssuedForSale($bid, $saleId)) {
            Response::error('La venta ya tiene un comprobante emitido', 422);
        }

        $receptor = $this->validateReceptor($req->input('receptor', []));

        try {
            $invoice = FiscalServiceFactory::make()->issueForSale($bid, $issuerId, $saleId, $receptor);
        } catch (FiscalException $e) {
            // El comprobante queda registrado en estado 'error' para reintentar.
            Response::error($e->getMessage(), 422);
        }

        Response::ok(['invoice' => $invoice], 201);
    }

    /** GET /fiscal/invoices?issuer_id=&status=&from=&to=&limit=&offset= */
    public function invoicesIndex(Request $req): void
    {
        $invoices = $this->repo->listInvoices((int) $req->auth['business_id'], [
            'issuer_id' => $req->query['issuer_id'] ?? null,
            'status'    => $req->query['status'] ?? null,
            'from'      => $req->query['from'] ?? null,
            'to'        => $req->query['to'] ?? null,
            'limit'     => $req->query['limit'] ?? null,
            'offset'    => $req->query['offset'] ?? null,
        ]);
        Response::ok(['invoices' => $invoices]);
    }

    /** GET /fiscal/invoices/{id} */
    public function invoiceShow(Request $req): void
    {
        $invoice = $this->repo->getInvoice((int) $req->auth['business_id'], (int) $req->param('id'));
        if (!$invoice) {
            Response::error('Comprobante no encontrado', 404);
        }
        Response::ok(['invoice' => $invoice]);
    }

    /** POST /fiscal/invoices/{id}/retry — reintenta uno en error */
    public function invoiceRetry(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');

        try {
            $invoice = FiscalServiceFactory::make()->retry($bid, $id);
        } catch (FiscalException $e) {
            Response::error($e->getMessage(), 422);
        }

        Response::ok(['invoice' => $invoice]);
    }

    /**
     * GET /fiscal/summary?from=&to=
     * Total facturado por cada emisor en el período (control de topes).
     */
    public function summary(Request $req): void
    {
        $bid  = (int) $req->auth['business_id'];
        $to   = $req->query['to']   ?? date('Y-m-d');
        $from = $req->query['from'] ?? date('Y-m-01'); // por defecto, mes en curso

        $rows = [];
        foreach ($this->repo->getActiveIssuers($bid) as $issuer) {
            $rows[] = [
                'issuer_id'    => (int) $issuer['id'],
                'name'         => $issuer['name'],
                'cuit'         => $issuer['cuit'],
                'total_issued' => $this->repo->issuedTotalByIssuer($bid, (int) $issuer['id'], $from, $to),
            ];
        }

        Response::ok(['from' => $from, 'to' => $to, 'by_issuer' => $rows]);
    }

    // ===== Helpers ====================================================

    private function validateIssuer(Request $req): array
    {
        $name = trim((string) $req->input('name', ''));
        if ($name === '') {
            Response::error('El nombre es obligatorio', 422);
        }

        $cuit = preg_replace('/\D+/', '', (string) $req->input('cuit', '')) ?? '';
        if (strlen($cuit) !== 11) {
            Response::error('El CUIT debe tener 11 dígitos', 422);
        }

        $condition = (string) $req->input('tax_condition', 'monotributo');
        if (!in_array($condition, self::CONDITIONS, true)) {
            Response::error('Condición fiscal inválida', 422);
        }

        $type = (string) $req->input('default_invoice_type', 'C');
        if (!in_array($type, self::INVOICE_TYPES, true)) {
            Response::error('Tipo de comprobante inválido', 422);
        }

        $pos = $req->input('point_of_sale');
        if (!is_numeric($pos) || (int) $pos <= 0) {
            Response::error('El punto de venta debe ser un número mayor a 0', 422);
        }

        $environment = (string) $req->input('environment', 'homologation');
        if (!in_array($environment, self::ENVIRONMENTS, true)) {
            Response::error('Ambiente inválido', 422);
        }

        return [
            'name'                 => $name,
            'cuit'                 => $cuit,
            'tax_condition'        => $condition,
            'default_invoice_type' => $type,
            'point_of_sale'        => (int) $pos,
            'cert_path'            => trim((string) $req->input('cert_path', '')) ?: null,
            'key_path'             => trim((string) $req->input('key_path', '')) ?: null,
            'environment'          => $environment,
            'is_default'           => (int) (bool) $req->input('is_default', false),
            'is_active'            => 1,
        ];
    }

    /** @return array{doc_type:string, doc_number:?string} */
    private function validateReceptor(mixed $receptor): array
    {
        if (!is_array($receptor)) {
            return ['doc_type' => 'CF', 'doc_number' => null];
        }
        $docType = (string) ($receptor['doc_type'] ?? 'CF');
        if (!in_array($docType, self::DOC_TYPES, true)) {
            Response::error('Tipo de documento del receptor inválido', 422);
        }
        $docNumber = trim((string) ($receptor['doc_number'] ?? '')) ?: null;

        if ($docType !== 'CF' && $docNumber === null) {
            Response::error('Falta el número de documento del receptor', 422);
        }
        return ['doc_type' => $docType, 'doc_number' => $docNumber];
    }

    private function issuerToPublic(array $i): array
    {
        return [
            'id'                   => (int) $i['id'],
            'name'                 => $i['name'],
            'cuit'                 => $i['cuit'],
            'tax_condition'        => $i['tax_condition'],
            'default_invoice_type' => $i['default_invoice_type'],
            'point_of_sale'        => (int) $i['point_of_sale'],
            'environment'          => $i['environment'],
            'is_active'            => (int) $i['is_active'],
            'is_default'           => (int) $i['is_default'],
            // No exponemos las rutas; solo si hay credencial cargada.
            'has_certificate'      => !empty($i['cert_path']) && !empty($i['key_path']),
        ];
    }
}
