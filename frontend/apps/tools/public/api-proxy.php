<?php
/**
 * Proxy same-origin hacia la API de Pizzalog.
 * - Si el directorio backend/ está presente en el mismo servidor, despacha la solicitud
 *   directamente en el mismo proceso PHP (sin llamadas de red externas ni límites de ModSecurity sobre PUT).
 * - Si no, reenvía vía cURL / stream convirtiendo respuestas HTML de error del servidor en JSON limpio.
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

// Permitir override de método para evitar bloqueos de ModSecurity/WAF sobre PUT en hostings compartidos
$overrideMethod = strtoupper((string) ($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'] ?? ''));
if ($method === 'POST' && in_array($overrideMethod, ['PUT', 'DELETE'], true)) {
    $method = $overrideMethod;
    $_SERVER['REQUEST_METHOD'] = $method;
}

// 1. Intentar despacho local directo si backend/public/index.php existe en el mismo servidor
$candidateBackends = [
    dirname(__DIR__) . '/backend/public/index.php',
    dirname(__DIR__, 2) . '/backend/public/index.php',
    dirname(__DIR__) . '/api/index.php',
];

foreach ($candidateBackends as $backendIndex) {
    if (is_file($backendIndex)) {
        $parsedEndpoint = parse_url($endpoint);
        $cleanPath = $parsedEndpoint['path'] ?? '/';
        $queryStr = $parsedEndpoint['query'] ?? '';
        $_SERVER['REQUEST_URI'] = $cleanPath . ($queryStr !== '' ? '?' . $queryStr : '');
        $_SERVER['REQUEST_METHOD'] = $method;
        if ($queryStr !== '') {
            parse_str($queryStr, $extraQuery);
            $_GET = array_merge($_GET, $extraQuery);
        }
        unset($_GET['endpoint']);
        require $backendIndex;
        exit;
    }
}

// 2. Fallback HTTP hacia https://api.pizzalog.net
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
    $forwardHeaders[] = 'X-Pizzalog-Authorization: ' . $authHeader;
}

function emitProxyResponse(int $statusCode, string $body): never
{
    $trimmed = ltrim($body);
    // Si el servidor web / WAF devolvió una página HTML de error (<!DOCTYPE o <html), convertirla a JSON válido
    if ($trimmed === '' || str_starts_with($trimmed, '<')) {
        $safeCode = $statusCode >= 400 ? $statusCode : 502;
        http_response_code($safeCode);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate');
        $msg = match ($safeCode) {
            403 => 'El firewall del servidor bloqueó temporalmente la solicitud (403)',
            405 => 'Método HTTP no permitido por el servidor web (405)',
            413 => 'El tamaño de los datos supera el límite configurado en el servidor web (413)',
            500, 502, 503, 504 => "El servidor está ocupado o reiniciando la conexión (HTTP $safeCode)",
            default => "Respuesta no válida del servidor (HTTP $safeCode)",
        };
        echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code($statusCode > 0 ? $statusCode : 200);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    echo $body;
    exit;
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
        echo json_encode(['ok' => false, 'error' => 'Error de enlace interno con API: ' . $curlErr], JSON_UNESCAPED_UNICODE);
        exit;
    }

    emitProxyResponse($httpCode, (string) $responseBody);
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
    echo json_encode(['ok' => false, 'error' => 'No se pudo contactar a api.pizzalog.net desde el servidor'], JSON_UNESCAPED_UNICODE);
    exit;
}
emitProxyResponse($statusCode, (string) $responseBody);
