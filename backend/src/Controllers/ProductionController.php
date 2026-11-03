<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

/**
 * Módulo de Producción:
 *  - Calculadora de Masas y Amasado (Biga, Poolish, Masa Directa, Fainá, Detroit Style).
 *  - CRUD de Perfiles de Masa (crear, editar, ajustar fórmulas y harinas).
 *  - Escandallos y Creación/Edición de Recetas de Productos con cálculo en tiempo real.
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

        $this->ensureProfilesTable($pdo, $bid);

        $stmt = $pdo->prepare(
            'SELECT * FROM dough_profiles WHERE business_id = ? AND is_active = 1 ORDER BY id ASC'
        );
        $stmt->execute([$bid]);
        $rows = $stmt->fetchAll();

        Response::ok(['profiles' => array_map([$this, 'formatProfile'], $rows)]);
    }

    /**
     * POST /production/dough-profiles
     * Crea un nuevo perfil de masa configurable.
     */
    public function doughProfileStore(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $b   = $req->body;
        $pdo = Database::pdo();

        $this->ensureProfilesTable($pdo, $bid);

        $name = trim((string) ($b['name'] ?? ''));
        if ($name === '') {
            Response::error('El nombre del perfil de masa es obligatorio', 422);
            return;
        }

        $unitWeightGrams = max(10, (float) ($b['unit_weight_grams'] ?? 220));
        $hydrationPct    = max(10, (float) ($b['hydration_pct'] ?? 67.9));
        $bigaPct         = max(0, (float) ($b['biga_pct'] ?? 0));
        $bigaWaterPct    = max(0, (float) ($b['biga_water_pct'] ?? 50));
        $bigaYeastPct    = max(0, (float) ($b['biga_yeast_pct'] ?? 0.5));
        $poolishPct      = max(0, (float) ($b['poolish_pct'] ?? 0));
        $poolishWaterPct = max(0, (float) ($b['poolish_water_pct'] ?? 100));
        $poolishYeastPct = max(0, (float) ($b['poolish_yeast_pct'] ?? 0));
        $directYeastPct  = max(0, (float) ($b['direct_yeast_pct'] ?? 0));
        $saltPct         = max(0, (float) ($b['salt_pct'] ?? 2.7));
        $sugarPct        = max(0, (float) ($b['sugar_pct'] ?? 0));
        $oilPct          = max(0, (float) ($b['oil_pct'] ?? 0));
        $flourWhitePct   = max(0, (float) ($b['flour_white_pct'] ?? 100));
        $flourIntegPct   = max(0, (float) ($b['flour_integral_pct'] ?? 0));
        $flourSemolaPct  = max(0, (float) ($b['flour_semola_pct'] ?? 0));
        $costPerKg       = max(0, (float) ($b['cost_per_kg'] ?? 932.30));
        try {
            $ingredientMap = $this->normalizeIngredientMap($pdo, $bid, $b['ingredient_map'] ?? null);
        } catch (\InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
            return;
        }
        $ingredientMapJson = $ingredientMap !== null ? json_encode($ingredientMap, JSON_THROW_ON_ERROR) : null;
        $notes           = !empty($b['notes']) ? trim((string) $b['notes']) : null;

        $stmt = $pdo->prepare(
            'INSERT INTO dough_profiles 
             (business_id, name, unit_weight_grams, hydration_pct, biga_pct, biga_water_pct, biga_yeast_pct,
              poolish_pct, poolish_water_pct, poolish_yeast_pct, direct_yeast_pct, salt_pct, sugar_pct, oil_pct,
              flour_white_pct, flour_integral_pct, flour_semola_pct, cost_per_kg, ingredient_map, notes, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
        );
        $stmt->execute([
            $bid, $name, $unitWeightGrams, $hydrationPct, $bigaPct, $bigaWaterPct, $bigaYeastPct,
            $poolishPct, $poolishWaterPct, $poolishYeastPct, $directYeastPct, $saltPct, $sugarPct, $oilPct,
            $flourWhitePct, $flourIntegPct, $flourSemolaPct, $costPerKg, $ingredientMapJson, $notes,
        ]);

        $newId = (int) $pdo->lastInsertId();
        $stmt = $pdo->prepare('SELECT * FROM dough_profiles WHERE id = ?');
        $stmt->execute([$newId]);
        $row = $stmt->fetch();

        Response::ok(['profile' => $this->formatProfile($row)]);
    }

    /**
     * PUT /production/dough-profiles/{id}
     * Actualiza un perfil de masa existente.
     */
    public function doughProfileUpdate(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->params['id'];
        $b   = $req->body;
        $pdo = Database::pdo();

        $this->ensureProfilesTable($pdo, $bid);

        $name = trim((string) ($b['name'] ?? ''));
        if ($name === '') {
            Response::error('El nombre del perfil de masa es obligatorio', 422);
            return;
        }

        $unitWeightGrams = max(10, (float) ($b['unit_weight_grams'] ?? 220));
        $hydrationPct    = max(10, (float) ($b['hydration_pct'] ?? 67.9));
        $bigaPct         = max(0, (float) ($b['biga_pct'] ?? 0));
        $bigaWaterPct    = max(0, (float) ($b['biga_water_pct'] ?? 50));
        $bigaYeastPct    = max(0, (float) ($b['biga_yeast_pct'] ?? 0.5));
        $poolishPct      = max(0, (float) ($b['poolish_pct'] ?? 0));
        $poolishWaterPct = max(0, (float) ($b['poolish_water_pct'] ?? 100));
        $poolishYeastPct = max(0, (float) ($b['poolish_yeast_pct'] ?? 0));
        $directYeastPct  = max(0, (float) ($b['direct_yeast_pct'] ?? 0));
        $saltPct         = max(0, (float) ($b['salt_pct'] ?? 2.7));
        $sugarPct        = max(0, (float) ($b['sugar_pct'] ?? 0));
        $oilPct          = max(0, (float) ($b['oil_pct'] ?? 0));
        $flourWhitePct   = max(0, (float) ($b['flour_white_pct'] ?? 100));
        $flourIntegPct   = max(0, (float) ($b['flour_integral_pct'] ?? 0));
        $flourSemolaPct  = max(0, (float) ($b['flour_semola_pct'] ?? 0));
        $costPerKg       = max(0, (float) ($b['cost_per_kg'] ?? 932.30));
        try {
            $ingredientMap = $this->normalizeIngredientMap($pdo, $bid, $b['ingredient_map'] ?? null);
        } catch (\InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
            return;
        }
        $ingredientMapJson = $ingredientMap !== null ? json_encode($ingredientMap, JSON_THROW_ON_ERROR) : null;
        $notes           = !empty($b['notes']) ? trim((string) $b['notes']) : null;

        $stmt = $pdo->prepare(
            'UPDATE dough_profiles 
             SET name = ?, unit_weight_grams = ?, hydration_pct = ?, biga_pct = ?, biga_water_pct = ?, biga_yeast_pct = ?,
                 poolish_pct = ?, poolish_water_pct = ?, poolish_yeast_pct = ?, direct_yeast_pct = ?, salt_pct = ?, sugar_pct = ?, oil_pct = ?,
                 flour_white_pct = ?, flour_integral_pct = ?, flour_semola_pct = ?, cost_per_kg = ?, ingredient_map = ?, notes = ?
             WHERE id = ? AND business_id = ?'
        );
        $stmt->execute([
            $name, $unitWeightGrams, $hydrationPct, $bigaPct, $bigaWaterPct, $bigaYeastPct,
            $poolishPct, $poolishWaterPct, $poolishYeastPct, $directYeastPct, $saltPct, $sugarPct, $oilPct,
            $flourWhitePct, $flourIntegPct, $flourSemolaPct, $costPerKg, $ingredientMapJson, $notes,
            $id, $bid,
        ]);

        $stmt = $pdo->prepare('SELECT * FROM dough_profiles WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Perfil no encontrado', 404);
            return;
        }

        Response::ok(['profile' => $this->formatProfile($row)]);
    }

    /**
     * DELETE /production/dough-profiles/{id}
     * Desactiva un perfil de masa.
     */
    public function doughProfileDestroy(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->params['id'];
        $pdo = Database::pdo();

        $stmt = $pdo->prepare('UPDATE dough_profiles SET is_active = 0 WHERE id = ? AND business_id = ?');
        $stmt->execute([$id, $bid]);

        Response::ok(['deleted' => true]);
    }

    private function ensureProfilesTable(\PDO $pdo, int $bid): void
    {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS dough_profiles (
                id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                business_id          BIGINT UNSIGNED NOT NULL,
                name                 VARCHAR(100)    NOT NULL,
                unit_weight_grams    DECIMAL(10,2)   NOT NULL DEFAULT 220.00,
                hydration_pct        DECIMAL(5,2)    NOT NULL DEFAULT 67.90,
                biga_pct             DECIMAL(5,2)    NOT NULL DEFAULT 25.00,
                biga_water_pct       DECIMAL(5,2)    NOT NULL DEFAULT 50.00,
                biga_yeast_pct       DECIMAL(6,3)    NOT NULL DEFAULT 0.500,
                poolish_pct          DECIMAL(5,2)    NOT NULL DEFAULT 0.00,
                poolish_water_pct    DECIMAL(5,2)    NOT NULL DEFAULT 100.00,
                poolish_yeast_pct    DECIMAL(6,3)    NOT NULL DEFAULT 0.000,
                direct_yeast_pct     DECIMAL(6,3)    NOT NULL DEFAULT 0.000,
                salt_pct             DECIMAL(5,2)    NOT NULL DEFAULT 2.70,
                sugar_pct            DECIMAL(5,2)    NOT NULL DEFAULT 0.00,
                oil_pct              DECIMAL(5,2)    NOT NULL DEFAULT 0.00,
                flour_white_pct      DECIMAL(5,2)    NOT NULL DEFAULT 81.75,
                flour_integral_pct   DECIMAL(5,2)    NOT NULL DEFAULT 12.17,
                flour_semola_pct     DECIMAL(5,2)    NOT NULL DEFAULT 6.08,
                cost_per_kg          DECIMAL(10,2)   NOT NULL DEFAULT 932.30,
                ingredient_map       JSON            NULL,
                notes                TEXT            NULL,
                is_active            TINYINT(1)      NOT NULL DEFAULT 1,
                created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_dp_business (business_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        // Si no hay perfiles para este negocio, sembrar perfiles por defecto
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM dough_profiles WHERE business_id = ? AND is_active = 1');
        $stmt->execute([$bid]);
        if ((int) $stmt->fetchColumn() === 0) {
            $ins = $pdo->prepare(
                'INSERT INTO dough_profiles 
                 (business_id, name, unit_weight_grams, hydration_pct, biga_pct, biga_water_pct, biga_yeast_pct,
                  poolish_pct, poolish_water_pct, poolish_yeast_pct, direct_yeast_pct, salt_pct, sugar_pct, oil_pct,
                  flour_white_pct, flour_integral_pct, flour_semola_pct, cost_per_kg, notes, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
            );
            foreach ($this->defaultProfiles($bid) as $p) {
                $ins->execute([
                    $bid,
                    $p['name'],
                    $p['unit_weight_grams'],
                    $p['hydration_pct'],
                    $p['biga_pct'],
                    $p['biga_water_pct'],
                    $p['biga_yeast_pct'],
                    $p['poolish_pct'],
                    $p['poolish_water_pct'],
                    $p['poolish_yeast_pct'],
                    $p['direct_yeast_pct'],
                    $p['salt_pct'],
                    $p['sugar_pct'],
                    $p['oil_pct'],
                    $p['flour_white_pct'],
                    $p['flour_integral_pct'],
                    $p['flour_semola_pct'],
                    $p['cost_per_kg'],
                    $p['notes'],
                ]);
            }
        }
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
                'name'              => 'Pizza Napolitana (Amasado Directo sin Biga)',
                'unit_weight_grams' => 220.00,
                'hydration_pct'     => 66.00,
                'biga_pct'          => 0.00,
                'biga_water_pct'    => 0.00,
                'biga_yeast_pct'    => 0.000,
                'poolish_pct'       => 0.00,
                'poolish_water_pct' => 0.00,
                'poolish_yeast_pct' => 0.000,
                'direct_yeast_pct'  => 0.350,
                'salt_pct'          => 2.70,
                'sugar_pct'         => 0.00,
                'oil_pct'           => 0.00,
                'flour_white_pct'   => 90.00,
                'flour_integral_pct'=> 5.00,
                'flour_semola_pct'  => 5.00,
                'cost_per_kg'       => 920.00,
                'notes'             => 'Amasado directo sin prefermento: 220g bollo, 66% hidratación, levadura directa 0.35%, sal 2.7%.',
            ],
            [
                'id'                => 3,
                'business_id'       => $bid,
                'name'              => 'Pizza Detroit Style (Bandeja Cuadrada)',
                'unit_weight_grams' => 380.00,
                'hydration_pct'     => 72.00,
                'biga_pct'          => 0.00,
                'biga_water_pct'    => 0.00,
                'biga_yeast_pct'    => 0.000,
                'poolish_pct'       => 0.00,
                'poolish_water_pct' => 0.00,
                'poolish_yeast_pct' => 0.000,
                'direct_yeast_pct'  => 0.400,
                'salt_pct'          => 2.50,
                'sugar_pct'         => 1.00,
                'oil_pct'           => 3.00,
                'flour_white_pct'   => 90.00,
                'flour_integral_pct'=> 0.00,
                'flour_semola_pct'  => 10.00,
                'cost_per_kg'       => 960.00,
                'notes'             => 'Detroit Style clásica: 380g masa gruesa aireada con costra crocante en los bordes, oliva 3%, azúcar 1%.',
            ],
            [
                'id'                => 4,
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
                'id'                => 5,
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
                'id'                => 6,
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
                'id'                => 7,
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
                'id'                => 8,
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

    private function normalizeIngredientMap(\PDO $pdo, int $bid, mixed $raw): ?array
    {
        if ($raw === null) {
            return null;
        }
        if (!is_array($raw)) {
            throw new \InvalidArgumentException('La asignación de insumos debe ser un objeto válido.');
        }

        $allowed = [
            'flour_white_id', 'flour_integral_id', 'flour_semola_id',
            'biga_yeast_id', 'poolish_yeast_id', 'direct_yeast_id',
            'salt_id', 'sugar_id', 'oil_id', 'chickpea_flour_id', 'water_id',
        ];
        $check = $pdo->prepare('SELECT id FROM supplies WHERE id = ? AND business_id = ? AND is_active = 1');
        $normalized = [];
        foreach ($allowed as $key) {
            $value = $raw[$key] ?? null;
            if ($value === null || $value === '' || (int) $value === 0) {
                $normalized[$key] = null;
                continue;
            }
            if (!is_numeric($value) || (int) $value <= 0) {
                throw new \InvalidArgumentException('La asignación de insumos contiene un identificador inválido.');
            }
            $check->execute([(int) $value, $bid]);
            if (!$check->fetchColumn()) {
                throw new \InvalidArgumentException('Uno de los insumos seleccionados no pertenece a este negocio o está inactivo.');
            }
            $normalized[$key] = (int) $value;
        }
        return $normalized;
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
            'ingredient_map'    => !empty($r['ingredient_map']) ? (json_decode((string) $r['ingredient_map'], true) ?: null) : null,
            'notes'             => $r['notes'],
        ];
    }
}
