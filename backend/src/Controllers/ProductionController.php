<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

/**
 * Módulo de Producción:
 *  - Calculadora de Masas y Amasado (Biga, Poolish, Masa Directa, Fainá).
 *  - Escandallos de Recetas, Márgenes y Food Cost (máx 30%).
 *  - Simulador de Costos e Inflación.
 */
class ProductionController
{
    /**
     * GET /production/dough-profiles
     * Devuelve los perfiles de masas configurados para el negocio.
     */
    public function doughProfiles(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $pdo = Database::pdo();

        // Verificar si la tabla dough_profiles existe
        $tableExists = false;
        try {
            $stmt = $pdo->query('SHOW TABLES LIKE "dough_profiles"');
            $tableExists = (bool) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            $tableExists = false;
        }

        if ($tableExists) {
            $stmt = $pdo->prepare(
                'SELECT * FROM dough_profiles WHERE business_id = ? AND is_active = 1 ORDER BY id ASC'
            );
            $stmt->execute([$bid]);
            $rows = $stmt->fetchAll();
            if (!empty($rows)) {
                Response::ok(['profiles' => array_map([$this, 'formatProfile'], $rows)]);
                return;
            }
        }

        // Fallback predeterminado con fórmulas de Arrabbiata
        Response::ok(['profiles' => $this->defaultProfiles($bid)]);
    }

    /**
     * POST /production/dough-calculate
     * Calcula la receta exacta de amasado según unidades y perfil de masa.
     */
    public function doughCalculate(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $b = $req->body;

        $profileId = !empty($b['profile_id']) ? (int) $b['profile_id'] : null;
        $units     = max(1, (int) ($b['units'] ?? 100));
        $batches   = max(1, (int) ($b['batches'] ?? 2));

        // Obtener perfil
        $profile = null;
        if ($profileId) {
            $pdo = Database::pdo();
            try {
                $stmt = $pdo->prepare('SELECT * FROM dough_profiles WHERE id = ? AND business_id = ?');
                $stmt->execute([$profileId, $bid]);
                $r = $stmt->fetch();
                if ($r) $profile = $this->formatProfile($r);
            } catch (\Throwable $e) {}
        }

        if (!$profile) {
            $defaults = $this->defaultProfiles($bid);
            $profile = $defaults[0];
        }

        // Obtener costos actuales de insumos de masa
        $costs = $this->getSupplyCosts($bid);

        $calculation = $this->computeDough($profile, $units, $batches, $costs);

        Response::ok([
            'profile'     => $profile,
            'units'       => $units,
            'batches'     => $batches,
            'calculation' => $calculation,
        ]);
    }

    /**
     * GET /production/cost-margins
     * Escandallo completo de productos: costo, precio, margen $ y %, food cost y precio sugerido.
     */
    public function costMargins(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $pdo = Database::pdo();

        // 1) Listar productos con precio y costo
        $stmt = $pdo->prepare(
            'SELECT p.id, p.name, c.name AS category, p.price, p.cost, p.is_active
             FROM products p
             LEFT JOIN categories c ON c.id = p.category_id
             WHERE p.business_id = ? AND p.is_active = 1
             ORDER BY c.name ASC, p.name ASC'
        );
        $stmt->execute([$bid]);
        $products = $stmt->fetchAll();

        // 2) Obtener recetas detalladas desde product_ingredients + supplies
        $recStmt = $pdo->prepare(
            'SELECT pi.product_id, i.name AS ingredient_name, i.category AS ingredient_category,
                    pi.quantity, pi.unit, COALESCE(s.cost, 0) AS unit_cost
             FROM product_ingredients pi
             JOIN ingredients i ON i.id = pi.ingredient_id
             LEFT JOIN supplies s ON s.business_id = ? AND s.name = i.name
             WHERE i.business_id = ?
             ORDER BY pi.product_id, i.name'
        );
        $recStmt->execute([$bid, $bid]);
        $recRows = $recStmt->fetchAll();

        $recipesByProduct = [];
        foreach ($recRows as $rr) {
            $pid = (int) $rr['product_id'];
            $qty = (float) ($rr['quantity'] ?? 0);
            $uCost = (float) ($rr['unit_cost'] ?? 0);
            $recipesByProduct[$pid][] = [
                'name'            => $rr['ingredient_name'],
                'category'        => $rr['ingredient_category'],
                'quantity'        => $qty,
                'unit'            => $rr['unit'] ?? 'kg',
                'unit_cost'       => $uCost,
                'total_cost'      => round($qty * $uCost, 2),
            ];
        }

        $items = [];
        $totalRevPotential = 0.0;
        $totalCostPotential = 0.0;
        $reviewCount = 0;
        $noPriceCount = 0;

        foreach ($products as $p) {
            $pid   = (int) $p['id'];
            $price = (float) $p['price'];
            $cost  = (float) $p['cost'];

            $recipe = $recipesByProduct[$pid] ?? [];
            if ($cost <= 0 && !empty($recipe)) {
                $calcCost = array_sum(array_column($recipe, 'total_cost'));
                if ($calcCost > 0) $cost = round($calcCost, 2);
            }

            $margin = $price - $cost;
            $marginPct = $price > 0 ? round(($margin / $price) * 100, 1) : 0.0;
            $foodCostPct = $price > 0 ? round(($cost / $price) * 100, 1) : 0.0;
            $markupPct = $cost > 0 ? round(($margin / $cost) * 100, 1) : 0.0;

            // Precio mínimo para food cost <= 30% redondeado a $100
            $minPrice = $cost > 0 ? ceil(($cost / 0.30) / 100) * 100 : 0.0;

            $status = 'ok';
            if ($price <= 0) {
                $status = 'no_price';
                $noPriceCount++;
            } elseif ($foodCostPct > 30.0) {
                $status = 'review';
                $reviewCount++;
            }

            if ($price > 0) {
                $totalRevPotential += $price;
                $totalCostPotential += $cost;
            }

            $items[] = [
                'id'              => $pid,
                'name'            => $p['name'],
                'category'        => $p['category'] ?? 'General',
                'price'           => $price,
                'cost'            => $cost,
                'margin'          => round($margin, 2),
                'margin_pct'      => $marginPct,
                'food_cost_pct'   => $foodCostPct,
                'markup_pct'      => $markupPct,
                'suggested_price' => $minPrice,
                'status'          => $status,
                'ingredients'     => $recipe,
            ];
        }

        $avgFoodCost = $totalRevPotential > 0 ? round(($totalCostPotential / $totalRevPotential) * 100, 1) : 0.0;
        $avgMarginPct = $totalRevPotential > 0 ? round((($totalRevPotential - $totalCostPotential) / $totalRevPotential) * 100, 1) : 0.0;

        Response::ok([
            'summary' => [
                'total_products'     => count($items),
                'avg_food_cost_pct'  => $avgFoodCost,
                'avg_margin_pct'     => $avgMarginPct,
                'review_count'       => $reviewCount,
                'no_price_count'     => $noPriceCount,
            ],
            'products' => $items,
        ]);
    }

    /**
     * POST /production/simulate
     * Simula variaciones de precios o costos sobre el catálogo.
     */
    public function simulate(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $b   = $req->body;

        $costDeltaPct  = (float) ($b['cost_delta_pct'] ?? 0.0);
        $priceDeltaPct = (float) ($b['price_delta_pct'] ?? 0.0);

        $pdo = Database::pdo();
        $stmt = $pdo->prepare(
            'SELECT p.id, p.name, c.name AS category, p.price, p.cost
             FROM products p
             LEFT JOIN categories c ON c.id = p.category_id
             WHERE p.business_id = ? AND p.is_active = 1
             ORDER BY c.name ASC, p.name ASC'
        );
        $stmt->execute([$bid]);
        $rows = $stmt->fetchAll();

        $results = [];
        $origRev = 0.0;
        $origCost = 0.0;
        $simRev = 0.0;
        $simCost = 0.0;

        foreach ($rows as $r) {
            $p = (float) $r['price'];
            $c = (float) $r['cost'];

            $newPrice = $p > 0 ? round($p * (1 + $priceDeltaPct / 100) / 100) * 100 : 0.0;
            $newCost  = $c > 0 ? round($c * (1 + $costDeltaPct / 100), 2) : 0.0;

            $newMargin = $newPrice - $newCost;
            $newFoodCostPct = $newPrice > 0 ? round(($newCost / $newPrice) * 100, 1) : 0.0;

            if ($p > 0) {
                $origRev += $p;
                $origCost += $c;
                $simRev += $newPrice;
                $simCost += $newCost;
            }

            $results[] = [
                'id'                 => (int) $r['id'],
                'name'               => $r['name'],
                'category'           => $r['category'] ?? 'General',
                'current_price'      => $p,
                'current_cost'       => $c,
                'simulated_price'    => $newPrice,
                'simulated_cost'     => $newCost,
                'simulated_margin'   => round($newMargin, 2),
                'simulated_food_cost'=> $newFoodCostPct,
            ];
        }

        $origFoodCostAvg = $origRev > 0 ? round(($origCost / $origRev) * 100, 1) : 0.0;
        $simFoodCostAvg  = $simRev > 0 ? round(($simCost / $simRev) * 100, 1) : 0.0;

        Response::ok([
            'simulation' => [
                'cost_delta_pct'     => $costDeltaPct,
                'price_delta_pct'    => $priceDeltaPct,
                'orig_avg_food_cost' => $origFoodCostAvg,
                'sim_avg_food_cost'  => $simFoodCostAvg,
                'delta_food_cost'    => round($simFoodCostAvg - $origFoodCostAvg, 1),
            ],
            'products' => $results,
        ]);
    }

    // -----------------------------------------------------------------
    // Auxiliares de Cálculo de Amasado
    // -----------------------------------------------------------------

    private function computeDough(array $p, int $units, int $batches, array $costs): array
    {
        $isFaina = stripos($p['name'], 'fainá') !== false || stripos($p['name'], 'faina') !== false;

        if ($isFaina) {
            $chickpeaFlour = round($units * 0.185, 3);
            $water         = round($chickpeaFlour * 2.25, 3);
            $saltGrams     = round($chickpeaFlour * 50, 2);
            $oilLiters     = round($units * 0.012, 3);
            $totalWeightKg = round($chickpeaFlour + $water, 3);

            $costFlour = $chickpeaFlour * ($costs['Harina de garbanzos'] ?? 3500.0);
            $costSalt  = ($saltGrams / 1000) * ($costs['Sal'] ?? 650.0);
            $costOil   = $oilLiters * ($costs['Aceite de oliva'] ?? 22500.0);
            $totalCost = round($costFlour + $costSalt + $costOil, 2);

            $whatsapp = "🥣 *RECETA FAINÁ - {$units} MOLDES*\n"
                      . "──────────────────\n"
                      . "• Harina de Garbanzo: {$chickpeaFlour} kg\n"
                      . "• Agua: {$water} L\n"
                      . "• Sal fina: {$saltGrams} g\n"
                      . "• Aceite de oliva: " . ($oilLiters * 1000) . " cc\n"
                      . "──────────────────\n"
                      . "Batir enérgicamente sin grumos y reposar mínimo 4 horas.";

            return [
                'type'             => 'faina',
                'total_weight_kg'  => $totalWeightKg,
                'weight_per_unit_g'=> 185.0,
                'units'            => $units,
                'batches'          => $batches,
                'total' => [
                    'chickpea_flour_kg' => $chickpeaFlour,
                    'water_liters'      => $water,
                    'salt_grams'        => $saltGrams,
                    'oil_liters'        => $oilLiters,
                ],
                'per_batch' => [
                    'chickpea_flour_kg' => round($chickpeaFlour / $batches, 3),
                    'water_liters'      => round($water / $batches, 3),
                    'salt_grams'        => round($saltGrams / $batches, 2),
                    'oil_liters'        => round($oilLiters / $batches, 3),
                ],
                'cost' => [
                    'total'     => $totalCost,
                    'per_unit'  => round($totalCost / $units, 2),
                    'per_kg'    => $totalWeightKg > 0 ? round($totalCost / $totalWeightKg, 2) : 0,
                ],
                'whatsapp_text' => $whatsapp,
            ];
        }

        // Fórmulas para masas con harina (Pizza, Molde, Focaccia)
        $unitGrams = (float) $p['unit_weight_grams'];
        $hydrPct   = (float) $p['hydration_pct'];
        $bigaPct   = (float) $p['biga_pct'];
        $bigaWaterPct = (float) $p['biga_water_pct'];
        $bigaYeastPct = (float) $p['biga_yeast_pct'];
        $poolishPct   = (float) $p['poolish_pct'];
        $poolishWaterPct = (float) $p['poolish_water_pct'];
        $poolishYeastPct = (float) $p['poolish_yeast_pct'];
        $directYeastPct  = (float) $p['direct_yeast_pct'];
        $saltPct   = (float) $p['salt_pct'];
        $sugarPct  = (float) $p['sugar_pct'];
        $oilPct    = (float) $p['oil_pct'];

        $flourWhitePct = (float) $p['flour_white_pct'];
        $flourSemolaPct = (float) $p['flour_semola_pct'];
        $flourIntegPct = (float) $p['flour_integral_pct'];

        // Peso total de masa = unidades × peso unitario
        $totalWeightKg = round(($units * $unitGrams) / 1000.0, 3);
        $totalFlourKg  = round($totalWeightKg / (1.0 + ($hydrPct / 100.0)), 3);
        $totalWaterKg  = round($totalFlourKg * ($hydrPct / 100.0), 3);

        // Harinas segregadas
        $flourWhiteKg  = round($totalFlourKg * ($flourWhitePct / 100.0), 3);
        $flourSemolaKg = round($totalFlourKg * ($flourSemolaPct / 100.0), 3);
        $flourIntegKg  = round($totalFlourKg * ($flourIntegPct / 100.0), 3);

        // Biga
        $bigaFlourKg = $bigaPct > 0 ? round($totalFlourKg * ($bigaPct / 100.0), 3) : 0.0;
        $bigaWaterKg = $bigaFlourKg > 0 ? round($bigaFlourKg * ($bigaWaterPct / 100.0), 3) : 0.0;
        $bigaYeastKg = $bigaFlourKg > 0 ? round($bigaFlourKg * ($bigaYeastPct / 100.0), 4) : 0.0;
        $bigaTotalKg = round($bigaFlourKg + $bigaWaterKg + $bigaYeastKg, 3);

        // Poolish
        $poolishFlourKg = $poolishPct > 0 ? round($totalFlourKg * ($poolishPct / 100.0), 3) : 0.0;
        $poolishWaterKg = $poolishFlourKg > 0 ? round($poolishFlourKg * ($poolishWaterPct / 100.0), 3) : 0.0;
        $poolishYeastKg = $poolishFlourKg > 0 ? round($poolishFlourKg * ($poolishYeastPct / 100.0), 4) : 0.0;
        $poolishTotalKg = round($poolishFlourKg + $poolishWaterKg + $poolishYeastKg, 3);

        // Empaste / Masa Final
        $finalFlourKg = round($totalFlourKg - $bigaFlourKg - $poolishFlourKg, 3);
        $finalWaterKg = round($totalWaterKg - $bigaWaterKg - $poolishWaterKg, 3);
        $directYeastKg= $directYeastPct > 0 ? round($totalFlourKg * ($directYeastPct / 100.0), 4) : 0.0;
        $saltKg       = round($totalFlourKg * ($saltPct / 100.0), 3);
        $sugarKg      = $sugarPct > 0 ? round($totalFlourKg * ($sugarPct / 100.0), 3) : 0.0;
        $oilKg        = $oilPct > 0 ? round($totalFlourKg * ($oilPct / 100.0), 3) : 0.0;

        // Costeo
        $costFlourW = $flourWhiteKg * ($costs['Harina'] ?? 1500.0);
        $costFlourS = $flourSemolaKg * ($costs['Sémola rimacinata'] ?? 1800.0);
        $costFlourI = $flourIntegKg * ($costs['Harina integral'] ?? 1640.0);
        $costYeast  = ($bigaYeastKg + $poolishYeastKg + $directYeastKg) * ($costs['Levadura'] ?? 10000.0);
        $costSalt   = $saltKg * ($costs['Sal'] ?? 650.0);
        $costSugar  = $sugarKg * ($costs['Azúcar'] ?? 1000.0);
        $costOil    = $oilKg * ($costs['Aceite de oliva'] ?? 22500.0);

        $totalCost = round($costFlourW + $costFlourS + $costFlourI + $costYeast + $costSalt + $costSugar + $costOil, 2);
        $costPerKg = $totalWeightKg > 0 ? round($totalCost / $totalWeightKg, 2) : 0.0;
        $costPerUnit = $units > 0 ? round($totalCost / $units, 2) : 0.0;

        // Formato para WhatsApp
        $waLines = [];
        $waLines[] = "🍕 *AMASADO ARRABBIATA — {$units} BOLLOS ({$unitGrams}g)*";
        $waLines[] = "Perfil: *{$p['name']}* (Hidr: {$hydrPct}%)";
        $waLines[] = "──────────────────";

        if ($bigaFlourKg > 0) {
            $waLines[] = "🥣 *PASO 1: BIGA ({$bigaPct}%)*";
            $waLines[] = "• Harina Biga: *{$bigaFlourKg} kg*";
            $waLines[] = "• Agua Biga (50%): *{$bigaWaterKg} L*";
            $waLines[] = "• Levadura Biga: *" . ($bigaYeastKg * 1000) . " g*";
            $waLines[] = "• Peso total Biga: {$bigaTotalKg} kg";
            $waLines[] = "──────────────────";
        }

        if ($poolishFlourKg > 0) {
            $waLines[] = "🥣 *PASO 1: POOLISH ({$poolishPct}%)*";
            $waLines[] = "• Harina Poolish: *{$poolishFlourKg} kg*";
            $waLines[] = "• Agua Poolish: *{$poolishWaterKg} L*";
            $waLines[] = "• Levadura: *" . ($poolishYeastKg * 1000) . " g*";
            $waLines[] = "──────────────────";
        }

        $waLines[] = "💧 *PASO 2: EMPASTE / MASA FINAL*";
        $waLines[] = "• Harina restante: *{$finalFlourKg} kg*";
        if ($flourSemolaKg > 0) $waLines[] = "  ↳ Sémola: {$flourSemolaKg} kg";
        if ($flourIntegKg > 0)  $waLines[] = "  ↳ Integral: {$flourIntegKg} kg";
        $waLines[] = "• Agua restante: *{$finalWaterKg} L*";
        $waLines[] = "• Sal fina (2.7%): *" . ($saltKg * 1000) . " g*";
        if ($directYeastKg > 0) $waLines[] = "• Levadura directa: *" . ($directYeastKg * 1000) . " g*";
        if ($sugarKg > 0)       $waLines[] = "• Azúcar: *" . ($sugarKg * 1000) . " g*";

        if ($batches > 1) {
            $waLines[] = "──────────────────";
            $waLines[] = "⚖️ *DIVIDIDO EN {$batches} AMASADAS:*";
            $waLines[] = "• Biga p/ amasada: " . round($bigaTotalKg / $batches, 3) . " kg";
            $waLines[] = "• Harina p/ amasada: " . round($finalFlourKg / $batches, 3) . " kg";
            $waLines[] = "• Agua p/ amasada: " . round($finalWaterKg / $batches, 3) . " L";
            $waLines[] = "• Sal p/ amasada: " . round(($saltKg * 1000) / $batches, 1) . " g";
        }

        $waLines[] = "──────────────────";
        $waLines[] = "📦 Masa total: {$totalWeightKg} kg | Costo bollo: \${$costPerUnit}";

        return [
            'type'              => 'pizza',
            'total_weight_kg'   => $totalWeightKg,
            'total_flour_kg'    => $totalFlourKg,
            'total_water_kg'    => $totalWaterKg,
            'weight_per_unit_g' => $unitGrams,
            'units'             => $units,
            'batches'           => $batches,
            'flour_blend' => [
                'white_kg'    => $flourWhiteKg,
                'semola_kg'   => $flourSemolaKg,
                'integral_kg' => $flourIntegKg,
            ],
            'biga' => [
                'active'     => $bigaFlourKg > 0,
                'pct'        => $bigaPct,
                'flour_kg'   => $bigaFlourKg,
                'water_kg'   => $bigaWaterKg,
                'yeast_g'    => round($bigaYeastKg * 1000, 1),
                'total_kg'   => $bigaTotalKg,
            ],
            'poolish' => [
                'active'     => $poolishFlourKg > 0,
                'pct'        => $poolishPct,
                'flour_kg'   => $poolishFlourKg,
                'water_kg'   => $poolishWaterKg,
                'yeast_g'    => round($poolishYeastKg * 1000, 1),
                'total_kg'   => $poolishTotalKg,
            ],
            'empaste' => [
                'flour_kg'   => $finalFlourKg,
                'water_kg'   => $finalWaterKg,
                'salt_g'     => round($saltKg * 1000, 1),
                'direct_yeast_g' => round($directYeastKg * 1000, 1),
                'sugar_g'    => round($sugarKg * 1000, 1),
                'oil_cc'     => round($oilKg * 1000, 1),
            ],
            'per_batch' => [
                'batches'    => $batches,
                'flour_kg'   => round($finalFlourKg / $batches, 3),
                'water_kg'   => round($finalWaterKg / $batches, 3),
                'biga_kg'    => round($bigaTotalKg / $batches, 3),
                'salt_g'     => round(($saltKg * 1000) / $batches, 1),
            ],
            'cost' => [
                'total'     => $totalCost,
                'per_kg'    => $costPerKg,
                'per_unit'  => $costPerUnit,
            ],
            'whatsapp_text' => implode("\n", $waLines),
        ];
    }

    private function getSupplyCosts(int $bid): array
    {
        $pdo = Database::pdo();
        $costs = [];
        try {
            $stmt = $pdo->prepare('SELECT name, cost FROM supplies WHERE business_id = ?');
            $stmt->execute([$bid]);
            foreach ($stmt->fetchAll() as $r) {
                $costs[$r['name']] = (float) $r['cost'];
            }
        } catch (\Throwable $e) {}
        return $costs;
    }

    private function defaultProfiles(int $bid): array
    {
        return [
            [
                'id'                => 1,
                'business_id'       => $bid,
                'name'              => 'Pizza Napolitana / Arrabbiata (Biga 25%)',
                'unit_weight_grams' => 220.00,
                'hydration_pct'     => 67.90,
                'biga_pct'          => 25.00,
                'biga_water_pct'    => 50.00,
                'biga_yeast_pct'    => 0.500,
                'poolish_pct'       => 0.00,
                'poolish_water_pct' => 100.00,
                'poolish_yeast_pct' => 0.000,
                'direct_yeast_pct'  => 0.000,
                'salt_pct'          => 2.70,
                'sugar_pct'         => 0.00,
                'oil_pct'           => 0.00,
                'flour_white_pct'   => 81.75,
                'flour_integral_pct'=> 12.17,
                'flour_semola_pct'  => 6.08,
                'cost_per_kg'       => 932.30,
                'notes'             => 'Fórmula clásica Arrabbiata: 220g bollo, 67.9% hidr, Biga 25% con sémola e integral.',
            ],
            [
                'id'                => 2,
                'business_id'       => $bid,
                'name'              => 'Pizza Napolitana (Biga 19%)',
                'unit_weight_grams' => 220.00,
                'hydration_pct'     => 67.90,
                'biga_pct'          => 19.00,
                'biga_water_pct'    => 50.00,
                'biga_yeast_pct'    => 0.500,
                'poolish_pct'       => 0.00,
                'poolish_water_pct' => 100.00,
                'poolish_yeast_pct' => 0.000,
                'direct_yeast_pct'  => 0.000,
                'salt_pct'          => 2.70,
                'sugar_pct'         => 0.00,
                'oil_pct'           => 0.00,
                'flour_white_pct'   => 81.75,
                'flour_integral_pct'=> 12.17,
                'flour_semola_pct'  => 6.08,
                'cost_per_kg'       => 932.30,
                'notes'             => 'Variante Biga 19% para fermentaciones más lentas.',
            ],
            [
                'id'                => 3,
                'business_id'       => $bid,
                'name'              => 'Pizza Napolitana (Biga 15%)',
                'unit_weight_grams' => 220.00,
                'hydration_pct'     => 67.90,
                'biga_pct'          => 15.00,
                'biga_water_pct'    => 50.00,
                'biga_yeast_pct'    => 0.500,
                'poolish_pct'       => 0.00,
                'poolish_water_pct' => 100.00,
                'poolish_yeast_pct' => 0.000,
                'direct_yeast_pct'  => 0.000,
                'salt_pct'          => 2.70,
                'sugar_pct'         => 0.00,
                'oil_pct'           => 0.00,
                'flour_white_pct'   => 81.75,
                'flour_integral_pct'=> 12.17,
                'flour_semola_pct'  => 6.08,
                'cost_per_kg'       => 932.30,
                'notes'             => 'Variante Biga 15% para clima cálido / verano.',
            ],
            [
                'id'                => 4,
                'business_id'       => $bid,
                'name'              => 'Pizza Molde Porteña 600g',
                'unit_weight_grams' => 600.00,
                'hydration_pct'     => 75.30,
                'biga_pct'          => 0.00,
                'biga_water_pct'    => 0.00,
                'biga_yeast_pct'    => 0.000,
                'poolish_pct'       => 0.00,
                'poolish_water_pct' => 100.00,
                'poolish_yeast_pct' => 0.000,
                'direct_yeast_pct'  => 0.190,
                'salt_pct'          => 2.30,
                'sugar_pct'         => 0.00,
                'oil_pct'           => 0.00,
                'flour_white_pct'   => 85.00,
                'flour_integral_pct'=> 0.00,
                'flour_semola_pct'  => 15.00,
                'cost_per_kg'       => 900.71,
                'notes'             => 'Molde gruesa 600g: 75.3% hidratación, 15% sémola rimacinata, levadura directa 0.19%.',
            ],
            [
                'id'                => 5,
                'business_id'       => $bid,
                'name'              => 'Focaccia Alta Hidratación',
                'unit_weight_grams' => 330.00,
                'hydration_pct'     => 73.68,
                'biga_pct'          => 0.00,
                'biga_water_pct'    => 0.00,
                'biga_yeast_pct'    => 0.000,
                'poolish_pct'       => 20.00,
                'poolish_water_pct' => 100.00,
                'poolish_yeast_pct' => 10.000,
                'direct_yeast_pct'  => 0.000,
                'salt_pct'          => 3.00,
                'sugar_pct'         => 2.00,
                'oil_pct'           => 0.00,
                'flour_white_pct'   => 100.00,
                'flour_integral_pct'=> 0.00,
                'flour_semola_pct'  => 0.00,
                'cost_per_kg'       => 1001.55,
                'notes'             => 'Focaccia con Poolish 20% (100% agua, 10% levadura), 73.68% hidr, azúcar 2%, sal 3%.',
            ],
            [
                'id'                => 6,
                'business_id'       => $bid,
                'name'              => 'Fainá Tradicional de Garbanzos',
                'unit_weight_grams' => 185.00,
                'hydration_pct'     => 225.00,
                'biga_pct'          => 0.00,
                'biga_water_pct'    => 0.00,
                'biga_yeast_pct'    => 0.000,
                'poolish_pct'       => 0.00,
                'poolish_water_pct' => 0.00,
                'poolish_yeast_pct' => 0.000,
                'direct_yeast_pct'  => 0.000,
                'salt_pct'          => 5.00,
                'sugar_pct'         => 0.00,
                'oil_pct'           => 6.49,
                'flour_white_pct'   => 0.00,
                'flour_integral_pct'=> 0.00,
                'flour_semola_pct'  => 0.00,
                'cost_per_kg'       => 904.00,
                'notes'             => 'Fainá en base a 185g harina de garbanzo, 416cc agua, 9.25g sal y 12cc aceite de oliva por molde.',
            ]
        ];
    }

    private function formatProfile(array $r): array
    {
        return [
            'id'                => (int) $r['id'],
            'business_id'       => (int) $r['business_id'],
            'name'              => $r['name'],
            'unit_weight_grams' => (float) $r['unit_weight_grams'],
            'hydration_pct'     => (float) $r['hydration_pct'],
            'biga_pct'          => (float) $r['biga_pct'],
            'biga_water_pct'    => (float) $r['biga_water_pct'],
            'biga_yeast_pct'    => (float) $r['biga_yeast_pct'],
            'poolish_pct'       => (float) $r['poolish_pct'],
            'poolish_water_pct' => (float) $r['poolish_water_pct'],
            'poolish_yeast_pct' => (float) $r['poolish_yeast_pct'],
            'direct_yeast_pct'  => (float) $r['direct_yeast_pct'],
            'salt_pct'          => (float) $r['salt_pct'],
            'sugar_pct'         => (float) $r['sugar_pct'],
            'oil_pct'           => (float) $r['oil_pct'],
            'flour_white_pct'   => (float) $r['flour_white_pct'],
            'flour_integral_pct'=> (float) $r['flour_integral_pct'],
            'flour_semola_pct'  => (float) $r['flour_semola_pct'],
            'cost_per_kg'       => (float) $r['cost_per_kg'],
            'notes'             => $r['notes'],
        ];
    }
}
