<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

class SeasonalPizzaController
{
    public static function ensureTables(?\PDO $pdo = null): void
    {
        $pdo ??= Database::pdo();
        RecipeCostingController::ensureTables($pdo);
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS seasonal_pizza_variant_periods (
              id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
              business_id BIGINT UNSIGNED NOT NULL,
              variant_id BIGINT UNSIGNED NOT NULL,
              start_date DATE NOT NULL,
              end_date DATE DEFAULT NULL,
              source ENUM('manual','inferred') NOT NULL DEFAULT 'manual',
              verified TINYINT(1) NOT NULL DEFAULT 0,
              notes VARCHAR(500) DEFAULT NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              KEY idx_seasonal_period_variant (business_id,variant_id,start_date,end_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS seasonal_pizza_variant_recipes (
              business_id BIGINT UNSIGNED NOT NULL,
              variant_id BIGINT UNSIGNED NOT NULL,
              recipe_id BIGINT UNSIGNED NOT NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (business_id,variant_id),
              UNIQUE KEY uq_seasonal_variant_recipe (business_id,recipe_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
    }

    public function index(Request $req): void
    {
        $bid=(int)$req->auth['business_id'];
        $from=trim((string)($req->query['from']??'2022-09-01'));
        $to=trim((string)($req->query['to']??date('Y-m-d')));
        if(!preg_match('/^\d{4}-\d{2}-\d{2}$/',$from)||!preg_match('/^\d{4}-\d{2}-\d{2}$/',$to)||$from>$to){
            Response::error('Rango de fechas inválido.',422); return;
        }
        $pdo=Database::pdo();
        self::ensureTables($pdo);
        $p=$pdo->prepare("SELECT id FROM products WHERE business_id=? AND name='Pizza de la semana' LIMIT 1");
        $p->execute([$bid]); $parentId=(int)($p->fetchColumn()?:0);
        if(!$parentId){Response::ok(['parent_product_id'=>null,'from'=>$from,'to'=>$to,'variants'=>[],'recipes'=>[]]);return;}

        $sql="SELECT pv.id AS variant_id,pv.label,pv.price,pv.is_active,
                     COALESCE(sa.units,0) AS units,COALESCE(sa.revenue,0) AS revenue,
                     COALESCE(sa.tickets,0) AS tickets,COALESCE(sa.sale_days,0) AS sale_days,
                     sa.first_sale,sa.last_sale,
                     CASE WHEN sa.first_sale IS NOT NULL AND sa.last_sale IS NOT NULL
                          THEN DATEDIFF(sa.last_sale,sa.first_sale)+1 ELSE 0 END AS span_days,
                     CASE WHEN COALESCE(sa.sale_days,0)>0 THEN sa.units/sa.sale_days ELSE NULL END AS units_per_sale_day,
                     COALESCE(sa.midday_units,0) AS midday_units,
                     COALESCE(sa.night_units,0) AS night_units,
                     COALESCE(sa.local_units,0) AS local_units,
                     COALESCE(sa.delivery_units,0) AS delivery_units,
                     COALESCE(pd.verified_days,0) AS verified_days,
                     CASE WHEN pd.verified_days>0 THEN sa.units/pd.verified_days ELSE NULL END AS units_per_available_day,
                     svr.recipe_id,rs.name AS recipe_name
                FROM product_variants pv
           LEFT JOIN (
                 SELECT si.variant_id,SUM(si.quantity) AS units,SUM(si.line_total) AS revenue,
                        COUNT(DISTINCT si.sale_id) AS tickets,
                        COUNT(DISTINCT DATE(s.created_at)) AS sale_days,
                        MIN(DATE(s.created_at)) AS first_sale,
                        MAX(DATE(s.created_at)) AS last_sale,
                        SUM(CASE WHEN HOUR(s.created_at)>=11 AND HOUR(s.created_at)<16 THEN si.quantity ELSE 0 END) AS midday_units,
                        SUM(CASE WHEN HOUR(s.created_at)>=19 OR HOUR(s.created_at)<3 THEN si.quantity ELSE 0 END) AS night_units,
                        SUM(CASE WHEN s.channel IN ('counter','takeaway','dine_in') THEN si.quantity ELSE 0 END) AS local_units,
                        SUM(CASE WHEN s.channel NOT IN ('counter','takeaway','dine_in') THEN si.quantity ELSE 0 END) AS delivery_units
                   FROM sale_items si JOIN sales s ON s.id=si.sale_id
                  WHERE s.business_id=? AND s.status='completed' AND s.created_at>=?
                    AND s.created_at<DATE_ADD(?,INTERVAL 1 DAY)
                    AND si.parent_sale_item_id IS NULL AND si.variant_id IS NOT NULL
                  GROUP BY si.variant_id
             ) sa ON sa.variant_id=pv.id
           LEFT JOIN (
                 SELECT business_id,variant_id,
                        SUM(DATEDIFF(LEAST(COALESCE(end_date,CURRENT_DATE()),?),GREATEST(start_date,?))+1) AS verified_days
                   FROM seasonal_pizza_variant_periods
                  WHERE business_id=? AND verified=1 AND start_date<=?
                    AND (end_date IS NULL OR end_date>=?)
                  GROUP BY business_id,variant_id
             ) pd ON pd.business_id=pv.business_id AND pd.variant_id=pv.id
           LEFT JOIN seasonal_pizza_variant_recipes svr
                  ON svr.business_id=pv.business_id AND svr.variant_id=pv.id
           LEFT JOIN recipe_studio_recipes rs
                  ON rs.id=svr.recipe_id AND rs.business_id=svr.business_id AND rs.is_active=1
               WHERE pv.business_id=? AND pv.product_id=?
               ORDER BY units DESC,revenue DESC,pv.label";
        $q=$pdo->prepare($sql);$q->execute([$bid,$from,$to,$to,$from,$bid,$to,$from,$bid,$parentId]);
        $variants=array_map(static fn(array $r):array=>[
            'variant_id'=>(int)$r['variant_id'],'label'=>(string)$r['label'],
            'price'=>(float)$r['price'],'is_active'=>(int)$r['is_active'],
            'units'=>(float)$r['units'],'revenue'=>(float)$r['revenue'],'tickets'=>(int)$r['tickets'],
            'sale_days'=>(int)$r['sale_days'],'span_days'=>(int)$r['span_days'],
            'units_per_sale_day'=>$r['units_per_sale_day']!==null?(float)$r['units_per_sale_day']:null,
            'midday_units'=>(float)$r['midday_units'],'night_units'=>(float)$r['night_units'],
            'local_units'=>(float)$r['local_units'],'delivery_units'=>(float)$r['delivery_units'],
            'first_sale'=>$r['first_sale'],'last_sale'=>$r['last_sale'],
            'verified_days'=>(int)$r['verified_days'],
            'units_per_available_day'=>$r['units_per_available_day']!==null?(float)$r['units_per_available_day']:null,
            'recipe_id'=>$r['recipe_id']!==null?(int)$r['recipe_id']:null,'recipe_name'=>$r['recipe_name'],
        ],$q->fetchAll(\PDO::FETCH_ASSOC));

        $rq=$pdo->prepare("SELECT id,name,recipe_type,linked_product_id,yield_quantity,yield_unit,price
            FROM recipe_studio_recipes WHERE business_id=? AND is_active=1 AND recipe_type='product' AND linked_product_id IS NULL ORDER BY name");
        $rq->execute([$bid]);
        $recipes=array_map(static fn(array $r):array=>[
            'id'=>(int)$r['id'],'name'=>(string)$r['name'],
            'linked_product_id'=>$r['linked_product_id']!==null?(int)$r['linked_product_id']:null,
            'yield_quantity'=>(float)$r['yield_quantity'],'yield_unit'=>(string)$r['yield_unit'],
            'price'=>(float)$r['price'],
        ],$rq->fetchAll(\PDO::FETCH_ASSOC));
        Response::ok(['parent_product_id'=>$parentId,'from'=>$from,'to'=>$to,'variants'=>$variants,'recipes'=>$recipes]);
    }

    public function linkRecipe(Request $req): void
    {
        $bid=(int)$req->auth['business_id'];$variantId=(int)$req->param('variant_id');
        $recipeId=(int)$req->input('recipe_id',0);
        $components=$req->input('components');
        $pdo=Database::pdo();
        self::ensureTables($pdo);

        if($variantId>0){
            $v=$pdo->prepare("SELECT pv.id,pv.label,pv.price FROM product_variants pv JOIN products p
                ON p.id=pv.product_id AND p.business_id=pv.business_id
                WHERE pv.id=? AND pv.business_id=? AND p.name='Pizza de la semana' LIMIT 1");
            $v->execute([$variantId,$bid]);
            $variantRow=$v->fetch(\PDO::FETCH_ASSOC);
            if(!$variantRow){Response::error('La variante no pertenece a Pizza de la semana.',404);return;}
        } else {
            $variantRow=null;
        }

        // Modo creación/edición directa de receta desde el Laboratorio de Pizzas
        if(is_array($components)&&count($components)>0){
            $name=trim((string)$req->input('name',$variantRow['label']??'Pizza de la semana'));
            if($name===''){$name=$variantRow['label']??'Pizza de temporada';}
            $yield=max(0.0001,(float)$req->input('yield_quantity',1));
            $yieldUnit=trim((string)$req->input('yield_unit','u'))?:'u';
            $price=max(0,(float)$req->input('price',$variantRow['price']??0));
            $target=max(1,min(100,(float)$req->input('target_food_cost_pct',30)));

            $pdo->beginTransaction();
            try {
                if($recipeId<=0&&$variantId>0){
                    $existingLink=$pdo->prepare("SELECT recipe_id FROM seasonal_pizza_variant_recipes WHERE business_id=? AND variant_id=? LIMIT 1");
                    $existingLink->execute([$bid,$variantId]);
                    $recipeId=(int)($existingLink->fetchColumn()?:0);
                }
                if($recipeId>0){
                    $chk=$pdo->prepare("SELECT id FROM recipe_studio_recipes WHERE id=? AND business_id=? AND is_active=1 AND linked_product_id IS NULL LIMIT 1");
                    $chk->execute([$recipeId,$bid]);
                    if($chk->fetchColumn()){
                        $upd=$pdo->prepare("UPDATE recipe_studio_recipes SET name=?,yield_quantity=?,yield_unit=?,price=?,target_food_cost_pct=? WHERE id=? AND business_id=?");
                        $upd->execute([$name,$yield,$yieldUnit,$price,$target,$recipeId,$bid]);
                    } else {
                        $recipeId=0;
                    }
                }
                if($recipeId<=0){
                    $insR=$pdo->prepare("INSERT INTO recipe_studio_recipes (business_id,linked_product_id,name,recipe_type,yield_quantity,yield_unit,price,target_food_cost_pct,is_active) VALUES (?,NULL,?,'product',?,?,?,?,1)");
                    $insR->execute([$bid,$name,$yield,$yieldUnit,$price,$target]);
                    $recipeId=(int)$pdo->lastInsertId();
                }
                $pdo->prepare("DELETE FROM recipe_studio_components WHERE business_id=? AND recipe_id=?")->execute([$bid,$recipeId]);
                $insC=$pdo->prepare("INSERT INTO recipe_studio_components (business_id,recipe_id,component_type,supply_id,component_recipe_id,quantity,unit,sort_order) VALUES (?,?,?,?,?,?,?,?)");
                $order=0;
                foreach($components as $c){
                    if(!is_array($c)) continue;
                    $qty=max(0,(float)($c['quantity']??0));
                    $cid=(int)($c['component_id']??0);
                    if($qty<=0||$cid<=0) continue;
                    $ct=($c['component_type']??'supply')==='recipe'?'recipe':'supply';
                    $unit=trim((string)($c['unit']??'kg'))?:'kg';
                    $insC->execute([$bid,$recipeId,$ct,$ct==='supply'?$cid:null,$ct==='recipe'?$cid:null,$qty,$unit,$order++]);
                }
                if($order===0){
                    throw new \RuntimeException('Agregá al menos un ingrediente con cantidad mayor a cero.');
                }
                if($variantId>0){
                    $save=$pdo->prepare("INSERT INTO seasonal_pizza_variant_recipes (business_id,variant_id,recipe_id)
                        VALUES (?,?,?) ON DUPLICATE KEY UPDATE recipe_id=VALUES(recipe_id)");
                    $save->execute([$bid,$variantId,$recipeId]);
                }
                $pdo->commit();
                Response::ok(['success'=>true,'variant_id'=>$variantId,'recipe_id'=>$recipeId]);
                return;
            } catch(\Throwable $e){
                if($pdo->inTransaction()) $pdo->rollBack();
                Response::error('No se pudo guardar la receta: '.$e->getMessage(),422);
                return;
            }
        }

        if($variantId<=0||$recipeId<=0){Response::error('Variante y receta son obligatorias.',422);return;}
        $r=$pdo->prepare("SELECT id,name,yield_quantity,yield_unit,price,target_food_cost_pct FROM recipe_studio_recipes
            WHERE id=? AND business_id=? AND is_active=1 AND recipe_type='product' LIMIT 1");
        $r->execute([$recipeId,$bid]);
        $recipeRow=$r->fetch(\PDO::FETCH_ASSOC);
        if(!$recipeRow){Response::error('La receta no existe o no está activa.',404);return;}

        // Si la receta ya está vinculada a otra variante, clonarla para evitar colisión en uq_seasonal_variant_recipe
        $usedByOther=$pdo->prepare("SELECT variant_id FROM seasonal_pizza_variant_recipes WHERE business_id=? AND recipe_id=? AND variant_id<>? LIMIT 1");
        $usedByOther->execute([$bid,$recipeId,$variantId]);
        if($usedByOther->fetchColumn()){
            $pdo->beginTransaction();
            try {
                $cloneName=($variantRow['label']??$recipeRow['name']).' ('.($recipeRow['name']).')';
                $insClone=$pdo->prepare("INSERT INTO recipe_studio_recipes (business_id,linked_product_id,name,recipe_type,yield_quantity,yield_unit,price,target_food_cost_pct,is_active) VALUES (?,NULL,?,'product',?,?,?,?,1)");
                $insClone->execute([$bid,mb_substr($cloneName,0,160),(float)$recipeRow['yield_quantity'],(string)$recipeRow['yield_unit'],(float)$recipeRow['price'],(float)$recipeRow['target_food_cost_pct']]);
                $newRecipeId=(int)$pdo->lastInsertId();
                $copyComp=$pdo->prepare("INSERT INTO recipe_studio_components (business_id,recipe_id,component_type,supply_id,component_recipe_id,quantity,unit,sort_order)
                    SELECT business_id,?,component_type,supply_id,component_recipe_id,quantity,unit,sort_order FROM recipe_studio_components WHERE business_id=? AND recipe_id=?");
                $copyComp->execute([$newRecipeId,$bid,$recipeId]);
                $recipeId=$newRecipeId;
                $pdo->commit();
            } catch(\Throwable $e){
                if($pdo->inTransaction()) $pdo->rollBack();
                Response::error('No se pudo vincular la receta: '.$e->getMessage(),422);
                return;
            }
        }

        $save=$pdo->prepare("INSERT INTO seasonal_pizza_variant_recipes (business_id,variant_id,recipe_id)
            VALUES (?,?,?) ON DUPLICATE KEY UPDATE recipe_id=VALUES(recipe_id)");
        $save->execute([$bid,$variantId,$recipeId]);
        Response::ok(['success'=>true,'variant_id'=>$variantId,'recipe_id'=>$recipeId]);
    }

    public function addAvailabilityPeriod(Request $req): void
    {
        $bid=(int)$req->auth['business_id'];
        $variantId=(int)$req->param('variant_id');
        $start=trim((string)$req->input('start_date',''));
        $end=trim((string)$req->input('end_date',''));
        $replace=(bool)$req->input('replace',true);
        if(!preg_match('/^\d{4}-\d{2}-\d{2}$/',$start)||!preg_match('/^\d{4}-\d{2}-\d{2}$/',$end)||$start>$end){
            Response::error('Indicá un período válido, con inicio y fin.',422);return;
        }
        $pdo=Database::pdo();
        self::ensureTables($pdo);
        $v=$pdo->prepare("SELECT pv.id FROM product_variants pv JOIN products p
            ON p.id=pv.product_id AND p.business_id=pv.business_id
            WHERE pv.id=? AND pv.business_id=? AND p.name='Pizza de la semana' LIMIT 1");
        $v->execute([$variantId,$bid]);
        if(!$v->fetchColumn()){Response::error('La variante no pertenece a Pizza de la semana.',404);return;}
        if($replace){
            $del=$pdo->prepare("DELETE FROM seasonal_pizza_variant_periods WHERE business_id=? AND variant_id=? AND source='manual' AND start_date<=? AND COALESCE(end_date,'9999-12-31')>=?");
            $del->execute([$bid,$variantId,$end,$start]);
        } else {
            $overlap=$pdo->prepare("SELECT COUNT(*) FROM seasonal_pizza_variant_periods
                WHERE business_id=? AND variant_id=? AND source='manual' AND start_date<=?
                  AND COALESCE(end_date,'9999-12-31')>=?");
            $overlap->execute([$bid,$variantId,$end,$start]);
            if((int)$overlap->fetchColumn()>0){Response::error('El período se superpone con otro período ya registrado.',409);return;}
        }
        $save=$pdo->prepare("INSERT INTO seasonal_pizza_variant_periods
            (business_id,variant_id,start_date,end_date,source,verified,notes)
            VALUES (?,?,?,?,'manual',1,'Período confirmado desde Laboratorio de pizzas.')");
        $save->execute([$bid,$variantId,$start,$end]);
        Response::ok(['success'=>true,'variant_id'=>$variantId,'start_date'=>$start,'end_date'=>$end]);
    }

    public function unlinkRecipe(Request $req): void
    {
        $bid=(int)$req->auth['business_id'];$variantId=(int)$req->param('variant_id');
        $pdo=Database::pdo();
        self::ensureTables($pdo);
        $pdo->prepare("DELETE FROM seasonal_pizza_variant_recipes WHERE business_id=? AND variant_id=?")
            ->execute([$bid,$variantId]);
        Response::ok(['success'=>true]);
    }
}
