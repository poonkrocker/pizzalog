<?php
namespace Pizzalog\Ingredients;

/**
 * Motor de respaldo basado en DeepSeek (API compatible con OpenAI).
 * Solo se invoca cuando el diccionario deja fragmentos sin reconocer.
 *
 * Degradación elegante: ante cualquier error (red, timeout, sin key) devuelve
 * un array vacío y la creación del producto sigue con lo del diccionario.
 */
class DeepSeekExtractor implements IngredientExtractor
{
    public function __construct(
        private string $apiKey,
        private string $baseUrl,
        private string $model,
        private int $timeout = 8
    ) {
    }

    /** @return string[] */
    public function extract(string $description): array
    {
        if ($this->apiKey === '') {
            return [];
        }

        $payload = [
            'model'       => $this->model,
            'temperature' => 0,
            'messages'    => [
                [
                    'role'    => 'system',
                    'content' => 'Sos un extractor de ingredientes de pizza. Devolvé EXCLUSIVAMENTE '
                        . 'un JSON con la forma {"ingredients":["..."]}. Cada ingrediente en español, '
                        . 'en singular, normalizado y sin cantidades ni adjetivos de preparación. '
                        . 'No agregues texto fuera del JSON.',
                ],
                ['role' => 'user', 'content' => $description],
            ],
        ];

        $ch = curl_init($this->baseUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_TIMEOUT        => $this->timeout,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $this->apiKey,
            ],
            CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
        ]);

        $raw    = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($raw === false || $status >= 400) {
            error_log('[pizzalog] DeepSeek no disponible (HTTP ' . $status . '); sigo con el diccionario');
            return [];
        }

        $data    = json_decode((string) $raw, true);
        $content = $data['choices'][0]['message']['content'] ?? '';

        return $this->parseContent((string) $content);
    }

    /** @return string[] */
    private function parseContent(string $content): array
    {
        // Limpiamos posibles fences ```json ... ```
        $content = trim(preg_replace('/```(?:json)?|```/', '', $content) ?? $content);
        $json    = json_decode($content, true);
        $items   = $json['ingredients'] ?? [];

        if (!is_array($items)) {
            return [];
        }

        $out = [];
        foreach ($items as $item) {
            if (is_string($item) && trim($item) !== '') {
                $out[] = trim($item);
            }
        }
        return $out;
    }
}
