<?php
namespace Pizzalog\Repositories;

use Pizzalog\Core\Database;

/**
 * Gestiona el modelo de variantes combinables de un producto:
 *   opciones (dimensiones) → valores → variantes (combinaciones) → puente.
 */
class VariantRepository
{
    /** Lectura completa de un producto: opciones con sus valores + variantes. */
    public function forProduct(int $bid, int $productId): array
    {
        $pdo = Database::pdo();

        // Opciones + valores
        $opts = $pdo->prepare(
            'SELECT id, name, sort_order FROM product_options
              WHERE product_id = ? AND business_id = ? ORDER BY sort_order, id'
        );
        $opts->execute([$productId, $bid]);
        $options = [];
        foreach ($opts->fetchAll() as $o) {
            $vals = $pdo->prepare(
                'SELECT id, value, sort_order FROM product_option_values
                  WHERE option_id = ? ORDER BY sort_order, id'
            );
            $vals->execute([$o['id']]);
            $options[] = [
                'id'         => (int) $o['id'],
                'name'       => $o['name'],
                'sort_order' => (int) $o['sort_order'],
                'values'     => array_map(static fn (array $v): array => [
                    'id'         => (int) $v['id'],
                    'value'      => $v['value'],
                    'sort_order' => (int) $v['sort_order'],
                ], $vals->fetchAll()),
            ];
        }

        // Variantes + los valores que componen cada una (puente)
        $vstmt = $pdo->prepare(
            'SELECT id, label, price, sku, sort_order, is_active FROM product_variants
              WHERE product_id = ? AND business_id = ? ORDER BY sort_order, id'
        );
        $vstmt->execute([$productId, $bid]);
        $variants = [];
        $variantIds = [];
        foreach ($vstmt->fetchAll() as $v) {
            $variantIds[] = (int) $v['id'];
            $variants[(int) $v['id']] = [
                'id'               => (int) $v['id'],
                'label'            => $v['label'],
                'price'            => (float) $v['price'],
                'sku'              => $v['sku'],
                'sort_order'       => (int) $v['sort_order'],
                'is_active'        => (int) $v['is_active'],
                'option_value_ids' => [],
            ];
        }
        if ($variantIds) {
            $in   = implode(',', array_fill(0, count($variantIds), '?'));
            $bstmt = $pdo->prepare(
                "SELECT variant_id, option_value_id FROM variant_option_values
                  WHERE variant_id IN ($in)"
            );
            $bstmt->execute($variantIds);
            foreach ($bstmt->fetchAll() as $row) {
                $variants[(int) $row['variant_id']]['option_value_ids'][] = (int) $row['option_value_id'];
            }
        }

        return ['options' => $options, 'variants' => array_values($variants)];
    }

    /**
     * Define opciones y valores y REGENERA las variantes (producto cartesiano).
     * Preserva el precio de las combinaciones cuyo label se mantiene.
     *
     * @param array<int, array{name:string, values:array<int,string>}> $options
     */
    public function setOptions(int $bid, int $productId, array $options): void
    {
        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            // 1) Snapshot de precios actuales por label (para preservarlos)
            $prev = $pdo->prepare(
                'SELECT label, price FROM product_variants WHERE product_id = ? AND business_id = ?'
            );
            $prev->execute([$productId, $bid]);
            $priceByLabel = [];
            foreach ($prev->fetchAll() as $r) {
                $priceByLabel[$r['label']] = (float) $r['price'];
            }

            // 2) Borrar variantes (cascada al puente) y opciones (cascada a valores)
            $pdo->prepare('DELETE FROM product_variants WHERE product_id = ? AND business_id = ?')
                ->execute([$productId, $bid]);
            $pdo->prepare('DELETE FROM product_options WHERE product_id = ? AND business_id = ?')
                ->execute([$productId, $bid]);

            $hasVariants = count($options) > 0;

            if ($hasVariants) {
                // 3) Crear opciones + valores, recolectando ids de valores por opción
                $insOpt = $pdo->prepare(
                    'INSERT INTO product_options (business_id, product_id, name, sort_order) VALUES (?, ?, ?, ?)'
                );
                $insVal = $pdo->prepare(
                    'INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (?, ?, ?, ?)'
                );
                $valuesPerOption = []; // [ [ ['id'=>, 'value'=>], ... ], ... ]
                foreach ($options as $oi => $opt) {
                    $insOpt->execute([$bid, $productId, $opt['name'], $oi]);
                    $optionId = (int) $pdo->lastInsertId();
                    $vals = [];
                    foreach (array_values($opt['values']) as $vi => $val) {
                        $insVal->execute([$bid, $optionId, $val, $vi]);
                        $vals[] = ['id' => (int) $pdo->lastInsertId(), 'value' => $val];
                    }
                    $valuesPerOption[] = $vals;
                }

                // 4) Producto cartesiano → variantes + puente
                $combos = $this->cartesian($valuesPerOption);
                $insVar = $pdo->prepare(
                    'INSERT INTO product_variants (business_id, product_id, label, price, sort_order)
                     VALUES (?, ?, ?, ?, ?)'
                );
                $insBridge = $pdo->prepare(
                    'INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (?, ?)'
                );
                foreach ($combos as $ci => $combo) {
                    $label = implode(' / ', array_column($combo, 'value'));
                    $price = $priceByLabel[$label] ?? 0.00;
                    $insVar->execute([$bid, $productId, $label, $price, $ci]);
                    $variantId = (int) $pdo->lastInsertId();
                    foreach ($combo as $v) {
                        $insBridge->execute([$variantId, $v['id']]);
                    }
                }
            }

            // 5) Flag en el producto
            $pdo->prepare('UPDATE products SET has_variants = ? WHERE id = ? AND business_id = ?')
                ->execute([$hasVariants ? 1 : 0, $productId, $bid]);

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Actualiza precio, sku, estado y orden de variantes ya existentes.
     *
     * @param array<int, array{id:int, price:float, sku:?string, is_active:int, sort_order:int}> $variants
     */
    public function updateVariants(int $bid, int $productId, array $variants): void
    {
        $pdo = Database::pdo();
        $stmt = $pdo->prepare(
            'UPDATE product_variants
                SET price = ?, sku = ?, is_active = ?, sort_order = ?
              WHERE id = ? AND product_id = ? AND business_id = ?'
        );
        foreach ($variants as $v) {
            $stmt->execute([
                $v['price'], $v['sku'], $v['is_active'], $v['sort_order'],
                $v['id'], $productId, $bid,
            ]);
        }
    }

    /** Producto cartesiano de los valores de cada opción. */
    private function cartesian(array $valuesPerOption): array
    {
        $result = [[]];
        foreach ($valuesPerOption as $values) {
            $next = [];
            foreach ($result as $combo) {
                foreach ($values as $v) {
                    $next[] = array_merge($combo, [$v]);
                }
            }
            $result = $next;
        }
        return $result;
    }
}
