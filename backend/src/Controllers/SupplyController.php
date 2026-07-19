<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Repositories\SupplyRepository;

/**
 * Insumos (consumibles no vendibles) y su stock. El stock solo cambia por
 * movimientos, nunca por edición directa. Lectura: autenticado. Escritura y
 * movimientos: admin/manager.
 */
class SupplyController
{
    private SupplyRepository $repo;

    public function __construct()
    {
        $this->repo = new SupplyRepository();
    }

    /** GET /supplies?category= */
    public function index(Request $req): void
    {
        $category = $req->query['category'] ?? null;
        Response::ok(['supplies' => $this->repo->list((int) $req->auth['business_id'], $category)]);
    }

    /** GET /supplies/low-stock */
    public function lowStock(Request $req): void
    {
        Response::ok(['supplies' => $this->repo->lowStock((int) $req->auth['business_id'])]);
    }

    /** GET /supplies/{id} */
    public function show(Request $req): void
    {
        $supply = $this->repo->get((int) $req->auth['business_id'], (int) $req->param('id'));
        if (!$supply) {
            Response::error('Insumo no encontrado', 404);
        }
        Response::ok(['supply' => $supply]);
    }

    /** POST /supplies */
    public function store(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $d   = $this->validate($req);
        // El stock inicial se carga como movimiento aparte; arranca en 0.
        $d['stock'] = 0;
        $id = $this->repo->create($bid, $d);

        $initial = (float) $req->input('initial_stock', 0);
        if ($initial > 0) {
            $this->repo->applyMovement($bid, $id, 'restock', $initial, 'Carga inicial', (int) $req->auth['user_id']);
        }
        Response::ok(['supply' => $this->repo->get($bid, $id)], 201);
    }

    /** PUT /supplies/{id} */
    public function update(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        if (!$this->repo->get($bid, $id)) {
            Response::error('Insumo no encontrado', 404);
        }
        $d = $this->validate($req);
        $d['is_active'] = (int) (bool) $req->input('is_active', true);
        $this->repo->update($bid, $id, $d);
        Response::ok(['supply' => $this->repo->get($bid, $id)]);
    }

    /** DELETE /supplies/{id} (baja lógica) */
    public function destroy(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        if (!$this->repo->get($bid, $id)) {
            Response::error('Insumo no encontrado', 404);
        }
        $this->repo->deactivate($bid, $id);
        Response::ok(['deleted' => true]);
    }

    /** GET /supplies/{id}/movements */
    public function movements(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        if (!$this->repo->get($bid, $id)) {
            Response::error('Insumo no encontrado', 404);
        }
        Response::ok(['movements' => $this->repo->movements($bid, $id)]);
    }

    /**
     * POST /supplies/{id}/movement
     * Body: { type: restock|consumption|adjustment|count, quantity, reason? }
     *  - restock: suma quantity
     *  - consumption: resta quantity
     *  - adjustment: suma/resta quantity (con signo); reason obligatorio
     *  - count: fija el stock en quantity (el delta lo calcula el servidor)
     */
    public function movement(Request $req): void
    {
        $bid    = (int) $req->auth['business_id'];
        $id     = (int) $req->param('id');
        $supply = $this->repo->get($bid, $id);
        if (!$supply) {
            Response::error('Insumo no encontrado', 404);
        }

        $type     = (string) $req->input('type', '');
        $quantity = (float) $req->input('quantity', 0);
        $reason   = trim((string) $req->input('reason', '')) ?: null;
        $userId   = (int) $req->auth['user_id'];

        if (!in_array($type, ['restock', 'consumption', 'adjustment', 'count'], true)) {
            Response::error('Tipo de movimiento inválido', 422);
        }

        $delta = match ($type) {
            'restock'     => abs($quantity),
            'consumption' => -abs($quantity),
            'adjustment'  => $quantity, // con signo
            'count'       => $quantity - (float) $supply['stock'],
            default       => 0.0,
        };

        if ($type === 'adjustment' && $reason === null) {
            Response::error('El ajuste requiere un motivo', 422);
        }
        if ($type !== 'count' && $quantity <= 0) {
            Response::error('La cantidad debe ser mayor a 0', 422);
        }

        $updated = $this->repo->applyMovement($bid, $id, $type, $delta, $reason, $userId);
        Response::ok(['supply' => $updated]);
    }

    private function validate(Request $req): array
    {
        $name = trim((string) $req->input('name', ''));
        if ($name === '') {
            Response::error('El nombre es obligatorio', 422);
        }
        $supplierId = $req->input('supplier_id');
        $minStock   = $req->input('min_stock');
        $cost       = $req->input('cost');

        return [
            'name'        => $name,
            'category'    => trim((string) $req->input('category', '')) ?: null,
            'unit'        => trim((string) $req->input('unit', 'u')) ?: 'u',
            'min_stock'   => is_numeric($minStock) ? (float) $minStock : null,
            'cost'        => is_numeric($cost) ? (float) $cost : null,
            'supplier_id' => is_numeric($supplierId) ? (int) $supplierId : null,
            'is_active'   => 1,
        ];
    }
}
