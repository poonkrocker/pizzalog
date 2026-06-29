<?php
namespace Pizzalog\Fiscal;

use Pizzalog\Core\Config;

/**
 * Devuelve el motor de facturación según config 'fiscal.driver':
 *   'stub' → simulado (desarrollo)
 *   'arca' → integración real (cuando esté implementada)
 */
class FiscalServiceFactory
{
    public static function make(): FiscalService
    {
        $driver = Config::get('fiscal', [])['driver'] ?? 'stub';

        return match ($driver) {
            'arca'  => new ArcaFiscalService(),
            default => new StubFiscalService(),
        };
    }
}
