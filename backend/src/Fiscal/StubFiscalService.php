<?php
namespace Pizzalog\Fiscal;

/**
 * Motor de prueba: simula la autorización sin hablar con ARCA. Permite
 * desarrollar y probar todo el flujo (endpoints, panel) sin certificados.
 *
 * Los comprobantes que genera NO tienen validez fiscal. Usar solo en
 * desarrollo (driver 'stub' en la config).
 */
class StubFiscalService extends BaseFiscalService
{
    protected function authorize(array $issuer, array $comprobante): array
    {
        $number = $this->repo->nextStubNumber(
            (int) $issuer['id'],
            (int) $comprobante['point_of_sale'],
            (string) $comprobante['invoice_type']
        );

        return [
            'number'         => $number,
            'cae'            => (string) mt_rand(70000000000000, 79999999999999),
            'cae_expiration' => date('Y-m-d', strtotime('+10 days')),
        ];
    }
}
