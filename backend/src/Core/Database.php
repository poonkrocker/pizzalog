<?php
namespace Pizzalog\Core;

use PDO;

/**
 * Conexión única a MySQL vía PDO.
 */
class Database
{
    private static ?PDO $pdo = null;

    public static function connect(array $cfg): PDO
    {
        if (self::$pdo === null) {
            $dsn = sprintf(
                'mysql:host=%s;dbname=%s;charset=%s',
                $cfg['host'],
                $cfg['name'],
                $cfg['charset'] ?? 'utf8mb4'
            );
            self::$pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
            // Zona horaria de la sesión: los cortes por día de los reportes
            // se calculan en hora local de Córdoba, no en UTC.
            self::$pdo->exec("SET time_zone = '-03:00'");
        }
        return self::$pdo;
    }

    public static function pdo(): PDO
    {
        if (self::$pdo === null) {
            throw new \RuntimeException('La base de datos no está inicializada.');
        }
        return self::$pdo;
    }
}
