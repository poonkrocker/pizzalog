<?php

declare(strict_types=1);

namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Repositories\ComboRepository;

/**
 * Grupos de un combo. Mismo patrón que VariantController: el PUT reemplaza
 * TODOS los grupos del producto de una.
 */
final class ComboController
{
    private ComboRepository $combos;

    public function __construct()
    {
        $this->combos = new ComboRepository();
    }

    /** GET /products/{id}/combo */
    public function show(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        $this->assertOwned($bid, $id);

        Response::ok($this->combos->forProduct($bid, $id));
    }

    /**
     * PUT /products/{id}/combo
     * Body: { groups: [ { name, select_count, item_product_ids: number[] } ] }
     * groups vacío = deja de ser combo (is_combo = 0).
     */
    public function update(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        $this->assertOwned($bid, $id);

        $raw = $req->input('groups');
        if (!is_array($raw)) {
            Response::error('Mandá el listado de grupos del combo', 422);
        }

        $groups = [];
        foreach ($raw as $g) {
            $name  = trim((string) ($g['name'] ?? ''));
            $count = (int) ($g['select_count'] ?? 0);
            $items = array_values(array_unique(array_map('intval', (array) ($g['item_product_ids'] ?? []))));

            if ($name === '') {
                Response::error('Cada grupo del combo necesita un nombre', 422);
            }
            if ($count < 1) {
                Response::error(sprintf('En "%s", cuántos hay que elegir tiene que ser 1 o más', $name), 422);
            }
            if (count($items) < $count) {
                Response::error(
                    sprintf('En "%s" pedís elegir %d pero cargaste %d opciones', $name, $count, count($items)),
                    422
                );
            }
            foreach ($items as $pid) {
                if ($pid === $id) {
                    Response::error('Un combo no puede incluirse a sí mismo', 422);
                }
                $this->assertOwned($bid, $pid, 'Hay una opción del combo que no existe en tu carta');
            }

            $groups[] = [
                'name'             => mb_substr($name, 0, 80),
                'select_count'     => $count,
                'item_product_ids' => $items,
            ];
        }

        $this->combos->sync($bid, $id, $groups);
        Response::ok($this->combos->forProduct($bid, $id));
    }

    private function assertOwned(int $bid, int $productId, string $msg = 'Producto no encontrado'): void
    {
        $stmt = Database::pdo()->prepare(
            'SELECT 1 FROM products WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$productId, $bid]);
        if (!$stmt->fetch()) {
            Response::error($msg, 404);
        }
    }
}
