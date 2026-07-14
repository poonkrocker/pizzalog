<?php

declare(strict_types=1);

namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Repositories\BusinessRepository;

/**
 * Perfil del negocio: lo que se ve en el encabezado de la carta pública
 * (pizzalog.net/{slug}) y el propio slug que define esa URL.
 *
 * Desde la migración 015 las redes sociales viven en business_social_links
 * (tabla propia, una fila por red) y ya no en columnas sueltas.
 * Desde la 016 la ubicación es el link de Google Maps, no coordenadas.
 */
final class BusinessController
{
    private const FIELDS = 'id, name, slug, phone, address, google_maps_url, description,
                            logo_url, theme, accepts_online_orders';

    private const THEME_COLORS   = ['bg', 'accent', 'link', 'text'];
    private const THEME_PATTERNS = ['mosaico', 'liso', 'rayas', 'lunares'];

    private BusinessRepository $repo;

    public function __construct()
    {
        $this->repo = new BusinessRepository();
    }

    /** GET /business — el perfil del negocio del usuario. */
    public function show(Request $req): void
    {
        $bid  = (int) $req->auth['business_id'];
        $stmt = Database::pdo()->prepare(
            'SELECT ' . self::FIELDS . ' FROM businesses WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$bid]);
        $b = $stmt->fetch();

        if (!$b) {
            Response::error('Negocio no encontrado', 404);
        }

        Response::ok(['business' => $this->cast($b)]);
    }

    /** PUT /business — actualizar el perfil (solo admin). */
    public function update(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];

        $name = trim((string) $req->input('name', ''));
        if ($name === '') {
            Response::error('El nombre es obligatorio', 422);
        }

        // El slug es la URL pública: minúsculas, números y guiones.
        $slug = strtolower(trim((string) $req->input('slug', '')));
        if (!preg_match('/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/', $slug)) {
            Response::error(
                'La dirección debe tener entre 2 y 50 caracteres: minúsculas, números y guiones (sin empezar ni terminar con guion)',
                422
            );
        }
        $dup = Database::pdo()->prepare('SELECT id FROM businesses WHERE slug = ? AND id != ? LIMIT 1');
        $dup->execute([$slug, $bid]);
        if ($dup->fetch()) {
            Response::error('Esa dirección ya está en uso por otro local', 422);
        }

        // Ubicación: el link que da el botón "Compartir" de Google Maps. No se
        // restringe el dominio para no romper con acortadores (maps.app.goo.gl).
        $maps = trim((string) ($req->input('google_maps_url', '') ?? ''));
        if ($maps !== '') {
            if (!filter_var($maps, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $maps)) {
                Response::error('El link de Google Maps no parece una URL válida', 422);
            }
            if (mb_strlen($maps) > 255) {
                Response::error('El link de Google Maps es demasiado largo', 422);
            }
        }

        // Tema de la carta: colores hex + patrón, con lista blanca de claves.
        $theme    = null;
        $rawTheme = $req->input('theme');
        if (is_array($rawTheme) && $rawTheme !== []) {
            $clean = [];
            foreach (self::THEME_COLORS as $k) {
                if (isset($rawTheme[$k]) && $rawTheme[$k] !== '') {
                    $c = strtolower(trim((string) $rawTheme[$k]));
                    if (!preg_match('/^#[0-9a-f]{6}$/', $c)) {
                        Response::error('Color inválido en el tema (usá formato #rrggbb)', 422);
                    }
                    $clean[$k] = $c;
                }
            }
            if (isset($rawTheme['pattern']) && $rawTheme['pattern'] !== '') {
                $pat = (string) $rawTheme['pattern'];
                if (!in_array($pat, self::THEME_PATTERNS, true)) {
                    Response::error('Patrón de fondo inválido', 422);
                }
                $clean['pattern'] = $pat;
            }
            if ($clean !== []) {
                $theme = json_encode($clean, JSON_UNESCAPED_UNICODE);
            }
        }

        $opt = static fn (string $k) => (static function ($v) {
            $v = trim((string) $v);
            return $v === '' ? null : $v;
        })($req->input($k, '') ?? '');

        Database::pdo()->prepare(
            'UPDATE businesses
                SET name = ?, slug = ?, phone = ?, address = ?, google_maps_url = ?,
                    description = ?, logo_url = ?, theme = ?, accepts_online_orders = ?
              WHERE id = ?'
        )->execute([
            $name, $slug, $opt('phone'), $opt('address'), $maps !== '' ? $maps : null,
            $opt('description'), $opt('logo_url'), $theme,
            (int) (bool) $req->input('accepts_online_orders', true),
            $bid,
        ]);

        $this->show($req);
    }

    // --- Horarios de atención -----------------------------------------

    /** GET /business/hours */
    public function hours(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        Response::ok([
            'hours'                 => $this->repo->hours($bid),
            'accepts_online_orders' => $this->acceptsOnlineOrders($bid),
            'is_open_for_orders'    => $this->repo->isOpenForOrders(
                ['id' => $bid, 'accepts_online_orders' => $this->acceptsOnlineOrders($bid)]
            ),
        ]);
    }

    /**
     * PUT /business/hours
     * Body: { hours: [ { day_of_week: 0-6, opens_at: 'HH:MM', closes_at: 'HH:MM' } ] }
     * Reemplaza TODAS las franjas del negocio (mismo patrón que las variantes).
     * Si closes_at <= opens_at se interpreta que cruza medianoche (20:00 → 02:00).
     */
    public function updateHours(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];

        $raw = $req->input('hours');
        if (!is_array($raw)) {
            Response::error('Mandá el listado completo de franjas horarias', 422);
        }

        $slots = [];
        foreach ($raw as $h) {
            $dow    = (int) ($h['day_of_week'] ?? -1);
            $opens  = $this->time($h['opens_at']  ?? null);
            $closes = $this->time($h['closes_at'] ?? null);

            if ($dow < 0 || $dow > 6) {
                Response::error('Día inválido en los horarios (0 = domingo, 6 = sábado)', 422);
            }
            if ($opens === null || $closes === null) {
                Response::error('Cada franja necesita hora de apertura y de cierre (HH:MM)', 422);
            }
            if ($opens === $closes) {
                Response::error('Una franja no puede abrir y cerrar a la misma hora', 422);
            }
            $slots[] = ['day_of_week' => $dow, 'opens_at' => $opens, 'closes_at' => $closes];
        }

        $this->repo->syncHours($bid, $slots);
        $this->hours($req);
    }

    // --- Redes sociales -----------------------------------------------

    /** GET /business/social-links */
    public function socialLinks(Request $req): void
    {
        Response::ok(['social_links' => $this->repo->socialLinks((int) $req->auth['business_id'])]);
    }

    /**
     * PUT /business/social-links
     * Body: { social_links: [ { platform, url } ] } — en el orden deseado.
     * `platform` es texto libre: el ícono lo resuelve el frontend y cae a uno
     * genérico si no la conoce (sitio web, teléfono, email…).
     */
    public function updateSocialLinks(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];

        $raw = $req->input('social_links');
        if (!is_array($raw)) {
            Response::error('Mandá el listado completo de redes', 422);
        }

        $links = [];
        foreach ($raw as $l) {
            $platform = strtolower(trim((string) ($l['platform'] ?? '')));
            $url      = trim((string) ($l['url'] ?? ''));

            if ($platform === '' || $url === '') {
                Response::error('Cada red necesita plataforma y link', 422);
            }
            if (!preg_match('/^[a-z0-9._-]{2,30}$/', $platform)) {
                Response::error('Nombre de red inválido (solo letras, números, punto y guion)', 422);
            }
            if (!preg_match('#^(https?://|mailto:|tel:)#i', $url)) {
                Response::error(
                    sprintf('El link de "%s" tiene que empezar con https://, mailto: o tel:', $platform),
                    422
                );
            }
            if (mb_strlen($url) > 255) {
                Response::error(sprintf('El link de "%s" es demasiado largo', $platform), 422);
            }
            $links[] = ['platform' => $platform, 'url' => $url];
        }

        $this->repo->syncSocialLinks($bid, $links);
        $this->socialLinks($req);
    }

    // ------------------------------------------------------------------

    private function acceptsOnlineOrders(int $bid): int
    {
        $stmt = Database::pdo()->prepare('SELECT accepts_online_orders FROM businesses WHERE id = ?');
        $stmt->execute([$bid]);
        return (int) $stmt->fetchColumn();
    }

    private function time(mixed $v): ?string
    {
        $v = trim((string) ($v ?? ''));
        if (!preg_match('/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/', $v)) {
            return null;
        }
        return substr($v, 0, 5);
    }

    private function cast(array $b): array
    {
        return [
            'id'                    => (int) $b['id'],
            'name'                  => $b['name'],
            'slug'                  => $b['slug'],
            'phone'                 => $b['phone'],
            'address'               => $b['address'],
            'google_maps_url'       => $b['google_maps_url'],
            'description'           => $b['description'],
            'logo_url'              => $b['logo_url'],
            'accepts_online_orders' => (int) $b['accepts_online_orders'],
            'theme'                 => $b['theme'] !== null ? json_decode((string) $b['theme'], true) : null,
        ];
    }
}
