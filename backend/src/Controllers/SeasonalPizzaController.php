<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

class SeasonalPizzaController
{
    public function index(Request $req): void
    {
        $bid=(int)$req->auth['business_id'];
        $from=trim((string)($req->query['from']??'2022-09-01'));
        $to=trim((string)($req->query['to']??date('Y-m-d')));
        if(!preg_match('/^\d{4}-\d{2}-\d{2}$/',$from)||!preg_match('/^\d{4}-\d{2}-\d{2}$/',$to)||$from>$to){
            Response::error('Rango de fechas inválido.',422); return;
        }
        $pdo=Database::pdo();
        $p=$pdo->prepare("SELECT id FROM products WHERE business_id=? AND name='Pizza de la semana' LIMIT 1");
        $p->execute([$bid]); $parentId=(int)($p->fetchColumn()?:0);
        if(!$parentId){Response::ok(['parent_product_id'=>null,'from'=>$from,'to'=>$to,'variants'=>[],'recipes'=>[]]);return;}

        $sql="SELECT pv.id AS variant_id,pv.label,pv.price,pv.is_active,
                     COALESCE(sa.units,0) AS units,COALESCE(sa.revenue,0) AS revenue,
                     COALESCE(sa.tickets,0) AS tickets,sa.first_sale,sa.last_sale,
                     COALESCE(pd.verified_days,0) AS verified_days,
                     CASE WHEN pd.verified_days>0 THEN sa.units/pd.verified_days ELSE NULL END AS units_per_available_day,
                     svr.recipe_id,rs.name AS recipe_name
                FROM product_variants pv
           LEFT JOIN (
                 SELECT si.variant_id,SUM(si.quantity) AS units,SUM(si.line_total) AS revenue,
                        COUNT(DISTINCT si.sale_id) AS tickets,MIN(DATE(s.created_at)) AS first_sale,
                        MAX(DATE(s.created_at)) AS last_sale
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
        if($variantId<=0||$recipeId<=0){Response::error('Variante y receta son obligatorias.',422);return;}
        $pdo=Database::pdo();
        $v=$pdo->prepare("SELECT pv.id FROM product_variants pv JOIN products p
            ON p.id=pv.product_id AND p.business_id=pv.business_id
            WHERE pv.id=? AND pv.business_id=? AND p.name='Pizza de la semana' LIMIT 1");
        $v->execute([$variantId,$bid]);
        if(!$v->fetchColumn()){Response::error('La variante no pertenece a Pizza de la semana.',404);return;}
        $r=$pdo->prepare("SELECT id FROM recipe_studio_recipes
            WHERE id=? AND business_id=? AND is_active=1 AND recipe_type='product' AND linked_product_id IS NULL LIMIT 1");
        $r->execute([$recipeId,$bid]);
        if(!$r->fetchColumn()){Response::error('La receta no existe o no está activa.',404);return;}
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
        if(!preg_match('/^\d{4}-\d{2}-\d{2}$/',$start)||!preg_match('/^\d{4}-\d{2}-\d{2}$/',$end)||$start>$end){
            Response::error('Indicá un período válido, con inicio y fin.',422);return;
        }
        $pdo=Database::pdo();
        $v=$pdo->prepare("SELECT pv.id FROM product_variants pv JOIN products p
            ON p.id=pv.product_id AND p.business_id=pv.business_id
            WHERE pv.id=? AND pv.business_id=? AND p.name='Pizza de la semana' LIMIT 1");
        $v->execute([$variantId,$bid]);
        if(!$v->fetchColumn()){Response::error('La variante no pertenece a Pizza de la semana.',404);return;}
        $overlap=$pdo->prepare("SELECT COUNT(*) FROM seasonal_pizza_variant_periods
            WHERE business_id=? AND variant_id=? AND source='manual' AND start_date<=?
              AND COALESCE(end_date,'9999-12-31')>=?");
        $overlap->execute([$bid,$variantId,$end,$start]);
        if((int)$overlap->fetchColumn()>0){Response::error('El período se superpone con otro período ya registrado.',409);return;}
        $save=$pdo->prepare("INSERT INTO seasonal_pizza_variant_periods
            (business_id,variant_id,start_date,end_date,source,verified,notes)
            VALUES (?,?,?,?,'manual',1,'Período confirmado desde Laboratorio de pizzas.')");
        $save->execute([$bid,$variantId,$start,$end]);
        Response::ok(['success'=>true,'variant_id'=>$variantId,'start_date'=>$start,'end_date'=>$end]);
    }

    public function unlinkRecipe(Request $req): void
    {
        $bid=(int)$req->auth['business_id'];$variantId=(int)$req->param('variant_id');
        Database::pdo()->prepare("DELETE FROM seasonal_pizza_variant_recipes WHERE business_id=? AND variant_id=?")
            ->execute([$bid,$variantId]);
        Response::ok(['success'=>true]);
    }
}
