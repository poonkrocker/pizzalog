<?php
namespace Pizzalog\Repositories;

use Pizzalog\Core\Database;
use Pizzalog\Core\Text;

/**
 * Persistencia de ingredientes y de la composición de los productos.
 */
class IngredientRepository
{
    /**
     * Convierte una lista de nombres en IDs del catálogo del negocio,
     * creando los que falten (con categoría inferida del seed si se puede).
     *
     * @param string[] $names
     * @return int[]
     */
    public function resolveNames(int $businessId, array $names): array
    {
        $pdo = Database::pdo();
        $categoryMap = $this->seedCategories();

        // La búsqueda por name es case/acento-insensitive por el collation
        // utf8mb4_unicode_ci, así que no se duplican variantes.
        $find = $pdo->prepare(
            'SELECT id FROM ingredients WHERE business_id = ? AND name = ? LIMIT 1'
        );
        $insert = $pdo->prepare(
            'INSERT INTO ingredients (business_id, name, category) VALUES (?, ?, ?)'
        );

        $ids = [];
        foreach ($names as $name) {
            $name = trim((string) $name);
            if ($name === '') {
                continue;
            }

            $find->execute([$businessId, $name]);
            $row = $find->fetch();
            if ($row) {
                $ids[] = (int) $row['id'];
                continue;
            }

            $category = $categoryMap[Text::normalize($name)] ?? 'otro';
            $insert->execute([$businessId, $name, $category]);
            $ids[] = (int) $pdo->lastInsertId();
        }

        return array_values(array_unique($ids));
    }

    /**
     * Reemplaza la composición de un producto por la lista dada.
     * @param int[] $ingredientIds
     */
    public function syncProduct(int $productId, array $ingredientIds): void
    {
        $pdo = Database::pdo();
        $pdo->prepare('DELETE FROM product_ingredients WHERE product_id = ?')
            ->execute([$productId]);

        if ($ingredientIds === []) {
            return;
        }

        $stmt = $pdo->prepare(
            'INSERT INTO product_ingredients (product_id, ingredient_id) VALUES (?, ?)'
        );
        foreach (array_unique($ingredientIds) as $id) {
            $stmt->execute([$productId, (int) $id]);
        }
    }

    /** Ingredientes de un producto, para incluir en las respuestas. */
    public function forProduct(int $productId): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT i.id, i.name, i.category
               FROM product_ingredients pi
               JOIN ingredients i ON i.id = pi.ingredient_id
              WHERE pi.product_id = ?
              ORDER BY i.name'
        );
        $stmt->execute([$productId]);
        return $stmt->fetchAll();
    }

    /** Mapa nombre-normalizado => categoría, construido desde el seed. */
    private function seedCategories(): array
    {
        $map = [];
        foreach (require __DIR__ . '/../Ingredients/data/seed_ingredients.php' as $s) {
            $map[Text::normalize($s['name'])] = $s['category'];
            foreach ($s['aliases'] ?? [] as $alias) {
                $map[Text::normalize($alias)] = $s['category'];
            }
        }
        return $map;
    }
}
