<?php
/**
 * track.php — endpoint de métricas de la carta + puente directo a Pizzalog.
 *
 * Recibe beacons (navigator.sendBeacon → POST con JSON) desde el index de la
 * carta y registra dos tipos de evento:
 *   - 'view'  : una visita a la página.
 *   - 'order' : un pedido enviado a WhatsApp, que además se reenvía en el mismo
 *               instante a Pizzalog (/api/public/arrabbiata/external-order).
 */

require_once dirname(__DIR__) . '/db_connect.php';
date_default_timezone_set('America/Argentina/Cordoba');

header('Content-Type: application/json; charset=utf-8');

const TRACK_IP_SALT = 'rrbb-track-2026-cambia-esto';
const PIZZALOG_EXTERNAL_ORDER_URL = 'https://pizzalog.net/api/public/arrabbiata/external-order';

function trackEnsureTables(PDO $pdo): void {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS site_visits (
            id         BIGINT AUTO_INCREMENT PRIMARY KEY,
            created_at DATETIME NOT NULL,
            source     VARCHAR(16) NOT NULL DEFAULT 'carta',
            path       VARCHAR(255) NULL,
            referrer   VARCHAR(255) NULL,
            ua         VARCHAR(255) NULL,
            ip_hash    CHAR(64) NULL,
            INDEX idx_created (created_at),
            INDEX idx_iphash (ip_hash)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS order_events (
            id             BIGINT AUTO_INCREMENT PRIMARY KEY,
            created_at     DATETIME NOT NULL,
            source         VARCHAR(16) NOT NULL DEFAULT 'carta',
            delivery_type  VARCHAR(16) NULL,
            payment_method VARCHAR(32) NULL,
            total          DECIMAL(10,2) NULL,
            pickup_time    VARCHAR(32) NULL,
            item_count     INT NULL,
            items_json     TEXT NULL,
            ip_hash        CHAR(64) NULL,
            INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}

function clientIpHash(): string {
    $ip = $_SERVER['HTTP_CF_CONNECTING_IP']
        ?? $_SERVER['HTTP_X_FORWARDED_FOR']
        ?? $_SERVER['REMOTE_ADDR']
        ?? '';
    if (strpos($ip, ',') !== false) { $ip = trim(explode(',', $ip)[0]); }
    return hash('sha256', TRACK_IP_SALT . '|' . $ip);
}

function normPayment(string $p): string {
    $k = strtolower(trim($p));
    $k = strtr($k, ['á'=>'a','é'=>'e','í'=>'i','ó'=>'o','ú'=>'u']);
    $map = [
        'transferencia' => 'Transferencia',
        'efectivo'      => 'Efectivo',
        'debito'        => 'Débito',
        'credito'       => 'Crédito',
    ];
    if (isset($map[$k])) return $map[$k];
    return $p !== '' ? $p : '(sin dato)';
}

function forwardOrderToPizzalog(array $data): void {
    try {
        $payload = json_encode($data, JSON_UNESCAPED_UNICODE);
        if ($payload === false) return;

        if (function_exists('curl_init')) {
            $ch = curl_init(PIZZALOG_EXTERNAL_ORDER_URL);
            curl_setopt_array($ch, [
                CURLOPT_POST           => true,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
                CURLOPT_POSTFIELDS     => $payload,
                CURLOPT_TIMEOUT        => 5,
                CURLOPT_CONNECTTIMEOUT => 3,
            ]);
            curl_exec($ch);
            curl_close($ch);
            return;
        }

        $ctx = stream_context_create([
            'http' => [
                'method'  => 'POST',
                'header'  => "Content-Type: application/json\r\n",
                'content' => $payload,
                'timeout' => 5,
            ],
        ]);
        @file_get_contents(PIZZALOG_EXTERNAL_ORDER_URL, false, $ctx);
    } catch (Throwable $e) {
        error_log('track.php -> Pizzalog error: ' . $e->getMessage());
    }
}

try {
    $raw = file_get_contents('php://input');
    if ($raw === false || strlen($raw) > 30000) { http_response_code(400); echo '{"ok":false}'; exit; }

    $data = json_decode($raw, true);
    if (!is_array($data)) { http_response_code(400); echo '{"ok":false}'; exit; }

    trackEnsureTables($pdo);

    $now    = date('Y-m-d H:i:s');
    $type   = $data['type'] ?? '';
    $source = substr((string)($data['source'] ?? 'carta'), 0, 16);
    $ua     = substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255);
    $iph    = clientIpHash();

    if ($type === 'view') {
        $st = $pdo->prepare("
            INSERT INTO site_visits (created_at, source, path, referrer, ua, ip_hash)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        $st->execute([
            $now,
            $source,
            substr((string)($data['path'] ?? ''), 0, 255),
            substr((string)($data['ref']  ?? ''), 0, 255),
            $ua,
            $iph,
        ]);
        echo '{"ok":true}';
        exit;
    }

    if ($type === 'order') {
        $items = (isset($data['items']) && is_array($data['items'])) ? $data['items'] : [];
        $st = $pdo->prepare("
            INSERT INTO order_events
                (created_at, source, delivery_type, payment_method, total, pickup_time, item_count, items_json, ip_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $st->execute([
            $now,
            $source,
            substr((string)($data['delivery_type']  ?? ''), 0, 16),
            normPayment((string)($data['payment_method'] ?? '')),
            is_numeric($data['total'] ?? null) ? (float)$data['total'] : null,
            substr((string)($data['pickup_time'] ?? ''), 0, 32),
            (int)($data['item_count'] ?? 0),
            substr((string)json_encode($items, JSON_UNESCAPED_UNICODE), 0, 60000),
            $iph,
        ]);

        // Enviar pedido simultáneamente a Pizzalog
        forwardOrderToPizzalog($data);

        echo '{"ok":true}';
        exit;
    }

    http_response_code(400);
    echo '{"ok":false}';
} catch (Throwable $e) {
    error_log('track.php: ' . $e->getMessage());
    http_response_code(500);
    echo '{"ok":false}';
}
