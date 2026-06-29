<?php
namespace Pizzalog\Ingredients;

use Pizzalog\Core\Config;
use Pizzalog\Core\Database;

/**
 * Arma el extractor híbrido para un negocio:
 *  - diccionario = seed estático + ingredientes que el negocio ya cargó
 *    (por eso el reconocimiento mejora solo con el uso);
 *  - IA = DeepSeek, solo si hay api_key configurada.
 */
class ExtractorFactory
{
    public static function forBusiness(int $businessId): HybridExtractor
    {
        $known = [];

        // 1) Seed de pizzería argentina.
        foreach (require __DIR__ . '/data/seed_ingredients.php' as $s) {
            $known[] = ['name' => $s['name'], 'aliases' => $s['aliases'] ?? []];
        }

        // 2) Ingredientes ya cargados por el negocio.
        $stmt = Database::pdo()->prepare(
            'SELECT name FROM ingredients WHERE business_id = ? AND is_active = 1'
        );
        $stmt->execute([$businessId]);
        foreach ($stmt->fetchAll() as $row) {
            $known[] = ['name' => $row['name'], 'aliases' => []];
        }

        $dictionary = new DictionaryExtractor($known);

        // 3) IA opcional.
        $ds = Config::get('deepseek', []);
        $ai = null;
        if (!empty($ds['api_key'])) {
            $ai = new DeepSeekExtractor(
                (string) $ds['api_key'],
                (string) ($ds['base_url'] ?? 'https://api.deepseek.com/chat/completions'),
                (string) ($ds['model'] ?? 'deepseek-v4-flash'),
                (int) ($ds['timeout'] ?? 8)
            );
        }

        return new HybridExtractor($dictionary, $ai);
    }
}
