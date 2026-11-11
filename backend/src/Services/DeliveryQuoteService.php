<?php
namespace Pizzalog\Services;

use Pizzalog\Core\Config;

/**
 * Cotización de envío por calles con Google Maps Routes API.
 *
 * No contiene tarifas por defecto: se reciben desde la configuración del
 * negocio. La clave de Google nunca sale del backend.
 */
final class DeliveryQuoteService
{
    public static function quote(
        string $originAddress,
        string $destinationAddress,
        float $baseFee,
        float $feePerKm
    ): array {
        $originAddress = trim($originAddress);
        $destinationAddress = trim($destinationAddress);

        if ($originAddress === '' || $destinationAddress === '') {
            throw new \DomainException('Necesitamos la dirección del local y la dirección de entrega para calcular el envío.');
        }
        if (!is_finite($baseFee) || !is_finite($feePerKm) || $baseFee < 0 || $feePerKm < 0) {
            throw new \DomainException('La tarifa de envío configurada no es válida.');
        }

        $google = Config::get('google_maps', []);
        $apiKey = trim((string) ($google['api_key'] ?? ''));
        if ($apiKey === '') {
            throw new \DomainException('El cálculo automático de envíos todavía no está habilitado. Contactanos para coordinar la entrega.');
        }

        $payload = json_encode([
            'origin' => ['address' => $originAddress],
            'destination' => ['address' => $destinationAddress],
            'travelMode' => 'DRIVE',
            'routingPreference' => 'TRAFFIC_UNAWARE',
            'units' => 'METRIC',
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        if ($payload === false) {
            throw new \DomainException('No pudimos preparar el cálculo del envío. Revisá la dirección e intentá de nuevo.');
        }

        $ch = curl_init('https://routes.googleapis.com/directions/v2:computeRoutes');
        if ($ch === false) {
            throw new \DomainException('El cálculo de rutas no está disponible en este momento.');
        }

        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'X-Goog-Api-Key: ' . $apiKey,
                'X-Goog-FieldMask: routes.distanceMeters',
            ],
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => max(3, min(15, (int) ($google['timeout'] ?? 8))),
        ]);

        $raw = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if (!is_string($raw) || $httpCode < 200 || $httpCode >= 300) {
            // No incluir la URL ni la clave en el error público.
            error_log('[delivery-routes] Google Routes failed; HTTP ' . $httpCode . '; ' . $curlError);
            throw new \DomainException('No pudimos calcular la ruta por calles. Revisá la dirección o intentá nuevamente.');
        }

        $data = json_decode($raw, true);
        $meters = $data['routes'][0]['distanceMeters'] ?? null;
        if (!is_numeric($meters) || (int) $meters <= 0) {
            throw new \DomainException('No encontramos una ruta válida para esa dirección. Revisala o contactanos para coordinar el envío.');
        }

        $distanceMeters = (int) $meters;
        $distanceKm = $distanceMeters / 1000;
        // Cada fracción de kilómetro se cobra como un kilómetro entero.
        $billableKm = (int) ceil($distanceMeters / 1000);
        $fee = round($baseFee + ($billableKm * $feePerKm), 2);

        return [
            'distance_meters' => $distanceMeters,
            'distance_km' => round($distanceKm, 3),
            'billable_km' => $billableKm,
            'delivery_fee' => $fee,
            'currency' => 'ARS',
        ];
    }
}
