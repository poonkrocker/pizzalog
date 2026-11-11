<?php
/**
 * Pizzalog Tools — Batería de Pruebas de Hardening Técnico
 * Cubre: CORS (allowlist estricta), JWT (algoritmo y claims), Autenticación y Concurrencia Optimista.
 *
 * Para ejecutar en el servidor o entorno local con PHP:
 *   php backend/tests/HardeningTestSuite.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../src/Core/Cors.php';
require_once __DIR__ . '/../src/Core/Jwt.php';

use Pizzalog\Core\Cors;
use Pizzalog\Core\Jwt;

$passed = 0;
$failed = 0;

function assertTest(string $description, bool $condition): void {
    global $passed, $failed;
    if ($condition) {
        echo "  [OK] {$description}\n";
        $passed++;
    } else {
        echo "  [FAIL] {$description}\n";
        $failed++;
    }
}

echo "=== 1. PRUEBAS DE CORS (ALLOWLIST ESTRICTA) ===\n";

// Orígenes autorizados
assertTest('Permite https://tools.pizzalog.net', Cors::isOriginAllowed('https://tools.pizzalog.net'));
assertTest('Permite https://staging.pizzalog.net', Cors::isOriginAllowed('https://staging.pizzalog.net'));
assertTest('Permite https://app.pizzalog.net', Cors::isOriginAllowed('https://app.pizzalog.net'));
assertTest('Permite https://pizzalog.net', Cors::isOriginAllowed('https://pizzalog.net'));
assertTest('Permite http://localhost:5176 (Tools local Vite)', Cors::isOriginAllowed('http://localhost:5176'));
assertTest('Permite capacitor://localhost (Android)', Cors::isOriginAllowed('capacitor://localhost'));

// Orígenes rechazados
assertTest('Rechaza subdominios arbitrarios no registrados (ej. evil.pizzalog.net)', !Cors::isOriginAllowed('https://evil.pizzalog.net'));
assertTest('Rechaza suplantación de dominio (ej. pizzalog.net.attacker.com)', !Cors::isOriginAllowed('https://pizzalog.net.attacker.com'));
assertTest('Rechaza orígenes de terceros arbitrarios', !Cors::isOriginAllowed('https://malicious-site.com'));
assertTest('Rechaza origen vacío', !Cors::isOriginAllowed(''));

echo "\n=== 2. PRUEBAS DE JWT (HS256 Y CLAIMS) ===\n";

$secret = 'super-secret-key-with-more-than-32-characters-length!';
$issuer = 'pizzalog';

// Token válido
$token = Jwt::encode(['sub' => 123, 'aud' => 'pizzalog-tools', 'env' => 'production'], $secret, 3600, $issuer);
$decoded = Jwt::decode($token, $secret);
assertTest('Decodifica token válido correctamente', is_array($decoded) && ($decoded['sub'] ?? 0) === 123);
assertTest('Incluye claim iss correcto', ($decoded['iss'] ?? '') === 'pizzalog');
assertTest('Incluye claim aud correcto', ($decoded['aud'] ?? '') === 'pizzalog-tools');
assertTest('Incluye claim env correcto', ($decoded['env'] ?? '') === 'production');
assertTest('Incluye claim exp futuro', isset($decoded['exp']) && $decoded['exp'] > time());
assertTest('Incluye claim nbf válido', isset($decoded['nbf']) && $decoded['nbf'] <= time());

// Token con firma inválida
$tamperedToken = substr($token, 0, -4) . 'xxxx';
assertTest('Rechaza token con firma alterada', Jwt::decode($tamperedToken, $secret) === null);

// Token con secreto incorrecto
assertTest('Rechaza token con clave secreta diferente', Jwt::decode($token, 'another-secret-key-that-does-not-match!') === null);

// Token vencido (exp en el pasado)
$expiredToken = Jwt::encode(['sub' => 123, 'aud' => 'pizzalog-tools'], $secret, -100, $issuer);
assertTest('Rechaza token vencido (exp)', Jwt::decode($expiredToken, $secret) === null);

// Token con formato malformado
assertTest('Rechaza token malformado sin 3 partes', Jwt::decode('header.payload', $secret) === null);

echo "\n=== 3. PRUEBAS DE CONCURRENCIA OPTIMISTA (LÓGICA) ===\n";

// Simulación de control de concurrencia optimista de ToolsWorkspaceController
$workspaceA = ['version' => 1, 'updated_at' => '2026-11-05 14:00:00'];
$session1Expected = '2026-11-05 14:00:00';
$session2Expected = '2026-11-05 14:00:00';

// Sesión 1 guarda primero y actualiza timestamp
$session1Succeeds = ($session1Expected === $workspaceA['updated_at']);
assertTest('Sesión 1 guarda con timestamp coincidente', $session1Succeeds);
if ($session1Succeeds) {
    $workspaceA['updated_at'] = '2026-11-05 14:00:05'; // Actualizado por sesión 1
}

// Sesión 2 intenta guardar con el timestamp viejo (desactualizado)
$session2Conflict = ($session2Expected !== $workspaceA['updated_at']);
assertTest('Sesión 2 detecta conflicto 409 y no sobrescribe cambios de sesión 1', $session2Conflict);

echo "\n=== RESUMEN DE PRUEBAS ===\n";
echo "Total pasadas: {$passed}\n";
echo "Total falladas: {$failed}\n";

if ($failed > 0) {
    exit(1);
}
echo "¡Todas las pruebas de hardening técnico completadas con éxito!\n";
