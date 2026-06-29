<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Repositories\TableRepository;

/**
 * Áreas/sectores del salón (adentro, vereda, barra...). Lectura: cualquier
 * usuario autenticado. Escritura: admin/manager.
 */
class TableAreaController
{
    private TableRepository $repo;

    public function __construct()
    {
        $this->repo = new TableRepository();
    }

    /** GET /table-areas */
    public function index(Request $req): void
    {
        Response::ok(['areas' => $this->repo->listAreas((int) $req->auth['business_id'])]);
    }

    /** POST /table-areas */
    public function store(Request $req): void
    {
        $bid  = (int) $req->auth['business_id'];
        $name = trim((string) $req->input('name', ''));
        if ($name === '') {
            Response::error('El nombre del sector es obligatorio', 422);
        }
        $sortOrder = (int) $req->input('sort_order', 0);

        $id = $this->repo->createArea($bid, $name, $sortOrder);
        Response::ok(['area' => $this->repo->getArea($bid, $id)], 201);
    }

    /** PUT /table-areas/{id} */
    public function update(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        if (!$this->repo->getArea($bid, $id)) {
            Response::error('Sector no encontrado', 404);
        }

        $name = trim((string) $req->input('name', ''));
        if ($name === '') {
            Response::error('El nombre del sector es obligatorio', 422);
        }
        $sortOrder = (int) $req->input('sort_order', 0);

        $this->repo->updateArea($bid, $id, $name, $sortOrder);
        Response::ok(['area' => $this->repo->getArea($bid, $id)]);
    }

    /** DELETE /table-areas/{id} — bloquea si tiene mesas activas */
    public function destroy(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        if (!$this->repo->getArea($bid, $id)) {
            Response::error('Sector no encontrado', 404);
        }
        if ($this->repo->areaHasTables($bid, $id)) {
            Response::error('El sector tiene mesas asignadas; movelas o eliminalas primero', 422);
        }
        $this->repo->deleteArea($bid, $id);
        Response::ok(['deleted' => true]);
    }
}
