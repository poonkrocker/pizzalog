<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

/**
 * Actualizador rápido de precios por lista de proveedor.
 *
 * El parseo de la planilla y el matching se hacen en el cliente con
 * @pizzalog/price-list (el catálogo ya está cargado ahí). Este controlador
 * persiste lo confirmado: precios de insumos, historial y alias aprendidos
 * para que la próxima lista del mismo proveedor se vincule sola.
 */
class PriceListController
{
    private const MAX_ITEMS = 3000;
    private static bool $tablesReady = false;

    public function __construct()
    {
        ProductController::ensureColumns();
        self::ensureTables();
    }

    public static function ensureTables(): void
    {
        if (self::$tablesReady) {
            return;
        }
        $pdo = Database::pdo();
        $pdo->exec("CREATE TABLE IF NOT EXISTS supply_price_history (
            id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            business_id   BIGINT UNSIGNED NOT NULL,
            supply_id     BIGINT UNSIGNED NOT NULL,
            old_cost      DECIMAL(14,4) NULL,
            new_cost      DECIMAL(14,4) NULL,
            unit          VARCHAR(16) NULL,
            supplier_id   BIGINT UNSIGNED NULL,
            source        VARCHAR(20) NOT NULL DEFAULT 'manual',
            batch_id      VARCHAR(40) NULL,
            source_name   VARCHAR(190) NULL,
            raw_name      VARCHAR(255) NULL,
            raw_price     DECIMAL(14,4) NULL,
            user_id       BIGINT UNSIGNED NULL,
            created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_sph_supply (business_id, supply_id, created_at),
            KEY idx_sph_batch (business_id, batch_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $pdo->exec("CREATE TABLE IF NOT EXISTS supplier_item_aliases (
            id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            business_id   BIGINT UNSIGNED NOT NULL,
            supplier_id   BIGINT UNSIGNED NOT NULL DEFAULT 0,
            alias_key     VARCHAR(255) NOT NULL,
            raw_name      VARCHAR(255) NULL,
            supply_id     BIGINT UNSIGNED NOT NULL,
            pack_quantity DECIMAL(14,4) NULL,
            pack_unit     VARCHAR(8) NULL,
            updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_supplier_alias (business_id, supplier_id, alias_key),
            KEY idx_alias_supply (business_id, supply_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        self::$tablesReady = true;
    }

    /** Registra un cambio de costo de insumo (lo usa también SupplyController::update). */
    public static function recordHistory(
        int $bid,
        int $supplyId,
        ?float $oldCost,
        ?float $newCost,
        ?string $unit,
        ?int $userId,
        string $source = 'manual',
        array $extra = []
    ): void {
        self::ensureTables();
        Database::pdo()->prepare(
            'INSERT INTO supply_price_history
                (business_id, supply_id, old_cost, new_cost, unit, supplier_id, source, batch_id, source_name, raw_name, raw_price, user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $bid, $supplyId, $oldCost, $newCost, $unit,
            $extra['supplier_id'] ?? null,
            $source,
            $extra['batch_id'] ?? null,
            isset($extra['source_name']) ? mb_substr((string) $extra['source_name'], 0, 190) : null,
            isset($extra['raw_name']) ? mb_substr((string) $extra['raw_name'], 0, 255) : null,
            $extra['raw_price'] ?? null,
            $userId,
        ]);
    }

    /** GET /supplies/price-lists/aliases?supplier_id= */
    public function aliases(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $supplierId = (int) ($req->query['supplier_id'] ?? 0);
        $stmt = Database::pdo()->prepare(
            'SELECT a.alias_key, a.raw_name, a.supply_id, a.pack_quantity, a.pack_unit, a.supplier_id
               FROM supplier_item_aliases a
               JOIN supplies s ON s.id = a.supply_id AND s.business_id = a.business_id AND s.is_active = 1
              WHERE a.business_id = ? AND a.supplier_id IN (0, ?)
              ORDER BY a.supplier_id ASC'
        );
        $stmt->execute([$bid, $supplierId]);
        // Si el mismo alias existe genérico y para el proveedor, prevalece el del proveedor (se procesa último).
        $byKey = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
            $byKey[$row['alias_key']] = [
                'alias_key' => $row['alias_key'],
                'raw_name' => $row['raw_name'],
                'target_id' => (string) $row['supply_id'],
                'pack_quantity' => $row['pack_quantity'] !== null ? (float) $row['pack_quantity'] : null,
                'pack_unit' => $row['pack_unit'],
            ];
        }
        Response::ok(['aliases' => array_values($byKey)]);
    }

    /**
     * POST /supplies/price-lists/apply
     * Body: { supplier_id?, source_name?, items: [{ supply_id, new_cost, alias_key?, raw_name?, raw_price?,
     *         pack_quantity?, pack_unit?, remember? }] }
     */
    public function apply(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $userId = isset($req->auth['user_id']) ? (int) $req->auth['user_id'] : null;
        $supplierId = is_numeric($req->input('supplier_id')) ? (int) $req->input('supplier_id') : null;
        $sourceName = trim((string) $req->input('source_name', '')) ?: null;
        $items = $req->input('items');
        if (!is_array($items) || count($items) < 1) {
            Response::error('No hay precios para aplicar', 422);
        }
        if (count($items) > self::MAX_ITEMS) {
            Response::error('Se pueden aplicar hasta 3.000 precios por lista', 413);
        }

        $pdo = Database::pdo();
        if ($supplierId !== null) {
            $check = $pdo->prepare('SELECT id FROM suppliers WHERE id = ? AND business_id = ?');
            $check->execute([$supplierId, $bid]);
            if (!$check->fetchColumn()) {
                Response::error('Proveedor no encontrado', 404);
            }
        }

        $batchId = 'pl_' . date('YmdHis') . '_' . bin2hex(random_bytes(4));
        $select = $pdo->prepare('SELECT id, cost, unit FROM supplies WHERE id = ? AND business_id = ? AND is_active = 1 FOR UPDATE');
        $update = $pdo->prepare('UPDATE supplies SET cost = ? WHERE id = ? AND business_id = ?');
        $linkSupplier = $pdo->prepare('UPDATE supplies SET supplier_id = ? WHERE id = ? AND business_id = ? AND supplier_id IS NULL');
        $upsertAlias = $pdo->prepare(
            'INSERT INTO supplier_item_aliases (business_id, supplier_id, alias_key, raw_name, supply_id, pack_quantity, pack_unit)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE raw_name = VALUES(raw_name), supply_id = VALUES(supply_id),
                                     pack_quantity = VALUES(pack_quantity), pack_unit = VALUES(pack_unit)'
        );

        $updated = [];
        $unchanged = 0;
        $skipped = [];
        $aliasesSaved = 0;
        $seen = [];

        $pdo->beginTransaction();
        try {
            foreach ($items as $index => $item) {
                if (!is_array($item)) {
                    $skipped[] = ['index' => $index, 'reason' => 'Ítem inválido'];
                    continue;
                }
                $supplyId = (int) ($item['supply_id'] ?? 0);
                $newCost = $item['new_cost'] ?? null;
                if ($supplyId <= 0 || !is_numeric($newCost) || (float) $newCost <= 0 || (float) $newCost > 1e9) {
                    $skipped[] = ['index' => $index, 'reason' => 'Insumo o precio inválido'];
                    continue;
                }
                if (isset($seen[$supplyId])) {
                    $skipped[] = ['index' => $index, 'supply_id' => $supplyId, 'reason' => 'Insumo repetido en la lista'];
                    continue;
                }
                $seen[$supplyId] = true;
                $select->execute([$supplyId, $bid]);
                $supply = $select->fetch(\PDO::FETCH_ASSOC);
                if (!$supply) {
                    $skipped[] = ['index' => $index, 'supply_id' => $supplyId, 'reason' => 'Insumo no encontrado o inactivo'];
                    continue;
                }
                $newCost = round((float) $newCost, 4);
                $oldCost = $supply['cost'] !== null ? (float) $supply['cost'] : null;

                if ($oldCost === null || abs($oldCost - $newCost) > 0.00005) {
                    $update->execute([$newCost, $supplyId, $bid]);
                    self::recordHistory($bid, $supplyId, $oldCost, $newCost, $supply['unit'], $userId, 'price_list', [
                        'supplier_id' => $supplierId,
                        'batch_id' => $batchId,
                        'source_name' => $sourceName,
                        'raw_name' => $item['raw_name'] ?? null,
                        'raw_price' => is_numeric($item['raw_price'] ?? null) ? (float) $item['raw_price'] : null,
                    ]);
                    $updated[] = ['supply_id' => $supplyId, 'old_cost' => $oldCost, 'new_cost' => $newCost];
                } else {
                    $unchanged++;
                }

                if ($supplierId !== null) {
                    $linkSupplier->execute([$supplierId, $supplyId, $bid]);
                }

                $aliasKey = trim((string) ($item['alias_key'] ?? ''));
                if (!empty($item['remember']) && $aliasKey !== '' && strlen($aliasKey) <= 255) {
                    $packQty = is_numeric($item['pack_quantity'] ?? null) && (float) $item['pack_quantity'] > 0
                        ? (float) $item['pack_quantity'] : null;
                    $packUnit = in_array($item['pack_unit'] ?? null, ['kg', 'g', 'l', 'ml', 'u'], true) ? $item['pack_unit'] : null;
                    $upsertAlias->execute([
                        $bid, $supplierId ?? 0, $aliasKey,
                        isset($item['raw_name']) ? mb_substr((string) $item['raw_name'], 0, 255) : null,
                        $supplyId, $packQty, $packQty !== null ? $packUnit : null,
                    ]);
                    $aliasesSaved++;
                }
            }

            if ($updated) {
                // Los costos de producto calculados con precios anteriores dejan de estar vigentes.
                $pdo->prepare('UPDATE products SET cost_is_current = 0 WHERE business_id = ?')->execute([$bid]);
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            error_log('[pizzalog] price list apply failed: ' . $e->getMessage());
            Response::error('No se pudieron aplicar los precios', 500);
        }

        Response::ok([
            'batch_id' => $batchId,
            'updated' => $updated,
            'unchanged' => $unchanged,
            'skipped' => $skipped,
            'aliases_saved' => $aliasesSaved,
        ]);
    }

    /** POST /supplies/price-lists/{batch}/revert — deshace una lista aplicada si no hubo cambios posteriores. */
    public function revert(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $batchId = (string) $req->param('batch');
        $userId = isset($req->auth['user_id']) ? (int) $req->auth['user_id'] : null;
        if (!preg_match('/^pl_\d{14}_[a-f0-9]{8}$/', $batchId)) {
            Response::error('Lote inválido', 422);
        }
        $pdo = Database::pdo();
        $rows = $pdo->prepare('SELECT supply_id, old_cost, new_cost, unit FROM supply_price_history WHERE business_id = ? AND batch_id = ?');
        $rows->execute([$bid, $batchId]);
        $history = $rows->fetchAll(\PDO::FETCH_ASSOC);
        if (!$history) {
            Response::error('No se encontró la lista aplicada', 404);
        }

        $reverted = 0;
        $conflicts = [];
        $pdo->beginTransaction();
        try {
            $select = $pdo->prepare('SELECT cost FROM supplies WHERE id = ? AND business_id = ? FOR UPDATE');
            $update = $pdo->prepare('UPDATE supplies SET cost = ? WHERE id = ? AND business_id = ?');
            foreach ($history as $row) {
                $select->execute([(int) $row['supply_id'], $bid]);
                $current = $select->fetchColumn();
                if ($current === false) continue;
                // Solo se revierte si el precio sigue siendo el que puso esta lista.
                if ($current === null || abs((float) $current - (float) $row['new_cost']) > 0.00005) {
                    $conflicts[] = (int) $row['supply_id'];
                    continue;
                }
                $old = $row['old_cost'] !== null ? (float) $row['old_cost'] : null;
                $update->execute([$old, (int) $row['supply_id'], $bid]);
                self::recordHistory($bid, (int) $row['supply_id'], (float) $row['new_cost'], $old, $row['unit'], $userId, 'revert', [
                    'batch_id' => $batchId . '_rev',
                ]);
                $reverted++;
            }
            if ($reverted) {
                $pdo->prepare('UPDATE products SET cost_is_current = 0 WHERE business_id = ?')->execute([$bid]);
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            error_log('[pizzalog] price list revert failed: ' . $e->getMessage());
            Response::error('No se pudo revertir la lista', 500);
        }
        Response::ok(['reverted' => $reverted, 'conflicts' => $conflicts]);
    }

    /** GET /supplies/{id}/price-history */
    public function history(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id = (int) $req->param('id');
        $stmt = Database::pdo()->prepare(
            'SELECT h.id, h.old_cost, h.new_cost, h.unit, h.source, h.source_name, h.raw_name, h.raw_price,
                    h.batch_id, h.created_at, sp.name AS supplier_name, u.name AS user_name
               FROM supply_price_history h
          LEFT JOIN suppliers sp ON sp.id = h.supplier_id AND sp.business_id = h.business_id
          LEFT JOIN users u ON u.id = h.user_id
              WHERE h.business_id = ? AND h.supply_id = ?
              ORDER BY h.created_at DESC, h.id DESC
              LIMIT 100'
        );
        $stmt->execute([$bid, $id]);
        $rows = array_map(static function (array $r): array {
            $r['id'] = (int) $r['id'];
            $r['old_cost'] = $r['old_cost'] !== null ? (float) $r['old_cost'] : null;
            $r['new_cost'] = $r['new_cost'] !== null ? (float) $r['new_cost'] : null;
            $r['raw_price'] = $r['raw_price'] !== null ? (float) $r['raw_price'] : null;
            return $r;
        }, $stmt->fetchAll(\PDO::FETCH_ASSOC));
        Response::ok(['history' => $rows]);
    }
}
