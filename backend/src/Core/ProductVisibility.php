<?php

declare(strict_types=1);

namespace Pizzalog\Core;

use DateTimeImmutable;

/**
 * Evalúa la ventana de disponibilidad de un producto (visible_days +
 * visible_from/visible_until) contra la hora del local.
 *
 * La zona horaria ya viene fijada en bootstrap.php (America/Argentina/Cordoba),
 * así que un DateTimeImmutable('now') ya está en hora del local.
 *
 * Único lugar donde vive esta lógica: la usa PublicController para calcular
 * `is_available_now` y para rechazar el checkout de algo fuera de horario.
 */
final class ProductVisibility
{
    /** date('w') → clave del JSON de visible_days. 0 = domingo. */
    private const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

    /**
     * @param array $product fila de `products` (necesita visible_days,
     *                       visible_from, visible_until)
     */
    public static function isVisibleNow(array $product, ?DateTimeImmutable $now = null): bool
    {
        $now ??= new DateTimeImmutable('now');

        if (!self::dayMatches($product['visible_days'] ?? null, $now)) {
            return false;
        }
        return self::timeMatches(
            $product['visible_from']  ?? null,
            $product['visible_until'] ?? null,
            $now
        );
    }

    /** Decodifica visible_days (JSON o array) a una lista de claves normalizadas. */
    public static function decodeDays(mixed $raw): ?array
    {
        if ($raw === null || $raw === '') {
            return null;
        }
        $days = is_array($raw) ? $raw : json_decode((string) $raw, true);
        if (!is_array($days) || $days === []) {
            return null;
        }
        $clean = [];
        foreach ($days as $d) {
            $d = strtolower(trim((string) $d));
            if (in_array($d, self::DAYS, true) && !in_array($d, $clean, true)) {
                $clean[] = $d;
            }
        }
        return $clean === [] ? null : $clean;
    }

    private static function dayMatches(mixed $rawDays, DateTimeImmutable $now): bool
    {
        $days = self::decodeDays($rawDays);
        if ($days === null) {
            return true; // sin restricción de días
        }
        return in_array(self::DAYS[(int) $now->format('w')], $days, true);
    }

    /**
     * Ventana horaria. Si `until` < `from` se interpreta que cruza medianoche
     * (20:00 → 02:00 incluye las 23:30 y las 01:00).
     */
    private static function timeMatches(?string $from, ?string $until, DateTimeImmutable $now): bool
    {
        $from  = self::normalizeTime($from);
        $until = self::normalizeTime($until);

        if ($from === null && $until === null) {
            return true; // sin restricción horaria
        }

        $t = $now->format('H:i:s');

        if ($from !== null && $until === null) {
            return $t >= $from;
        }
        if ($from === null && $until !== null) {
            return $t < $until;
        }
        if ($from <= $until) {
            return $t >= $from && $t < $until;
        }
        // Cruza medianoche.
        return $t >= $from || $t < $until;
    }

    /** 'H:i' o 'H:i:s' → 'H:i:s'. Cualquier otra cosa → null. */
    private static function normalizeTime(mixed $t): ?string
    {
        if ($t === null || $t === '') {
            return null;
        }
        $t = trim((string) $t);
        if (preg_match('/^([01]\d|2[0-3]):([0-5]\d)$/', $t)) {
            return $t . ':00';
        }
        if (preg_match('/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/', $t)) {
            return $t;
        }
        return null;
    }
}
