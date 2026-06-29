<?php
namespace Pizzalog\Ingredients;

/**
 * Contrato de cualquier motor de extracción de ingredientes.
 * Permite cambiar diccionario / IA / lo que sea sin tocar el resto.
 */
interface IngredientExtractor
{
    /** @return string[] nombres de ingredientes detectados */
    public function extract(string $description): array;
}
