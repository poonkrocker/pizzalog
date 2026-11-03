<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

/**
 * Recetario con subrecetas reutilizables y costeo operativo mensual.
 * Las sugerencias de precio usan ingredientes; los gastos operativos son independientes.
 */
class RecipeCostingController
{
    /**
     * Respaldo defensivo de esquema por si la migración 027 aún no corrió en el entorno.
     */
    private function ensureTables(\PDO $pdo): void
    {
        $pdo->exec("CREATE TABLE IF NOT EXISTS recipe_studio_recipes (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, business_id BIGINT UNSIGNED NOT NULL,
          linked_product_id BIGINT UNSIGNED NULL, name VARCHAR(160) NOT NULL,
          recipe_type ENUM('product','subrecipe') NOT NULL DEFAULT 'product',
          yield_quantity DECIMAL(12,4) NOT NULL DEFAULT 1, yield_unit VARCHAR(24) NOT NULL DEFAULT 'u',
          price DECIMAL(12,2) NOT NULL DEFAULT 0, target_food_cost_pct DECIMAL(5,2) NOT NULL DEFAULT 30,
          is_active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id), KEY idx_recipe_studio_business (business_id),
          CONSTRAINT fk_recipe_studio_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $pdo->exec("CREATE TABLE IF NOT EXISTS recipe_studio_components (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, business_id BIGINT UNSIGNED NOT NULL,
          recipe_id BIGINT UNSIGNED NOT NULL, component_type ENUM('supply','recipe') NOT NULL,
          supply_id BIGINT UNSIGNED NULL, component_recipe_id BIGINT UNSIGNED NULL,
          quantity DECIMAL(12,4) NOT NULL, unit VARCHAR(24) NOT NULL DEFAULT 'kg', sort_order INT NOT NULL DEFAULT 0,
          PRIMARY KEY (id), KEY idx_recipe_components_recipe (business_id, recipe_id),
          KEY idx_recipe_components_subrecipe (business_id, component_recipe_id),
          CONSTRAINT fk_recipe_component_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
          CONSTRAINT fk_recipe_component_parent FOREIGN KEY (recipe_id) REFERENCES recipe_studio_recipes(id) ON DELETE CASCADE,
          CONSTRAINT fk_recipe_component_supply FOREIGN KEY (supply_id) REFERENCES supplies(id) ON DELETE RESTRICT,
          CONSTRAINT fk_recipe_component_child FOREIGN KEY (component_recipe_id) REFERENCES recipe_studio_recipes(id) ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $pdo->exec("CREATE TABLE IF NOT EXISTS business_cost_items (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, business_id BIGINT UNSIGNED NOT NULL,
          name VARCHAR(160) NOT NULL,
          category ENUM('employees','rent','utilities','services','taxes','maintenance','software','other') NOT NULL DEFAULT 'other',
          quantity DECIMAL(12,3) NOT NULL DEFAULT 1, amount DECIMAL(12,2) NOT NULL DEFAULT 0,
          period ENUM('monthly','weekly','daily','yearly') NOT NULL DEFAULT 'monthly',
          is_active TINYINT(1) NOT NULL DEFAULT 1, notes VARCHAR(500) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id), KEY idx_business_cost_items_business (business_id, is_active),
          CONSTRAINT fk_business_cost_items_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    }

    /**
     * Cuenta cuántos productos activos tienen composición en product_ingredients
     * pero aún no fueron importados a recipe_studio_recipes.
     */
    private function countUnimportedLegacyRecipes(\PDO $pdo, int $bid): int
    {
        $stmt = $pdo->prepare("SELECT COUNT(*)
            FROM products p
            WHERE p.business_id=? AND p.is_active=1
              AND EXISTS (SELECT 1 FROM product_ingredients pi WHERE pi.product_id=p.id)
              AND NOT EXISTS (
                SELECT 1 FROM recipe_studio_recipes rs
                WHERE rs.business_id=p.business_id AND rs.linked_product_id=p.id AND rs.is_active=1
              )");
        $stmt->execute([$bid]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Importa al estudio de recetas los productos que ya tenían composición
     * en product_ingredients (incluidas las recetas cargadas desde Excel).
     * Se ejecuta de forma idempotente únicamente bajo pedido explícito POST (Auditoría P1.2).
     */
    private function importExistingProductRecipes(\PDO $pdo, int $bid): int
    {
        $products = $pdo->prepare("SELECT p.id,p.name,p.price
            FROM products p
            WHERE p.business_id=? AND p.is_active=1
              AND NOT EXISTS (
                SELECT 1 FROM recipe_studio_recipes rs
                WHERE rs.business_id=p.business_id AND rs.linked_product_id=p.id AND rs.is_active=1
              )
            ORDER BY p.id");
        $products->execute([$bid]);
        $findSupply = $pdo->prepare("SELECT id,unit FROM supplies WHERE business_id=? AND name=? LIMIT 1");
        $createSupply = $pdo->prepare("INSERT INTO supplies (business_id,name,category,unit,cost,is_active)
            VALUES (?,?,?,?,0,1) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)");
        $activateSupply = $pdo->prepare("UPDATE supplies SET is_active=1 WHERE id=? AND business_id=?");
        $insertRecipe = $pdo->prepare("INSERT INTO recipe_studio_recipes
            (business_id,linked_product_id,name,recipe_type,yield_quantity,yield_unit,price,target_food_cost_pct,is_active)
            VALUES (?,?,?,'product',1,'u',?,30,1)");
        $legacyComponents = $pdo->prepare("SELECT pi.ingredient_id,pi.quantity,pi.unit,i.name AS ingredient_name,i.category AS ingredient_category
            FROM product_ingredients pi
            INNER JOIN ingredients i ON i.id=pi.ingredient_id AND i.business_id=?
            WHERE pi.product_id=? ORDER BY i.name");
        $insertComponent = $pdo->prepare("INSERT INTO recipe_studio_components
            (business_id,recipe_id,component_type,supply_id,component_recipe_id,quantity,unit,sort_order)
            VALUES (?,?,'supply',?,NULL,?,?,?)");
        $importedCount = 0;
        foreach ($products->fetchAll(\PDO::FETCH_ASSOC) as $product) {
            $insertRecipe->execute([$bid,(int)$product['id'],(string)$product['name'],(float)$product['price']]);
            $recipeId = (int)$pdo->lastInsertId();
            $importedCount++;
            $legacyComponents->execute([$bid,(int)$product['id']]);
            $order = 0;
            foreach ($legacyComponents->fetchAll(\PDO::FETCH_ASSOC) as $component) {
                $ingredientName = trim((string)$component['ingredient_name']);
                if ($ingredientName === '') continue;
                $findSupply->execute([$bid,$ingredientName]);
                $supply = $findSupply->fetch(\PDO::FETCH_ASSOC);
                if (!$supply) {
                    $unit = trim((string)($component['unit'] ?? '')) ?: 'u';
                    $category = trim((string)($component['ingredient_category'] ?? '')) ?: 'Otros';
                    $createSupply->execute([$bid,$ingredientName,$category,$unit]);
                    $findSupply->execute([$bid,$ingredientName]);
                    $supply = $findSupply->fetch(\PDO::FETCH_ASSOC);
                }
                if (!$supply) continue;
                $supplyId = (int)$supply['id'];
                $activateSupply->execute([$supplyId,$bid]);
                $unit = trim((string)($component['unit'] ?? '')) ?: (string)($supply['unit'] ?? 'u');
                $quantity = $component['quantity'] !== null ? max(0.0001,(float)$component['quantity']) : 1.0;
                $insertComponent->execute([$bid,$recipeId,$supplyId,$quantity,$unit,$order++]);
            }
        }
        return $importedCount;
    }

    /**
     * POST /production/recipe-studio/import-legacy
     * Importa explícitamente las recetas del catálogo tradicional a Recipe Studio sin mutar en GET.
     */
    public function importLegacyRecipes(Request $req): void
    {
        $bid = (int)$req->auth['business_id'];
        $pdo = Database::pdo();
        $this->ensureTables($pdo);
        $pdo->beginTransaction();
        try {
            $imported = $this->importExistingProductRecipes($pdo, $bid);
            $pdo->commit();
            Response::ok(['success' => true, 'imported_count' => $imported]);
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            Response::error('No se pudieron importar las recetas históricas: ' . $e->getMessage(), 500);
        }
    }

    public function recipesIndex(Request $req): void
    {
        $bid = (int)$req->auth['business_id'];
        $pdo = Database::pdo();
        $this->ensureTables($pdo);
        $legacyUnimportedCount = $this->countUnimportedLegacyRecipes($pdo, $bid);

        $stmt = $pdo->prepare("SELECT id, name, recipe_type, linked_product_id, yield_quantity, yield_unit, price, target_food_cost_pct
            FROM recipe_studio_recipes WHERE business_id = ? AND is_active = 1 ORDER BY recipe_type, name");
        $stmt->execute([$bid]);
        $recipes = array_map(static function(array $row): array {
            $row['id'] = (int)$row['id'];
            $row['linked_product_id'] = $row['linked_product_id'] !== null ? (int)$row['linked_product_id'] : null;
            $row['yield_quantity'] = (float)$row['yield_quantity'];
            $row['price'] = (float)$row['price'];
            $row['target_food_cost_pct'] = (float)$row['target_food_cost_pct'];
            // Los importes calculados se completan exclusivamente con @pizzalog/cost-engine.
            $row['batch_cost'] = null;
            $row['unit_cost'] = null;
            $row['suggested_price'] = null;
            $row['food_cost_pct'] = null;
            $row['warnings'] = [];
            $row['is_incomplete'] = true;
            return $row;
        }, $stmt->fetchAll(\PDO::FETCH_ASSOC));

        $sup = $pdo->prepare("SELECT id, name, category, unit, cost
            FROM supplies WHERE business_id = ? AND is_active = 1 ORDER BY name");
        $sup->execute([$bid]);
        $supplies = array_map(static function(array $row): array {
            $row['id'] = (int)$row['id'];
            $row['cost'] = $row['cost'] !== null ? (float)$row['cost'] : null;
            return $row;
        }, $sup->fetchAll(\PDO::FETCH_ASSOC));

        $productsStmt = $pdo->prepare("SELECT id, name, price FROM products WHERE business_id = ? AND is_active = 1 ORDER BY name");
        $productsStmt->execute([$bid]);
        $products = array_map(static function(array $row): array {
            $row['id'] = (int)$row['id'];
            $row['price'] = (float)$row['price'];
            return $row;
        }, $productsStmt->fetchAll(\PDO::FETCH_ASSOC));

        $allComponents = $pdo->prepare("SELECT c.recipe_id, c.component_type, c.supply_id, c.component_recipe_id,
                c.quantity, c.unit, s.name AS supply_name, s.unit AS supply_unit,
                r.name AS recipe_name, r.yield_unit AS recipe_unit
            FROM recipe_studio_components c
            LEFT JOIN supplies s ON s.id = c.supply_id AND s.business_id = c.business_id
            LEFT JOIN recipe_studio_recipes r ON r.id = c.component_recipe_id AND r.business_id = c.business_id
            WHERE c.business_id = ? ORDER BY c.recipe_id, c.sort_order, c.id");
        $allComponents->execute([$bid]);
        $byRecipe = [];
        foreach ($allComponents->fetchAll(\PDO::FETCH_ASSOC) as $row) {
            $byRecipe[(int)$row['recipe_id']][] = $row;
        }

        foreach ($recipes as &$recipe) {
            $id = (int)$recipe['id'];
            $recipe['components'] = array_map(static function(array $component): array {
                $isSupply = $component['component_type'] === 'supply';
                return [
                    'component_type' => (string)$component['component_type'],
                    'component_id' => $isSupply ? (int)$component['supply_id'] : (int)$component['component_recipe_id'],
                    'name' => $isSupply ? (string)($component['supply_name'] ?? 'Insumo') : (string)($component['recipe_name'] ?? 'Subreceta'),
                    'quantity' => (float)$component['quantity'],
                    'unit' => (string)$component['unit'],
                    'cost_unit' => $isSupply ? (string)($component['supply_unit'] ?? $component['unit']) : (string)($component['recipe_unit'] ?? $component['unit']),
                    'unit_cost' => null,
                    'total_cost' => null,
                ];
            }, $byRecipe[$id] ?? []);
        }
        unset($recipe);

        Response::ok([
            'recipes' => $recipes,
            'supplies' => $supplies,
            'products' => $products,
            'legacy_unimported_count' => $legacyUnimportedCount,
        ]);
    }

    public function recipesSave(Request $req): void
    {
        $bid=(int)$req->auth['business_id']; $b=$req->body; $pdo=Database::pdo(); $this->ensureTables($pdo);
        $id=!empty($b['id'])?(int)$b['id']:null; $name=trim((string)($b['name']??''));
        $type=($b['recipe_type']??'product')==='subrecipe'?'subrecipe':'product';
        $yield=max(0.0001,(float)($b['yield_quantity']??1)); $yieldUnit=trim((string)($b['yield_unit']??'u')) ?: 'u';
        $price=max(0,(float)($b['price']??0)); $target=max(1,min(100,(float)($b['target_food_cost_pct']??30)));
        $linked=!empty($b['linked_product_id'])?(int)$b['linked_product_id']:null;
        $components=is_array($b['components']??null)?$b['components']:[];
        $costByProduct = [];
        foreach (is_array($b['cost_snapshots'] ?? null) ? $b['cost_snapshots'] : [] as $snapshot) {
            if (!is_array($snapshot)) continue;
            $productId = (int)($snapshot['linked_product_id'] ?? 0);
            $unitCost = $snapshot['unit_cost'] ?? null;
            if ($productId <= 0 || !is_numeric($unitCost) || !is_finite((float)$unitCost) || (float)$unitCost < 0) {
                Response::error('El snapshot de costo enviado por Cost Engine no es válido.', 422);
            }
            $costByProduct[$productId] = round((float)$unitCost, 2);
        }
        if($name===''){Response::error('El nombre de la receta es obligatorio.',422);return;}
        if(!$components){Response::error('Agregá al menos un ingrediente o componente.',422);return;}
        if($type==='subrecipe'){$linked=null;$price=0;}
        if($linked){
            $chk=$pdo->prepare('SELECT id FROM products WHERE id=? AND business_id=? AND is_active=1');$chk->execute([$linked,$bid]);
            if(!$chk->fetchColumn()){Response::error('El producto vinculado no existe.',422);return;}
        }
        $pdo->beginTransaction();
        try {
            if($id){
                $chk=$pdo->prepare('SELECT id FROM recipe_studio_recipes WHERE id=? AND business_id=? AND is_active=1');$chk->execute([$id,$bid]);
                if(!$chk->fetchColumn()) throw new \RuntimeException('Receta no encontrada.');
                $q=$pdo->prepare('UPDATE recipe_studio_recipes SET linked_product_id=?, name=?, recipe_type=?, yield_quantity=?, yield_unit=?, price=?, target_food_cost_pct=? WHERE id=? AND business_id=?');
                $q->execute([$linked,$name,$type,$yield,$yieldUnit,$price,$target,$id,$bid]);
                $rid=$id;
            } else {
                $q=$pdo->prepare('INSERT INTO recipe_studio_recipes (business_id,linked_product_id,name,recipe_type,yield_quantity,yield_unit,price,target_food_cost_pct) VALUES (?,?,?,?,?,?,?,?)');
                $q->execute([$bid,$linked,$name,$type,$yield,$yieldUnit,$price,$target]);$rid=(int)$pdo->lastInsertId();
            }
            $pdo->prepare('DELETE FROM recipe_studio_components WHERE recipe_id=? AND business_id=?')->execute([$rid,$bid]);
            $supplyCheck=$pdo->prepare('SELECT id, name, unit FROM supplies WHERE id=? AND business_id=? AND is_active=1');
            $recipeCheck=$pdo->prepare('SELECT id, name, yield_unit FROM recipe_studio_recipes WHERE id=? AND business_id=? AND is_active=1');
            $ins=$pdo->prepare('INSERT INTO recipe_studio_components (business_id,recipe_id,component_type,supply_id,component_recipe_id,quantity,unit,sort_order) VALUES (?,?,?,?,?,?,?,?)');
            foreach($components as $i=>$c){
                $qty=max(0,(float)($c['quantity']??0)); if($qty<=0) continue;
                $ct=($c['component_type']??'supply')==='recipe'?'recipe':'supply';$cid=(int)($c['component_id']??0);
                $unit=trim((string)($c['unit']??'kg'))?:'kg';
                if($ct==='supply'){
                    $supplyCheck->execute([$cid,$bid]);
                    $supRow=$supplyCheck->fetch(\PDO::FETCH_ASSOC);
                    if(!$supRow)throw new \RuntimeException('Uno de los insumos no existe o está inactivo.');
                    $sid=$cid;$child=null;
                } else {
                    if($cid===$rid)throw new \RuntimeException('Una receta no puede incluirse a sí misma.');
                    $recipeCheck->execute([$cid,$bid]);
                    $recRow=$recipeCheck->fetch(\PDO::FETCH_ASSOC);
                    if(!$recRow)throw new \RuntimeException('Una subreceta seleccionada no existe.');
                    // Impedir ciclos: ¿la receta actual está dentro de las dependencias de la subreceta?
                    if($this->dependsOn($pdo,$bid,$cid,$rid,[]))throw new \RuntimeException('Esta combinación generaría un ciclo de subrecetas.');
                    $sid=null;$child=$cid;
                }
                $ins->execute([$bid,$rid,$ct,$sid,$child,$qty,$unit,(int)$i]);
            }
            // Persistir únicamente los snapshots calculados por Cost Engine en el cliente.
            // La API no vuelve a calcular costos; solo actualiza la proyección del producto.
            $linkedRecipes = $pdo->prepare('SELECT id, linked_product_id, name, price, yield_quantity
                FROM recipe_studio_recipes WHERE business_id=? AND is_active=1 AND recipe_type=\'product\' AND linked_product_id IS NOT NULL');
            $linkedRecipes->execute([$bid]);
            $linkedRows = $linkedRecipes->fetchAll(\PDO::FETCH_ASSOC);
            $allowedProductIds = [];
            foreach ($linkedRows as $linkedRow) {
                $allowedProductIds[(int)$linkedRow['linked_product_id']] = true;
            }
            foreach ($costByProduct as $productId => $_unitCost) {
                if (!isset($allowedProductIds[(int)$productId])) {
                    throw new \RuntimeException('Cost Engine envió un costo para un producto que no está vinculado a una receta activa de este negocio.');
                }
            }

            $updateProduct = $pdo->prepare('UPDATE products SET name=?, price=? WHERE id=? AND business_id=?');
            $updateProductWithCost = $pdo->prepare('UPDATE products SET name=?, price=?, cost=? WHERE id=? AND business_id=?');
            foreach ($linkedRows as $linkedRow) {
                $linkedProduct = (int)$linkedRow['linked_product_id'];
                $linkedYield = max(0.0001, (float)$linkedRow['yield_quantity']);
                if (array_key_exists($linkedProduct, $costByProduct)) {
                    $updateProductWithCost->execute([
                        $linkedRow['name'], (float)$linkedRow['price'], $costByProduct[$linkedProduct], $linkedProduct, $bid,
                    ]);
                } else {
                    // Sin resultado completo no se reemplaza el costo previo por cero ni por una estimación parcial.
                    $updateProduct->execute([$linkedRow['name'], (float)$linkedRow['price'], $linkedProduct, $bid]);
                }
                // Proyección operativa de ingredientes; no realiza cálculos de costo.
                $this->syncLinkedProductIngredients($pdo, $bid, $linkedProduct, (int)$linkedRow['id'], $linkedYield);
            }
            $pdo->commit();
            Response::ok(['success'=>true,'id'=>$rid]);
        } catch(\Throwable $e) {
            if($pdo->inTransaction())$pdo->rollBack();
            Response::error('No se pudo guardar la receta: '.$e->getMessage(),422);
        }
    }

    /**
     * Expande una receta con sus subrecetas hasta llegar a insumos comprables.
     * El multiplicador permite normalizar todos los gramajes al rendimiento vendible.
     */
    private function flattenRecipeComponents(\PDO $pdo, int $bid, int $recipeId, float $multiplier, array $path): array
    {
        if (in_array($recipeId, $path, true)) throw new \RuntimeException('Se detectó un ciclo al expandir la receta.');
        $path[] = $recipeId;
        $stmt = $pdo->prepare("SELECT c.component_type,c.quantity,c.unit,c.supply_id,c.component_recipe_id,
            s.name AS supply_name,s.category AS supply_category,s.unit AS supply_unit,
            r.yield_quantity AS child_yield,r.yield_unit AS child_unit
            FROM recipe_studio_components c
            LEFT JOIN supplies s ON s.id=c.supply_id AND s.business_id=c.business_id
            LEFT JOIN recipe_studio_recipes r ON r.id=c.component_recipe_id AND r.business_id=c.business_id
            WHERE c.business_id=? AND c.recipe_id=? ORDER BY c.sort_order,c.id");
        $stmt->execute([$bid, $recipeId]);
        $flat = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $component) {
            $quantity = (float)$component['quantity'];
            if ($component['component_type'] === 'supply') {
                $supplyId = (int)$component['supply_id'];
                $unit = (string)($component['supply_unit'] ?? $component['unit']);
                $converted = $this->convertQuantity($quantity, (string)$component['unit'], $unit) * $multiplier;
                if (!isset($flat[$supplyId])) {
                    $flat[$supplyId] = [
                        'supply_id' => $supplyId,
                        'name' => (string)$component['supply_name'],
                        'category' => (string)($component['supply_category'] ?? ''),
                        'quantity' => 0.0,
                        'unit' => $unit,
                    ];
                }
                $flat[$supplyId]['quantity'] += $converted;
            } else {
                $childId = (int)$component['component_recipe_id'];
                $childUnit = (string)($component['child_unit'] ?? $component['unit']);
                $converted = $this->convertQuantity($quantity, (string)$component['unit'], $childUnit);
                $childYield = max(0.0001, (float)$component['child_yield']);
                $childFlat = $this->flattenRecipeComponents($pdo, $bid, $childId, $multiplier * ($converted / $childYield), $path);
                foreach ($childFlat as $supplyId => $line) {
                    if (!isset($flat[$supplyId])) $flat[$supplyId] = $line;
                    else $flat[$supplyId]['quantity'] += $line['quantity'];
                }
            }
        }
        foreach ($flat as &$line) $line['quantity'] = round((float)$line['quantity'], 6);
        unset($line);
        return $flat;
    }

    private function mapIngredientCategory(string $supplyCategory): string
    {
        $c = strtolower($supplyCategory);
        if (str_contains($c, 'masa') || str_contains($c, 'harina')) return 'masa';
        if (str_contains($c, 'salsa')) return 'salsa';
        if (str_contains($c, 'queso') || str_contains($c, 'lácteo') || str_contains($c, 'lacteo')) return 'queso';
        if (str_contains($c, 'fiambre') || str_contains($c, 'embutido')) return 'fiambre';
        if (str_contains($c, 'verdul') || str_contains($c, 'vegetal')) return 'vegetal';
        if (str_contains($c, 'fruta')) return 'fruta';
        if (str_contains($c, 'condimento') || str_contains($c, 'especia')) return 'condimento';
        return 'otro';
    }

    private function syncLinkedProductIngredients(\PDO $pdo, int $bid, int $productId, int $recipeId, float $yield): void
    {
        $flat = $this->flattenRecipeComponents($pdo, $bid, $recipeId, 1 / max(0.0001, $yield), []);
        $pdo->prepare('DELETE FROM product_ingredients WHERE product_id=?')->execute([$productId]);
        $findIngredient = $pdo->prepare('SELECT id FROM ingredients WHERE business_id=? AND name=? LIMIT 1');
        $insertIngredient = $pdo->prepare('INSERT INTO ingredients (business_id,name,category,is_active) VALUES (?,?,?,1)');
        $insertLink = $pdo->prepare('INSERT INTO product_ingredients (product_id,ingredient_id,quantity,unit) VALUES (?,?,?,?)
            ON DUPLICATE KEY UPDATE quantity=VALUES(quantity),unit=VALUES(unit)');
        foreach ($flat as $line) {
            if ($line['quantity'] <= 0) continue;
            $findIngredient->execute([$bid, $line['name']]);
            $ingredientId = $findIngredient->fetchColumn();
            if (!$ingredientId) {
                $insertIngredient->execute([$bid, $line['name'], $this->mapIngredientCategory((string)$line['category'])]);
                $ingredientId = (int)$pdo->lastInsertId();
            }
            $insertLink->execute([$productId, (int)$ingredientId, $line['quantity'], $line['unit']]);
        }
    }

    private function convertQuantity(float $quantity, string $from, string $to): float
    {
        $from = strtolower(trim($from)); $to = strtolower(trim($to));
        if ($from === $to) return $quantity;
        $groups = [
            ['kg'=>1.0,'kilo'=>1.0,'kilos'=>1.0,'g'=>0.001,'gr'=>0.001,'gramo'=>0.001,'gramos'=>0.001],
            ['l'=>1.0,'lt'=>1.0,'litro'=>1.0,'litros'=>1.0,'cc'=>0.001,'ml'=>0.001],
            ['u'=>1.0,'un'=>1.0,'unidad'=>1.0,'unidades'=>1.0],
        ];
        foreach ($groups as $group) {
            if (isset($group[$from]) && isset($group[$to])) return $quantity * $group[$from] / $group[$to];
        }
        return 0.0;
    }

    private function dependsOn(\PDO $pdo,int $bid,int $current,int $target,array $seen): bool
    {
        if($current===$target)return true;
        if(in_array($current,$seen,true))return false;
        $seen[]=$current;
        $q=$pdo->prepare("SELECT component_recipe_id FROM recipe_studio_components WHERE business_id=? AND recipe_id=? AND component_type='recipe'");
        $q->execute([$bid,$current]);
        foreach($q->fetchAll(\PDO::FETCH_COLUMN) as $child) if($this->dependsOn($pdo,$bid,(int)$child,$target,$seen))return true;
        return false;
    }

    public function businessCostsGet(Request $req): void
    {
        $bid=(int)$req->auth['business_id'];$pdo=Database::pdo();$this->ensureTables($pdo);
        $q=$pdo->prepare("SELECT id,name,category,quantity,amount,period,notes FROM business_cost_items WHERE business_id=? AND is_active=1 ORDER BY category,name");
        $q->execute([$bid]);$items=[];
        $factor=['monthly'=>1,'weekly'=>52/12,'daily'=>365/12,'yearly'=>1/12];$total=0.0;
        foreach($q->fetchAll(\PDO::FETCH_ASSOC) as $r){
            $r['id']=(int)$r['id'];$r['quantity']=(float)$r['quantity'];$r['amount']=(float)$r['amount'];
            $r['monthly_total']=round($r['quantity']*$r['amount']*($factor[$r['period']] ?? 1),2);
            $total+=$r['monthly_total'];$items[]=$r;
        }
        Response::ok(['items'=>$items,'monthly_total'=>round($total,2)]);
    }

    public function businessCostsSave(Request $req): void
    {
        $bid=(int)$req->auth['business_id'];$b=$req->body;$pdo=Database::pdo();$this->ensureTables($pdo);
        $items=is_array($b['items']??null)?$b['items']:[];
        $allowed=['employees','rent','utilities','services','taxes','maintenance','software','other'];
        $periods=['monthly','weekly','daily','yearly'];
        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE business_cost_items SET is_active=0 WHERE business_id=?')->execute([$bid]);
            $q=$pdo->prepare('INSERT INTO business_cost_items (business_id,name,category,quantity,amount,period,notes,is_active) VALUES (?,?,?,?,?,?,?,1)');
            foreach($items as $it){
                $name=trim((string)($it['name']??''));if($name==='')continue;
                $cat=in_array($it['category']??'other',$allowed,true)?$it['category']:'other';
                $period=in_array($it['period']??'monthly',$periods,true)?$it['period']:'monthly';
                $quantity=max(0,(float)($it['quantity']??1));$amount=max(0,(float)($it['amount']??0));
                $q->execute([$bid,$name,$cat,$quantity,$amount,$period,trim((string)($it['notes']??''))?:null]);
            }
            $pdo->commit();Response::ok(['success'=>true]);
        }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();Response::error('No se pudieron guardar los costos: '.$e->getMessage(),500);}
    }
}
