<?php
namespace Pizzalog\Core;

/**
 * Guarda la configuración cargada en bootstrap y la expone de forma estática.
 */
class Config
{
    private static array $data = [];

    public static function load(array $data): void
    {
        self::$data = $data;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        return self::$data[$key] ?? $default;
    }

    public static function all(): array
    {
        return self::$data;
    }
}
