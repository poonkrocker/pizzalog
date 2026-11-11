<?php
/**
 * Proxy same-origin liviano hacia https://api.pizzalog.net.
 * Evita bloqueos de CORS / renegociación TLS de antivirus o firewalls en el navegador
 * ejecutando la llamada internamente desde el propio servidor de hosting.
 */
declare(strict_types=1);

$endpoint = (string) ($_GET['endpoint'] ?? '');
if ($endpoint === '' || $endpoint[0] !== '/' || str_starts_with($endpoint, '//')) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'Endpoint inválido']);
    exit;
}

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$targetUrl = 'https://api.pizzalog.net' . $endpoint;
$rawBody = file_get_contents('php://input');

$authHeader = $_SERVER['HTTP_X_PIZZALOG_AUTHORIZATION']
    ?? $_SERVER['HTTP_AUTHORIZATION']
    ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
    ?? '';

$contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? 'application/json';
$originHost = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https://' : 'http://')
    . ($_SERVER['HTTP_HOST'] ?? 'tools.pizzalog.net');

$forwardHeaders = [
    'Accept: application/json',
    'Content-Type: ' . $contentType,
    'Origin: ' . $originHost,
];
if ($authHeader !== '') {
    $forwardHeaders[] = 'Authorization: ' . $authHeader;
}

if (function_exists('curl_init')) {
    $ch = curl_init($targetUrl);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $forwardHeaders);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);

    if (!empty($_SERVER['SERVER_ADDR']) && filter_var($_SERVER['SERVER_ADDR'], FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        curl_setopt($ch, CURLOPT_RESOLVE, ['api.pizzalog.net:443:' . $_SERVER['SERVER_ADDR']]);
    }

    if ($method !== 'GET' && $method !== 'HEAD' && $rawBody !== false && $rawBody !== '') {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $rawBody);
    }

    $responseBody = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($responseBody === false || $httpCode === 0) {
        http_response_code(502);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'Error de enlace interno con API: ' . $curlErr]);
        exit;
    }

    http_response_code($httpCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    echo $responseBody;
    exit;
}

$opts = [
    'http' => [
        'method' => $method,
        'header' => implode("\r\n", $forwardHeaders),
        'content' => ($method !== 'GET' && $method !== 'HEAD' && $rawBody !== false) ? $rawBody : '',
        'ignore_errors' => true,
        'timeout' => 30,
    ],
    'ssl' => [
        'verify_peer' => false,
        'verify_peer_name' => false,
    ],
];
$context = stream_context_create($opts);
$responseBody = @file_get_contents($targetUrl, false, $context);
$statusCode = 200;
if (isset($http_response_header) && is_array($http_response_header)) {
    foreach ($http_response_header as $hdr) {
        if (preg_match('#^HTTP/\d+\.\d+\s+(\d+)#', $hdr, $m)) {
            $statusCode = (int) $m[1];
        }
    }
}
if ($responseBody === false) {
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'No se pudo contactar a api.pizzalog.net desde el servidor']);
    exit;
}
http_response_code($statusCode);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
echo $responseBody;
