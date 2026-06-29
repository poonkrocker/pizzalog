<?php
namespace Pizzalog\Core;

/**
 * JWT HS256 mínimo, sin librerías externas.
 * Suficiente y seguro para autenticación stateless si el secret es fuerte.
 */
class Jwt
{
    public static function encode(array $payload, string $secret, int $ttl, string $issuer): string
    {
        $header = ['alg' => 'HS256', 'typ' => 'JWT'];
        $now = time();
        $payload = array_merge($payload, [
            'iss' => $issuer,
            'iat' => $now,
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

    public static function decode(string $jwt, string $secret): ?array
    {
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) {
            return null;
        }
        [$h, $p, $s] = $parts;

        $expected = self::b64encode(hash_hmac('sha256', "$h.$p", $secret, true));
        if (!hash_equals($expected, $s)) {
            return null; // firma inválida
        }

        $payload = json_decode(self::b64decode($p), true);
        if (!is_array($payload)) {
            return null;
        }
        if (isset($payload['exp']) && time() >= (int) $payload['exp']) {
            return null; // token vencido
        }
        return $payload;
    }

    private static function b64encode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function b64decode(string $data): string
    {
        return (string) base64_decode(strtr($data, '-_', '+/'));
    }
}
