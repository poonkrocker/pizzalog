<?php
namespace Pizzalog\Fiscal;

/**
 * Motor real contra ARCA. ESQUELETO: el flujo está marcado paso a paso pero
 * la integración concreta queda pendiente, porque depende de tus trámites
 * (certificado, punto de venta) y de elegir una librería WSFEv1.
 *
 * Recomendación: NO implementar el SOAP de WSAA/WSFE a mano. Apoyarse en una
 * librería PHP probada (tipo Afip SDK / afip.php) que ya maneja la firma del
 * certificado, el ticket de acceso y los métodos del web service.
 */
class ArcaFiscalService extends BaseFiscalService
{
    protected function authorize(array $issuer, array $comprobante): array
    {
        // Paso 1 · WSAA — Autenticación.
        //   Con el certificado del emisor ($issuer['cert_path'] / ['key_path'])
        //   se firma un TRA y se llama a loginCms del WSAA para obtener el
        //   Ticket de Acceso (Token + Sign), válido ~12 h. Conviene cachearlo.
        //   La URL depende de $issuer['environment'] (homologación o producción).

        // Paso 2 · WSFEv1 — Próximo número.
        //   FECompUltimoAutorizado(point_of_sale, invoice_type) → último número
        //   autorizado; el nuevo comprobante es ese + 1.

        // Paso 3 · WSFEv1 — Solicitud del CAE.
        //   FECAESolicitar con CUIT del emisor, punto de venta, tipo, número,
        //   importes (neto/IVA/total), tipo y número de documento del receptor,
        //   condición frente al IVA, etc. La respuesta trae el CAE y su
        //   vencimiento, o un código de error a traducir a FiscalException.

        // Paso 4 · Devolver ['number', 'cae', 'cae_expiration'] para persistir.

        throw new FiscalException(
            'Integración con ARCA pendiente: falta enchufar la librería WSFEv1 '
            . 'y cargar el certificado del emisor. Mientras tanto, usá el driver "stub".'
        );
    }
}
