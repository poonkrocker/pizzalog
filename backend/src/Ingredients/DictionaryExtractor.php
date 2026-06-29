<?php
namespace Pizzalog\Ingredients;

use Pizzalog\Core\Text;

/**
 * Motor local, sin costo ni red. Reconoce ingredientes buscando los términos
 * conocidos (nombre + alias) dentro de la descripción, tolerando errores de
 * tipeo con distancia de Levenshtein.
 *
 * Los términos se aplanan en una sola lista ordenada de más largo a más corto,
 * de modo que "salsa de tomate" se reconozca y se consuma antes que el término
 * suelto "tomate". parse() además devuelve los fragmentos que NO pudo
 * reconocer ('leftovers'), que el motor híbrido usa para decidir si llamar a la IA.
 */
class DictionaryExtractor
{
    /** @var array<int, array{term:string, name:string}> ordenado por término desc */
    private array $terms = [];

    /**
     * @param array<int, array{name:string, aliases?:string[]}> $ingredients
     */
    public function __construct(array $ingredients)
    {
        foreach ($ingredients as $ing) {
            $seen = [];
            $candidates = array_merge([$ing['name']], $ing['aliases'] ?? []);
            foreach ($candidates as $candidate) {
                $term = Text::normalize($candidate);
                if ($term === '' || isset($seen[$term])) {
                    continue;
                }
                $seen[$term] = true;
                $this->terms[] = ['term' => $term, 'name' => $ing['name']];
            }
        }

        // Términos más largos primero: prioriza "salsa de tomate" sobre "tomate".
        usort($this->terms, static fn(array $a, array $b): int => strlen($b['term']) <=> strlen($a['term']));
    }

    /**
     * @return array{matched: string[], leftovers: string[]}
     */
    public function parse(string $description): array
    {
        // Si viene "Nombre: ingredientes", nos quedamos con la parte derecha.
        $body = str_contains($description, ':')
            ? substr($description, strpos($description, ':') + 1)
            : $description;

        // Fragmentamos por comas, "y", "+" y "/".
        $fragments = preg_split('/\s*,\s*|\s+y\s+|\s*\+\s*|\s*\/\s*/u', $body) ?: [];

        $matched = [];
        $leftovers = [];

        foreach ($fragments as $fragment) {
            $fragment = trim($fragment);
            if ($fragment === '') {
                continue;
            }
            $hits = $this->matchFragment(Text::normalize($fragment));
            if ($hits === []) {
                $leftovers[] = $fragment;
            } else {
                foreach ($hits as $name) {
                    $matched[] = $name;
                }
            }
        }

        return [
            'matched'   => array_values(array_unique($matched)),
            'leftovers' => $leftovers,
        ];
    }

    /** @return string[] nombres canónicos presentes en el fragmento */
    private function matchFragment(string $normFragment): array
    {
        $names     = [];
        $already   = [];
        $remaining = ' ' . $normFragment . ' ';

        // Paso 1: coincidencias exactas por palabra, de términos largos a cortos.
        // Al encontrar uno lo consumimos, para que no lo recapture un término
        // más corto (ej. "tomate" dentro de "salsa de tomate").
        foreach ($this->terms as $entry) {
            $pattern = '/(?:^|\s)' . preg_quote($entry['term'], '/') . '(?=\s)/u';
            if (preg_match($pattern, $remaining)) {
                if (!isset($already[$entry['name']])) {
                    $names[] = $entry['name'];
                    $already[$entry['name']] = true;
                }
                $remaining = preg_replace($pattern, ' ', $remaining, 1) ?? $remaining;
            }
        }

        // Paso 2: si nada matcheó exacto, toleramos un typo (un ingrediente).
        if ($names === []) {
            foreach ($this->terms as $entry) {
                if ($this->fuzzy($normFragment, $entry['term'])) {
                    return [$entry['name']];
                }
            }
        }

        return $names;
    }

    /** Tolerancia a typos para términos de una sola palabra. */
    private function fuzzy(string $fragment, string $term): bool
    {
        if (str_contains($term, ' ')) {
            return false;
        }
        foreach (explode(' ', $fragment) as $word) {
            if ($word === '') {
                continue;
            }
            $threshold = max(strlen($word), strlen($term)) <= 5 ? 1 : 2;
            if (levenshtein($word, $term) <= $threshold) {
                return true;
            }
        }
        return false;
    }
}
