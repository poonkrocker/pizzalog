<?php
/**
 * Copiá este archivo a config/config.php y completá los valores reales.
 * config/config.php está en .gitignore y NUNCA se sube al repositorio.
 */

return [
    // Poné true solo en desarrollo: expone los mensajes de error reales.
    'debug' => false,

    'db' => [
        'host'    => 'localhost',          // en Ferozo casi siempre es localhost
        'name'    => 'a0140456_app',
        'user'    => 'a0140456_app',
        'pass'    => 'PONÉ_TU_PASSWORD_ACÁ',
        'charset' => 'utf8mb4',
    ],

    'jwt' => [
        // Generá una cadena aleatoria larga, ej. en consola:
        //   php -r "echo bin2hex(random_bytes(32));"
        'secret' => 'CAMBIAR_por_una_cadena_aleatoria_de_64_caracteres',
        'issuer' => 'pizzalog',
        'ttl'    => 60 * 60 * 8,            // duración del token en segundos (8 h)
    ],

    // Fallback de IA para extraer ingredientes cuando el diccionario no alcanza.
    // Dejá api_key vacío ('') para usar SOLO el diccionario local, sin costo.
    'deepseek' => [
        'api_key'  => '',                                       // key de platform.deepseek.com
        'base_url' => 'https://api.deepseek.com/chat/completions',
        'model'    => 'deepseek-v4-flash',                      // el más barato; ideal para extracción
        'timeout'  => 8,                                        // segundos
    ],

    // Facturación electrónica (ARCA). 'stub' simula sin emitir nada real;
    // 'arca' usa la integración real (cuando esté implementada).
    'fiscal' => [
        'driver' => 'stub',
    ],

    'cors' => [
        // Orígenes autorizados a consumir la API.
        'allowed_origins' => [
            'https://app.pizzalog.net',    // panel de administración / TPV web
            'http://localhost:5173',       // desarrollo local (Vite)
            'http://localhost',            // app Android (Capacitor)
            'https://localhost',           // app Android (Capacitor, scheme https)
            'capacitor://localhost',       // app Android (Capacitor, scheme nativo)
        ],
    ],
];
