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

    public function recipesIndex(Request $req): void
    {
        $bid = (int)$req->auth['business_id'];
        $pdo = Database::pdo();
        $this->ensureTables($pdo);
        $stmt = $pdo->prepare("SELECT id, name, recipe_type, linked_product_id, yield_quantity, yield_unit, price, target_food_cost_pct
          FROM recipe_studio_recipes WHERE business_id = ? AND is_active = 1 ORDER BY recipe_type, name");
        $stmt->execute([$bid]);
        $recipes = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $sup = $pdo->prepare("SELECT id, name, category, unit, COALESCE(cost,0) AS cost FROM supplies WHERE business_id = ? AND is_active = 1 ORDER BY name");
        $sup->execute([$bid]);
        $supplies = array_map(static function(array $r): array {
            $r['id']=(int)$r['id']; $r['cost']=(float)$r['cost']; return $r;
        }, $sup->fetchAll(\PDO::FETCH_ASSOC));
        $productsStmt = $pdo->prepare("SELECT id, name, price FROM products WHERE business_id = ? AND is_active = 1 ORDER BY name");
        $productsStmt->execute([$bid]);
        $products = array_map(static function(array $r): array {
            $r['id']=(int)$r['id']; $r['price']=(float)$r['price']; return $r;
        }, $productsStmt->fetchAll(\PDO::FETCH_ASSOC));
        $allComponents = $pdo->prepare("SELECT c.recipe_id, c.component_type, c.supply_id, c.component_recipe_id, c.quantity, c.unit,
          s.name AS supply_name, s.unit AS supply_unit, COALESCE(s.cost,0) AS supply_cost, r.name AS recipe_name
          FROM recipe_studio_components c
          LEFT JOIN supplies s ON s.id=c.supply_id AND s.business_id=c.business_id
          LEFT JOIN recipe_studio_recipes r ON r.id=c.component_recipe_id AND r.business_id=c.business_id
          WHERE c.business_id=? ORDER BY c.recipe_id, c.sort_order, c.id");
        $allComponents->execute([$bid]);
        $byRecipe = [];
        foreach ($allComponents->fetchAll(\PDO::FETCH_ASSOC) as $row) {
            $row['quantity']=(float)$row['quantity']; $row['supply_cost']=(float)$row['supply_cost'];
            $byRecipe[(int)$row['recipe_id']][]=$row;
        }
        $byId=[];
        foreach($recipes as $r) $byId[(int)$r['id']]=$r;
        $costCache=[];
        $calc = function(int $id, array $path=[]) use (&$calc,&$costCache,$byId,$byRecipe): float {
            if(isset($costCache[$id])) return $costCache[$id];
            if(in_array($id,$path,true)) return 0.0;
            $path[]=$id; $sum=0.0;
            foreach($byRecipe[$id] ?? [] as $c) {
                $child = $c['component_type']==='recipe' ? ($byId[(int)$c['component_recipe_id']] ?? null) : null;
                $unitCost = $c['component_type']==='supply'
                    ? (float)$c['supply_cost']
                    : ($child ? $calc((int)$c['component_recipe_id'],$path) / max(0.0001,(float)$child['yield_quantity']) : 0.0);
                $targetUnit = $c['component_type']==='supply' ? (string)($c['unit'] ?? 'kg') : (string)($c['unit'] ?? ($child['yield_unit'] ?? 'kg'));
                $costUnit = $c['component_type']==='supply' ? (string)($c['supply_unit'] ?? $targetUnit) : (string)($child['yield_unit'] ?? $targetUnit);
                $qty = $this->convertQuantity((float)$c['quantity'], $targetUnit, $costUnit);
                $sum += $qty * $unitCost;
            }
            return $costCache[$id]=round($sum,2);
        };
        $formatted=[];
        foreach($recipes as $r) {
            $id=(int)$r['id']; $cost=$calc($id); $yield=max(0.0001,(float)$r['yield_quantity']);
            $unitCost=$cost/$yield; $target=max(1,min(100,(float)$r['target_food_cost_pct']))/100;
            $price=(float)$r['price'];
            $r['id']=$id; $r['linked_product_id']=$r['linked_product_id']!==null?(int)$r['linked_product_id']:null;
            $r['yield_quantity']=$yield; $r['price']=$price; $r['target_food_cost_pct']=(float)$r['target_food_cost_pct'];
            $r['batch_cost']=$cost; $r['unit_cost']=round($unitCost,2);
            $r['suggested_price']=$r['recipe_type']==='product' ? (float)(ceil(($unitCost/$target)/100)*100) : 0.0;
            $r['food_cost_pct']=$price>0?round($unitCost/$price*100,1):0.0;
            $r['components']=array_map(function(array $c) use ($byId,$calc): array {
                $type=$c['component_type']; $child=$type==='recipe'?($byId[(int)$c['component_recipe_id']]??null):null;
                $unitCost=$type==='supply'?(float)$c['supply_cost']:($child?round($calc((int)$child['id'])/max(.0001,(float)$child['yield_quantity']),2):0.0);
                $costUnit=$type==='supply'?(string)($c['supply_unit']??$c['unit']):(string)($child['yield_unit']??$c['unit']);
                $qtyForCost=$this->convertQuantity((float)$c['quantity'],(string)$c['unit'],$costUnit);
                return ['component_type'=>$type,'component_id'=>$type==='supply'?(int)$c['supply_id']:(int)$c['component_recipe_id'],
                  'name'=>$type==='supply'?$c['supply_name']:($child['name']??$c['recipe_name']??'Subreceta'),
                  'quantity'=>(float)$c['quantity'],'unit'=>$c['unit'],'unit_cost'=>$unitCost,'total_cost'=>round($qtyForCost*$unitCost,2)];
            },$byRecipe[$id]??[]);
            $formatted[]=$r;
        }
        Response::ok(['recipes'=>$formatted,'supplies'=>$supplies,'products'=>$products]);
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
            $supplyCheck=$pdo->prepare('SELECT id FROM supplies WHERE id=? AND business_id=? AND is_active=1');
            $recipeCheck=$pdo->prepare('SELECT id FROM recipe_studio_recipes WHERE id=? AND business_id=? AND is_active=1');
            $ins=$pdo->prepare('INSERT INTO recipe_studio_components (business_id,recipe_id,component_type,supply_id,component_recipe_id,quantity,unit,sort_order) VALUES (?,?,?,?,?,?,?,?)');
            foreach($components as $i=>$c){
                $qty=max(0,(float)($c['quantity']??0)); if($qty<=0) continue;
                $ct=($c['component_type']??'supply')==='recipe'?'recipe':'supply';$cid=(int)($c['component_id']??0);
                if($ct==='supply'){$supplyCheck->execute([$cid,$bid]);if(!$supplyCheck->fetchColumn())throw new \RuntimeException('Uno de los insumos no existe o está inactivo.');$sid=$cid;$child=null;}
                else {
                    if($cid===$rid)throw new \RuntimeException('Una receta no puede incluirse a sí misma.');
                    $recipeCheck->execute([$cid,$bid]);if(!$recipeCheck->fetchColumn())throw new \RuntimeException('Una subreceta seleccionada no existe.');
                    // Impedir ciclos: ¿la receta actual está dentro de las dependencias de la subreceta?
                    if($this->dependsOn($pdo,$bid,$cid,$rid,[]))throw new \RuntimeException('Esta combinación generaría un ciclo de subrecetas.');
                    $sid=null;$child=$cid;
                }
                $unit=trim((string)($c['unit']??'kg'))?:'kg';
                $ins->execute([$bid,$rid,$ct,$sid,$child,$qty,$unit,(int)$i]);
            }
            // Recalcular todos los productos vinculados; así un cambio en una subreceta
            // también actualiza los productos finales que dependen de ella.
            $linkedRecipes = $pdo->prepare('SELECT id, linked_product_id, name, price, yield_quantity
                FROM recipe_studio_recipes WHERE business_id=? AND is_active=1 AND recipe_type=\'product\' AND linked_product_id IS NOT NULL');
            $linkedRecipes->execute([$bid]);
            $updateProduct = $pdo->prepare('UPDATE products SET name=?, price=?, cost=? WHERE id=? AND business_id=?');
            foreach ($linkedRecipes->fetchAll(\PDO::FETCH_ASSOC) as $linkedRow) {
                $linkedRecipeId = (int)$linkedRow['id'];
                $linkedProduct = (int)$linkedRow['linked_product_id'];
                $linkedYield = max(0.0001, (float)$linkedRow['yield_quantity']);
                $linkedUnitCost = round($this->calculateBatchCost($pdo, $bid, $linkedRecipeId, []) / $linkedYield, 2);
                $updateProduct->execute([$linkedRow['name'], (float)$linkedRow['price'], $linkedUnitCost, $linkedProduct, $bid]);
                $this->syncLinkedProductIngredients($pdo, $bid, $linkedProduct, $linkedRecipeId, $linkedYield);
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
        $c = mb_strtolower($supplyCategory);
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
            ['kg'=>1.0,'g'=>0.001],
            ['l'=>1.0,'lt'=>1.0,'litro'=>1.0,'litros'=>1.0,'cc'=>0.001,'ml'=>0.001],
        ];
        foreach ($groups as $group) {
            if (isset($group[$from]) && isset($group[$to])) return $quantity * $group[$from] / $group[$to];
        }
        // For units without a valid conversion, avoid silently inventing a ratio.
        return $quantity;
    }

    private function calculateBatchCost(\PDO $pdo, int $bid, int $recipeId, array $path): float
    {
        if (in_array($recipeId, $path, true)) throw new \RuntimeException('Se detectó un ciclo en las subrecetas.');
        $path[] = $recipeId;
        $stmt = $pdo->prepare('SELECT id, yield_quantity, yield_unit FROM recipe_studio_recipes WHERE id=? AND business_id=? AND is_active=1');
        $stmt->execute([$recipeId, $bid]); $recipe = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$recipe) throw new \RuntimeException('No se encontró una subreceta activa.');
        $stmt = $pdo->prepare("SELECT c.component_type,c.quantity,c.unit,c.supply_id,c.component_recipe_id,
          s.unit AS supply_unit,COALESCE(s.cost,0) AS supply_cost,r.yield_quantity AS child_yield,r.yield_unit AS child_unit
          FROM recipe_studio_components c
          LEFT JOIN supplies s ON s.id=c.supply_id AND s.business_id=c.business_id
          LEFT JOIN recipe_studio_recipes r ON r.id=c.component_recipe_id AND r.business_id=c.business_id
          WHERE c.business_id=? AND c.recipe_id=? ORDER BY c.sort_order,c.id");
        $stmt->execute([$bid,$recipeId]); $sum=0.0;
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $item) {
            if ($item['component_type']==='supply') {
                $costUnit=(string)($item['supply_unit']??$item['unit']); $unitCost=(float)$item['supply_cost'];
            } else {
                $childId=(int)$item['component_recipe_id'];
                $childBatch=$this->calculateBatchCost($pdo,$bid,$childId,$path);
                $costUnit=(string)($item['child_unit']??$item['unit']);
                $unitCost=$childBatch/max(.0001,(float)$item['child_yield']);
            }
            $sum += $this->convertQuantity((float)$item['quantity'],(string)$item['unit'],$costUnit)*$unitCost;
        }
        return round($sum,2);
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
