<?php

declare(strict_types=1);

namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

/**
 * Perfil del negocio: lo que se ve en el encabezado de la carta pública
 * (pizzalog.net/{slug}) y el propio slug que define esa URL.
 */
final class BusinessController
{
    private const FIELDS = 'id, name, slug, phone, address, description, logo_url,
                            instagram, facebook, tiktok, latitude, longitude, theme';

    private const THEME_COLORS   = ['bg', 'accent', 'link', 'text'];
    private const THEME_PATTERNS = ['mosaico', 'liso', 'rayas', 'lunares'];

    /** GET /business — el perfil del negocio del usuario. */
    public function show(Request $req): void
    {
        $stmt = Database::pdo()->prepare(
            'SELECT ' . self::FIELDS . ' FROM businesses WHERE id = ? LIMIT 1'
        );
        $stmt->execute([(int) $req->auth['business_id']]);
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

        // Coordenadas: ambas o ninguna.
        $lat = $req->input('latitude');
        $lng = $req->input('longitude');
        $hasLat = $lat !== null && $lat !== '';
        $hasLng = $lng !== null && $lng !== '';
        if ($hasLat !== $hasLng) {
            Response::error('Cargá latitud y longitud juntas (o ninguna)', 422);
        }
        if ($hasLat && (!is_numeric($lat) || !is_numeric($lng)
            || (float) $lat < -90 || (float) $lat > 90
            || (float) $lng < -180 || (float) $lng > 180)) {
            Response::error('Coordenadas inválidas', 422);
        }

        // Tema de la carta: colores hex + patrón, con lista blanca de claves.
        $theme = null;
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

        $opt = static fn(string $k) => (static function ($v) {
            $v = trim((string) $v);
            return $v === '' ? null : $v;
        })($req->input($k, '') ?? '');

        Database::pdo()->prepare(
            'UPDATE businesses
                SET name = ?, slug = ?, phone = ?, address = ?, description = ?,
                    logo_url = ?, instagram = ?, facebook = ?, tiktok = ?,
                    latitude = ?, longitude = ?, theme = ?
              WHERE id = ?'
        )->execute([
            $name, $slug, $opt('phone'), $opt('address'), $opt('description'),
            $opt('logo_url'), $opt('instagram'), $opt('facebook'), $opt('tiktok'),
            $hasLat ? (float) $lat : null, $hasLng ? (float) $lng : null,
            $theme,
            $bid,
        ]);

        $this->show($req);
    }

    private function cast(array $b): array
    {
        return [
            'id'          => (int) $b['id'],
            'name'        => $b['name'],
            'slug'        => $b['slug'],
            'phone'       => $b['phone'],
            'address'     => $b['address'],
            'description' => $b['description'],
            'logo_url'    => $b['logo_url'],
            'instagram'   => $b['instagram'],
            'facebook'    => $b['facebook'],
            'tiktok'      => $b['tiktok'],
            'latitude'    => $b['latitude'] !== null ? (float) $b['latitude'] : null,
            'longitude'   => $b['longitude'] !== null ? (float) $b['longitude'] : null,
            'theme'       => $b['theme'] !== null ? json_decode((string) $b['theme'], true) : null,
        ];
    }
}
