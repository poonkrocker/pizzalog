<?php
namespace Pizzalog\Fiscal;

/**
 * Contrato de emisión de comprobantes. El resto del sistema solo conoce esta
 * interfaz: pide "emitir el comprobante de esta venta con este emisor" y no
 * sabe nada de ARCA, WSAA ni WSFE. Eso mantiene la facturación desacoplada.
 */
interface FiscalService
{
    /**
     * Emite (o intenta emitir) un comprobante para una venta.
     *
     * @param array{doc_type?:string, doc_number?:string} $receptor
     * @return array el comprobante persistido (fila de invoices)
     * @throws FiscalException si el emisor/venta no son válidos o ARCA rechaza
     */
    public function issueForSale(int $businessId, int $issuerId, int $saleId, array $receptor = []): array;

    /**
     * Reintenta un comprobante que quedó en 'pending' o 'error'.
     * @return array el comprobante actualizado
     * @throws FiscalException
     */
    public function retry(int $businessId, int $invoiceId): array;
}
