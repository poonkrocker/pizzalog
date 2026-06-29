<?php
namespace Pizzalog\Core;

/**
 * Respuestas JSON uniformes. Todas las respuestas tienen la forma:
 *   éxito  -> { "ok": true,  "data": ... }
 *   error  -> { "ok": false, "error": "mensaje" }
 */
class Response
{
    public static function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function ok(mixed $data = [], int $status = 200): never
    {
        self::json(['ok' => true, 'data' => $data], $status);
    }

    public static function error(string $message, int $status = 400, array $extra = []): never
    {
        self::json(['ok' => false, 'error' => $message] + $extra, $status);
    }
}
