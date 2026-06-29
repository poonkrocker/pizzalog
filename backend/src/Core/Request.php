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

    public static function capture(): self
    {
        $r = new self();
        $r->method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $uri = '/' . trim($uri, '/');
        $r->path = $uri === '' ? '/' : $uri;

        $r->query = $_GET;
        $r->headers = self::captureHeaders();

        $raw = file_get_contents('php://input');
        if ($raw !== false && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $r->body = $decoded;
            }
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
        $auth = $this->headers['Authorization'] ?? '';
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
