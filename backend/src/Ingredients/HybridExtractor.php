<?php
namespace Pizzalog\Ingredients;

use Pizzalog\Core\Text;

/**
 * Motor híbrido: usa el diccionario local (gratis) y solo recurre a la IA
 * cuando quedaron fragmentos sin reconocer. Une los resultados sin duplicar.
 */
class HybridExtractor implements IngredientExtractor
{
    public function __construct(
        private DictionaryExtractor $dictionary,
        private ?DeepSeekExtractor $ai = null
    ) {
    }

    /** @return string[] */
    public function extract(string $description): array
    {
        $result = $this->dictionary->parse($description);
        $names  = $result['matched'];

        // Solo gastamos una llamada a la IA si el diccionario no llegó a todo.
        if ($result['leftovers'] !== [] && $this->ai !== null) {
            foreach ($this->ai->extract($description) as $aiName) {
                $names[] = $aiName;
            }
        }

        return $this->dedupe($names);
    }

    /** Quita duplicados ignorando mayúsculas y acentos. */
    private function dedupe(array $names): array
    {
        $seen = [];
        $out  = [];
        foreach ($names as $name) {
            $key = Text::normalize($name);
            if ($key === '' || isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $out[] = $name;
        }
        return $out;
    }
}
