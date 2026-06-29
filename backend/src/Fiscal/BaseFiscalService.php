<?php
namespace Pizzalog\Fiscal;

use Pizzalog\Repositories\FiscalRepository;

/**
 * Lógica común a todos los motores de emisión. Resuelve emisor y venta,
 * calcula los importes, crea el comprobante en 'pending' y delega en
 * authorize() la obtención del CAE (real o simulado). Si authorize() falla,
 * el comprobante queda en 'error' para reintentar.
 */
abstract class BaseFiscalService implements FiscalService
{
    protected FiscalRepository $repo;

    public function __construct(?FiscalRepository $repo = null)
    {
        $this->repo = $repo ?? new FiscalRepository();
    }

    public function issueForSale(int $businessId, int $issuerId, int $saleId, array $receptor = []): array
    {
        $issuer = $this->repo->getIssuer($businessId, $issuerId);
        if (!$issuer || (int) $issuer['is_active'] !== 1) {
            throw new FiscalException('El emisor fiscal no existe o está inactivo');
        }

        $sale = $this->repo->getSaleTotals($businessId, $saleId);
        if (!$sale) {
            throw new FiscalException('La venta no existe');
        }
        if ($sale['status'] !== 'completed') {
            throw new FiscalException('Solo se pueden facturar ventas completadas');
        }

        $type = $issuer['default_invoice_type'];
        [$net, $iva, $total] = $this->computeAmounts((float) $sale['total'], $type);

        $docType   = $receptor['doc_type'] ?? 'CF';
        $docNumber = ($receptor['doc_number'] ?? '') !== '' ? (string) $receptor['doc_number'] : null;

        $invoiceId = $this->repo->createInvoice([
            'business_id'         => $businessId,
            'fiscal_issuer_id'    => $issuerId,
            'sale_id'             => $saleId,
            'invoice_type'        => $type,
            'point_of_sale'       => (int) $issuer['point_of_sale'],
            'receptor_doc_type'   => $docType,
            'receptor_doc_number' => $docNumber,
            'net_amount'          => $net,
            'iva_amount'          => $iva,
            'total'               => $total,
            'environment'         => $issuer['environment'],
        ]);

        try {
            $auth = $this->authorize($issuer, [
                'invoice_type'  => $type,
                'point_of_sale' => (int) $issuer['point_of_sale'],
                'net'           => $net,
                'iva'           => $iva,
                'total'         => $total,
                'doc_type'      => $docType,
                'doc_number'    => $docNumber,
            ]);
            $this->repo->markIssued($invoiceId, $auth['number'], $auth['cae'], $auth['cae_expiration']);
        } catch (FiscalException $e) {
            $this->repo->markError($invoiceId, $e->getMessage());
            throw $e;
        }

        return $this->repo->getInvoice($businessId, $invoiceId);
    }

    /**
     * Obtiene la autorización del comprobante.
     * @return array{number:int, cae:string, cae_expiration:string} (cae_expiration: YYYY-MM-DD)
     */
    abstract protected function authorize(array $issuer, array $comprobante): array;

    public function retry(int $businessId, int $invoiceId): array
    {
        $inv = $this->repo->getInvoice($businessId, $invoiceId);
        if (!$inv) {
            throw new FiscalException('El comprobante no existe');
        }
        if ($inv['status'] === 'issued') {
            throw new FiscalException('El comprobante ya fue emitido');
        }

        $issuer = $this->repo->getIssuer($businessId, $inv['fiscal_issuer_id']);
        if (!$issuer) {
            throw new FiscalException('El emisor fiscal no existe');
        }

        try {
            $auth = $this->authorize($issuer, [
                'invoice_type'  => $inv['invoice_type'],
                'point_of_sale' => $inv['point_of_sale'],
                'net'           => $inv['net_amount'],
                'iva'           => $inv['iva_amount'],
                'total'         => $inv['total'],
                'doc_type'      => $inv['receptor_doc_type'],
                'doc_number'    => $inv['receptor_doc_number'],
            ]);
            $this->repo->markIssued($invoiceId, $auth['number'], $auth['cae'], $auth['cae_expiration']);
        } catch (FiscalException $e) {
            $this->repo->markError($invoiceId, $e->getMessage());
            throw $e;
        }

        return $this->repo->getInvoice($businessId, $invoiceId);
    }

    /**
     * Descompone el total en neto + IVA según el tipo de comprobante.
     * Factura C (monotributo): no se discrimina IVA. A/B: IVA 21% incluido.
     * Es una aproximación; la parametrización fina la define el contador.
     *
     * @return array{0:float,1:float,2:float} [net, iva, total]
     */
    protected function computeAmounts(float $total, string $type): array
    {
        $total = round($total, 2);
        if ($type === 'C') {
            return [$total, 0.0, $total];
        }
        $net = round($total / 1.21, 2);
        return [$net, round($total - $net, 2), $total];
    }
}
