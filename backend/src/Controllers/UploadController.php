<?php

declare(strict_types=1);

namespace Pizzalog\Controllers;

use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

/**
 * Subida de imágenes (fotos de productos, logo del local).
 *
 * El recorte 4:3 lo hace el panel antes de subir; acá se valida el archivo,
 * se redimensiona a un máximo de 1200×900 y se recomprime a JPEG liviano.
 * Se guarda bajo public/media/{business_id}/ y se devuelve la URL pública.
 */
final class UploadController
{
    private const MAX_BYTES = 6 * 1024 * 1024; // 6 MB de entrada
    private const MAX_W = 1200;
    private const MAX_H = 900;
    private const QUALITY = 82;

    /** POST /uploads/image (multipart, campo "image") */
    public function image(Request $req): void
    {
        if (!isset($_FILES['image']) || !is_array($_FILES['image'])) {
            Response::error('No llegó ninguna imagen', 422);
        }
        $f = $_FILES['image'];
        if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            Response::error('La subida falló, probá de nuevo', 422);
        }
        if ((int) $f['size'] > self::MAX_BYTES) {
            Response::error('La imagen es demasiado pesada (máximo 6 MB)', 422);
        }

        $info = @getimagesize((string) $f['tmp_name']);
        if ($info === false) {
            Response::error('El archivo no es una imagen válida', 422);
        }
        $mime = $info['mime'] ?? '';

        $src = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($f['tmp_name']),
            'image/png'  => @imagecreatefrompng($f['tmp_name']),
            'image/webp' => function_exists('imagecreatefromwebp')
                ? @imagecreatefromwebp($f['tmp_name'])
                : false,
            default => false,
        };
        if ($src === false) {
            Response::error('Formato de imagen no soportado (usá JPG, PNG o WebP)', 422);
        }

        // Redimensionar conservando proporción, con fondo blanco (por los PNG
        // transparentes) y recompresión JPEG.
        $w = imagesx($src);
        $h = imagesy($src);
        $scale = min(self::MAX_W / $w, self::MAX_H / $h, 1);
        $nw = max(1, (int) round($w * $scale));
        $nh = max(1, (int) round($h * $scale));

        $dst = imagecreatetruecolor($nw, $nh);
        $white = imagecolorallocate($dst, 255, 255, 255);
        imagefill($dst, 0, 0, $white);
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
        imagedestroy($src);

        // Guardar bajo public/media/{bid}/
        $bid = (int) $req->auth['business_id'];
        $dir = dirname(__DIR__, 2) . '/public/media/' . $bid;
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            Response::error('No se pudo preparar la carpeta de imágenes', 500);
        }
        $name = 'img_' . bin2hex(random_bytes(8)) . '.jpg';
        if (!imagejpeg($dst, "$dir/$name", self::QUALITY)) {
            imagedestroy($dst);
            Response::error('No se pudo guardar la imagen', 500);
        }
        imagedestroy($dst);

        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host   = $_SERVER['HTTP_HOST'] ?? 'api.pizzalog.net';

        Response::ok(['url' => "$scheme://$host/media/$bid/$name"]);
    }
}
