<?php
namespace Pizzalog\Core;

/**
 * Utilidades de texto. normalize() deja todo en minúsculas y sin acentos,
 * para comparar ingredientes sin que "Muzzarella" y "muzzarella" difieran.
 */
class Text
{
    private const ACENTOS_FROM = 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ';
    private const ACENTOS_TO   = 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC';

    public static function normalize(string $s): string
    {
        $s = mb_strtolower(trim($s), 'UTF-8');
        $s = strtr($s, self::map());
        $s = preg_replace('/\s+/u', ' ', $s) ?? $s;
        return $s;
    }

    private static function map(): array
    {
        static $map = null;
        if ($map === null) {
            $from = preg_split('//u', self::ACENTOS_FROM, -1, PREG_SPLIT_NO_EMPTY);
            $to   = preg_split('//u', self::ACENTOS_TO, -1, PREG_SPLIT_NO_EMPTY);
            $map  = array_combine($from, $to);
        }
        return $map;
    }
}
