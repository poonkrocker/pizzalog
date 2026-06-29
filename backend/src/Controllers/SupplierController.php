<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Repositories\SupplierRepository;

/** Proveedores. Lectura: autenticado. Escritura: admin/manager. */
class SupplierController
{
    private SupplierRepository $repo;

    public function __construct()
    {
        $this->repo = new SupplierRepository();
    }

    /** GET /suppliers?active=1 */
    public function index(Request $req): void
    {
        $activeOnly = ($req->query['active'] ?? '') === '1';
        Response::ok(['suppliers' => $this->repo->list((int) $req->auth['business_id'], $activeOnly)]);
    }

    /** GET /suppliers/{id} */
    public function show(Request $req): void
    {
        $supplier = $this->repo->get((int) $req->auth['business_id'], (int) $req->param('id'));
        if (!$supplier) {
            Response::error('Proveedor no encontrado', 404);
        }
        Response::ok(['supplier' => $supplier]);
    }

    /** POST /suppliers */
    public function store(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $d   = $this->validate($req);
        $id  = $this->repo->create($bid, $d);
        Response::ok(['supplier' => $this->repo->get($bid, $id)], 201);
    }

    /** PUT /suppliers/{id} */
    public function update(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        if (!$this->repo->get($bid, $id)) {
            Response::error('Proveedor no encontrado', 404);
        }
        $d = $this->validate($req);
        $d['is_active'] = (int) (bool) $req->input('is_active', true);
        $this->repo->update($bid, $id, $d);
        Response::ok(['supplier' => $this->repo->get($bid, $id)]);
    }

    /** DELETE /suppliers/{id} (baja lógica) */
    public function destroy(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        if (!$this->repo->get($bid, $id)) {
            Response::error('Proveedor no encontrado', 404);
        }
        $this->repo->deactivate($bid, $id);
        Response::ok(['deleted' => true]);
    }

    private function validate(Request $req): array
    {
        $name = trim((string) $req->input('name', ''));
        if ($name === '') {
            Response::error('El nombre es obligatorio', 422);
        }
        return [
            'name'         => $name,
            'contact_name' => trim((string) $req->input('contact_name', '')) ?: null,
            'phone'        => trim((string) $req->input('phone', '')) ?: null,
            'email'        => trim((string) $req->input('email', '')) ?: null,
            'cuit'         => trim((string) $req->input('cuit', '')) ?: null,
            'notes'        => trim((string) $req->input('notes', '')) ?: null,
            'is_active'    => 1,
        ];
    }
}
