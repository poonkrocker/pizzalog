<?php

declare(strict_types=1);

namespace Pizzalog\Repositories;

use DateTimeImmutable;
use Pizzalog\Core\Database;

/**
 * Horarios de atención y redes sociales del negocio.
 *
 * El horario gatea el PEDIDO online, no la carta: la carta se sigue viendo
 * con el local cerrado, pero POST /public/{slug}/orders rechaza.
 * day_of_week: 0 = domingo … 6 = sábado (mismo criterio que date('w')).
 */
class BusinessRepository
{
    // --- Horarios -----------------------------------------------------

    /** @return array<int, array{id:int, day_of_week:int, opens_at:string, closes_at:string}> */
    public function hours(int $bid): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, day_of_week, opens_at, closes_at
               FROM business_hours WHERE business_id = ?
              ORDER BY day_of_week, opens_at'
        );
        $stmt->execute([$bid]);

        return array_map(static fn (array $r): array => [
            'id'          => (int) $r['id'],
            'day_of_week' => (int) $r['day_of_week'],
            'opens_at'    => substr((string) $r['opens_at'], 0, 5),
            'closes_at'   => substr((string) $r['closes_at'], 0, 5),
        ], $stmt->fetchAll());
    }

    /**
     * Reemplaza TODAS las franjas del negocio (mismo patrón que las variantes).
     *
     * @param array<int, array{day_of_week:int, opens_at:string, closes_at:string}> $slots
     */
    public function syncHours(int $bid, array $slots): void
    {
        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM business_hours WHERE business_id = ?')->execute([$bid]);
            $ins = $pdo->prepare(
                'INSERT INTO business_hours (business_id, day_of_week, opens_at, closes_at)
                 VALUES (?, ?, ?, ?)'
            );
            foreach ($slots as $s) {
                $ins->execute([$bid, $s['day_of_week'], $s['opens_at'], $s['closes_at']]);
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /**
     * ¿Está aceptando pedidos ahora?
     * = accepts_online_orders && alguna franja cubre este momento.
     * Sin ninguna franja cargada: manda solo el switch (local sin horarios
     * configurados no queda bloqueado sin que nadie entienda por qué).
     */
    public function isOpenForOrders(array $business, ?DateTimeImmutable $now = null): bool
    {
        if ((int) ($business['accepts_online_orders'] ?? 1) !== 1) {
            return false;
        }
        $now  ??= new DateTimeImmutable('now');
        $slots = $this->hours((int) $business['id']);
        if ($slots === []) {
            return true;
        }

        $dow  = (int) $now->format('w');
        $prev = ($dow + 6) % 7;
        $t    = $now->format('H:i');

        foreach ($slots as $s) {
            $crossesMidnight = $s['closes_at'] <= $s['opens_at'];

            if (!$crossesMidnight && $s['day_of_week'] === $dow) {
                if ($t >= $s['opens_at'] && $t < $s['closes_at']) {
                    return true;
                }
                continue;
            }
            if ($crossesMidnight) {
                // Tramo de hoy (20:00 → 24:00) o la cola de ayer (00:00 → 02:00).
                if ($s['day_of_week'] === $dow && $t >= $s['opens_at']) {
                    return true;
                }
                if ($s['day_of_week'] === $prev && $t < $s['closes_at']) {
                    return true;
                }
            }
        }
        return false;
    }

    // --- Redes sociales -----------------------------------------------

    /** @return array<int, array{id:int, platform:string, url:string, sort_order:int}> */
    public function socialLinks(int $bid): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, platform, url, sort_order FROM business_social_links
              WHERE business_id = ? ORDER BY sort_order, id'
        );
        $stmt->execute([$bid]);

        return array_map(static fn (array $r): array => [
            'id'         => (int) $r['id'],
            'platform'   => $r['platform'],
            'url'        => $r['url'],
            'sort_order' => (int) $r['sort_order'],
        ], $stmt->fetchAll());
    }

    /** @param array<int, array{platform:string, url:string}> $links */
    public function syncSocialLinks(int $bid, array $links): void
    {
        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM business_social_links WHERE business_id = ?')->execute([$bid]);
            $ins = $pdo->prepare(
                'INSERT INTO business_social_links (business_id, platform, url, sort_order)
                 VALUES (?, ?, ?, ?)'
            );
            foreach (array_values($links) as $i => $l) {
                $ins->execute([$bid, $l['platform'], $l['url'], $i]);
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }
}
