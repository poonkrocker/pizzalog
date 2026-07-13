<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Repositories\TableRepository;

/**
 * Mesas: alta/edición, croquis (posiciones) y vista del plano con estado.
 * Lectura: cualquier usuario autenticado (el mozo ve el salón).
 * Escritura: admin/manager.
 */
class TableController
{
    private const SHAPES = ['round', 'square', 'rect'];
    private const KINDS  = ['table', 'bar'];

    private TableRepository $repo;

    public function __construct()
    {
        $this->repo = new TableRepository();
    }

    /** GET /tables?area_id= */
    public function index(Request $req): void
    {
        $areaId = isset($req->query['area_id']) ? (int) $req->query['area_id'] : null;
        Response::ok(['tables' => $this->repo->listTables((int) $req->auth['business_id'], $areaId)]);
    }

    /** GET /tables/{id} */
    public function show(Request $req): void
    {
        $table = $this->repo->getTable((int) $req->auth['business_id'], (int) $req->param('id'));
        if (!$table) {
            Response::error('Mesa no encontrada', 404);
        }
        Response::ok(['table' => $table]);
    }

    /** GET /floor — áreas con sus mesas y el estado de cada una */
    public function floor(Request $req): void
    {
        Response::ok(['areas' => $this->repo->getFloor((int) $req->auth['business_id'])]);
    }

    /** POST /tables */
    public function store(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $d   = $this->validate($req, $bid);

        $id = $this->repo->createTable($bid, $d);
        Response::ok(['table' => $this->repo->getTable($bid, $id)], 201);
    }

    /** PUT /tables/{id} */
    public function update(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        if (!$this->repo->getTable($bid, $id)) {
            Response::error('Mesa no encontrada', 404);
        }

        $d = $this->validate($req, $bid);
        $d['is_active'] = (int) (bool) $req->input('is_active', true);

        $this->repo->updateTable($bid, $id, $d);
        Response::ok(['table' => $this->repo->getTable($bid, $id)]);
    }

    /**
     * PUT /tables/layout — guarda posiciones de varias mesas a la vez.
     * Body: { tables: [ { id, pos_x, pos_y, width, height, rotation, area_id? }, ... ] }
     */
    public function layout(Request $req): void
    {
        $bid   = (int) $req->auth['business_id'];
        $items = $req->input('tables', []);
        if (!is_array($items) || $items === []) {
            Response::error('No hay mesas para actualizar', 422);
        }
        foreach ($items as $it) {
            if (!isset($it['id'])) {
                Response::error('Cada mesa debe incluir su id', 422);
            }
        }

        $updated = $this->repo->updateLayout($bid, $items);
        Response::ok(['updated' => $updated]);
    }

    /** DELETE /tables/{id} — baja lógica; bloquea si la mesa está ocupada */
    public function destroy(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        if (!$this->repo->getTable($bid, $id)) {
            Response::error('Mesa no encontrada', 404);
        }
        if ($this->repo->tableHasOpenSession($bid, $id)) {
            Response::error('La mesa tiene una cuenta abierta; cerrala primero', 422);
        }
        $this->repo->deactivateTable($bid, $id);
        Response::ok(['deleted' => true]);
    }

    // --- Helpers ------------------------------------------------------

    private function validate(Request $req, int $bid): array
    {
        $areaId = (int) $req->input('area_id', 0);
        if ($areaId <= 0 || !$this->repo->getArea($bid, $areaId)) {
            Response::error('El sector indicado no existe', 422);
        }

        $label = trim((string) $req->input('label', ''));
        if ($label === '') {
            Response::error('La etiqueta de la mesa es obligatoria', 422);
        }

        $shape = (string) $req->input('shape', 'square');
        if (!in_array($shape, self::SHAPES, true)) {
            Response::error('Forma de mesa inválida', 422);
        }

        $capacity = (int) $req->input('capacity', 4);
        if ($capacity <= 0) {
            Response::error('La capacidad debe ser mayor a 0', 422);
        }

        $kind = (string) $req->input('kind', 'table');
        if (!in_array($kind, self::KINDS, true)) {
            Response::error('Tipo de lugar inválido', 422);
        }

        return [
            'area_id'   => $areaId,
            'label'     => $label,
            'kind'      => $kind,
            'capacity'  => $capacity,
            'shape'     => $shape,
            'pos_x'     => (int) $req->input('pos_x', 0),
            'pos_y'     => (int) $req->input('pos_y', 0),
            'width'     => (int) $req->input('width', 80),
            'height'    => (int) $req->input('height', 80),
            'rotation'  => (int) $req->input('rotation', 0),
            'is_active' => 1,
        ];
    }
}
