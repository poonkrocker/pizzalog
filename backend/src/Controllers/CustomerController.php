<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Repositories\CustomerRepository;

/**
 * Clientes (CRM básico para delivery). Lectura y alta: cualquier usuario
 * autenticado (el cajero los carga al tomar un pedido). Edición y borrado:
 * admin/manager.
 */
class CustomerController
{
    private CustomerRepository $repo;

    public function __construct()
    {
        $this->repo = new CustomerRepository();
    }

    /** GET /customers?q= */
    public function index(Request $req): void
    {
        $q = $req->query['q'] ?? null;
        Response::ok(['customers' => $this->repo->list((int) $req->auth['business_id'], $q)]);
    }

    /** GET /customers/{id} */
    public function show(Request $req): void
    {
        $customer = $this->repo->get((int) $req->auth['business_id'], (int) $req->param('id'));
        if (!$customer) {
            Response::error('Cliente no encontrado', 404);
        }
        Response::ok(['customer' => $customer]);
    }

    /** POST /customers */
    public function store(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $d   = $this->validate($req);
        $id  = $this->repo->create($bid, $d);
        Response::ok(['customer' => $this->repo->get($bid, $id)], 201);
    }

    /** PUT /customers/{id} */
    public function update(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        if (!$this->repo->get($bid, $id)) {
            Response::error('Cliente no encontrado', 404);
        }
        $this->repo->update($bid, $id, $this->validate($req));
        Response::ok(['customer' => $this->repo->get($bid, $id)]);
    }

    /** DELETE /customers/{id} */
    public function destroy(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        if (!$this->repo->get($bid, $id)) {
            Response::error('Cliente no encontrado', 404);
        }
        $this->repo->delete($bid, $id);
        Response::ok(['deleted' => true]);
    }

    private function validate(Request $req): array
    {
        $name = trim((string) $req->input('name', ''));
        if ($name === '') {
            Response::error('El nombre es obligatorio', 422);
        }
        return [
            'name'    => $name,
            'phone'   => trim((string) $req->input('phone', '')) ?: null,
            'email'   => trim((string) $req->input('email', '')) ?: null,
            'address' => trim((string) $req->input('address', '')) ?: null,
            'notes'   => trim((string) $req->input('notes', '')) ?: null,
        ];
    }
}
