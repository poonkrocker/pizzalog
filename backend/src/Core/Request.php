<?php
namespace Pizzalog\Core;

/**
 * Representa la request entrante.
 * $auth lo completa el middleware de autenticación con los datos del token.
 */
class Request
{
    public string $method = 'GET';
    public string $path = '/';
    public array $query = [];
    public array $body = [];
    public array $params = [];   // parámetros de ruta, ej. {id}
    public array $headers = [];
    public ?array $auth = null;  // ['user_id' => , 'business_id' => , 'role' => ]
    public bool $postMaxExceeded = false;
    public int $contentLengthBytes = 0;
    public int $postMaxBytes = 0;

    public static function parseIniSizeToBytes(string $value): int
    {
        $trimmed = trim($value);
        if ($trimmed === '' || $trimmed === '-1') {
            return 0;
        }
        if (preg_match('/^(\d+)\s*([kmgtp])?b?$/i', $trimmed, $m)) {
            $num = (int) $m[1];
            $unit = strtolower($m[2] ?? '');
            return match ($unit) {
                'k' => $num * 1024,
                'm' => $num * 1024 * 1024,
                'g' => $num * 1024 * 1024 * 1024,
                't' => $num * 1024 * 1024 * 1024 * 1024,
                default => $num,
            };
        }
        return (int) $trimmed;
    }

    public static function capture(): self
    {
        $r = new self();
        $r->method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $uri = '/' . trim($uri, '/');
        $r->path = $uri === '' ? '/' : $uri;

        $r->query = $_GET;
        $r->headers = self::captureHeaders();
        $r->contentLengthBytes = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        $r->postMaxBytes = self::parseIniSizeToBytes((string) ini_get('post_max_size'));

        $raw = file_get_contents('php://input');
        if ($raw !== false && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $r->body = $decoded;
            }
        } elseif ($r->contentLengthBytes > 0 && $r->postMaxBytes > 0 && $r->contentLengthBytes > $r->postMaxBytes && empty($_POST)) {
            $r->postMaxExceeded = true;
        }
        return $r;
    }

    private static function captureHeaders(): array
    {
        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with($key, 'HTTP_')) {
                $name = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($key, 5)))));
                $headers[$name] = $value;
            }
        }
        // Algunos servidores exponen Authorization aparte.
        if (!isset($headers['Authorization']) && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            $headers['Authorization'] = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        }
        return $headers;
    }

    public function bearerToken(): ?string
    {
        $auth = $this->headers['Authorization'] ?? $this->headers['X-Pizzalog-Authorization'] ?? '';
        if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) {
            return trim($m[1]);
        }
        return null;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body[$key] ?? $default;
    }

    public function param(string $key, mixed $default = null): mixed
    {
        return $this->params[$key] ?? $default;
    }
}
