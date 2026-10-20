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

    /** DELETE /table-areas/{id} — si cascade=1 desactiva también sus mesas */
    public function destroy(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        if (!$this->repo->getArea($bid, $id)) {
            Response::error('Sector no encontrado', 404);
        }
        $cascade = !empty($req->query['cascade']) || (bool) $req->input('cascade', false);
        if ($this->repo->areaHasTables($bid, $id)) {
            if (!$cascade) {
                Response::error('El sector tiene mesas asignadas. ¿Deseas eliminarlo junto con todas sus mesas?', 422);
            }
            \Pizzalog\Core\Database::pdo()->prepare(
                'UPDATE tables SET is_active = 0 WHERE area_id = ? AND business_id = ?'
            )->execute([$id, $bid]);
        }
        $this->repo->deleteArea($bid, $id);
        Response::ok(['deleted' => true]);
    }
}
