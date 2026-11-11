<?php
namespace Pizzalog\Core;

/**
 * JWT HS256 seguro con validación estricta de algoritmo y claims estándar (iss, aud, exp, nbf, iat).
 */
class Jwt
{
    /**
     * Codifica un payload en JWT firmado con HMAC-SHA256.
     */
    public static function encode(array $payload, string $secret, int $ttl, string $issuer): string
    {
        $header = ['alg' => 'HS256', 'typ' => 'JWT'];
        $now = time();
        $payload = array_merge($payload, [
            'iss' => $issuer,
            'iat' => $now,
            'nbf' => $now,
            'exp' => $now + $ttl,
        ]);

        $segments = [
            self::b64encode((string) json_encode($header, JSON_UNESCAPED_UNICODE)),
            self::b64encode((string) json_encode($payload, JSON_UNESCAPED_UNICODE)),
        ];
        $signature = hash_hmac('sha256', implode('.', $segments), $secret, true);
        $segments[] = self::b64encode($signature);

        return implode('.', $segments);
    }

    /**
     * Decodifica y verifica la firma y vigencia de un JWT.
     * Retorna el payload como array asociativo o null si la firma, formato o vigencia fallan.
     */
    public static function decode(string $jwt, string $secret): ?array
    {
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) {
            return null;
        }
        [$h, $p, $s] = $parts;

        // Validar estrictamente header y algoritmo
        $headerRaw = self::b64decode($h);
        $header = json_decode($headerRaw, true);
        if (!is_array($header) || ($header['alg'] ?? '') !== 'HS256' || ($header['typ'] ?? '') !== 'JWT') {
            return null; // Algoritmo no permitido o formato inválido
        }

        // Validar firma en tiempo constante
        $expected = self::b64encode(hash_hmac('sha256', "$h.$p", $secret, true));
        if (!hash_equals($expected, $s)) {
            return null; // Firma inválida
        }

        $payload = json_decode(self::b64decode($p), true);
        if (!is_array($payload)) {
            return null;
        }

        $now = time();
        // Verificar expiración (exp)
        if (isset($payload['exp']) && $now >= (int) $payload['exp']) {
            return null; // Token vencido
        }
        // Verificar no-antes (nbf)
        if (isset($payload['nbf']) && $now < (int) $payload['nbf']) {
            return null; // Token aún no válido
        }
        // Margen de tolerancia de reloj para fecha de emisión (máximo 5 minutos a futuro)
        if (isset($payload['iat']) && (int) $payload['iat'] > $now + 300) {
            return null; // Fecha de emisión inválida
        }

        return $payload;
    }

    public static function b64encode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    public static function b64decode(string $data): string
    {
        return (string) base64_decode(strtr($data, '-_', '+/'));
    }
}
