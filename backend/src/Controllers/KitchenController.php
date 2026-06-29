<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Repositories\KitchenRepository;
use Pizzalog\Repositories\TableSessionRepository;

/**
 * Pantalla de cocina (KDS). Muestra las comandas activas y permite avanzar su
 * estado (pendiente → en preparación → lista → servida) y marcar impresión.
 * Operable por cualquier usuario autenticado (incluido el rol kitchen).
 */
class KitchenController
{
    private const STATES         = ['pending', 'preparing', 'ready', 'served', 'cancelled'];
    private const FINAL          = ['served', 'cancelled'];
    private const DEFAULT_ACTIVE = ['pending', 'preparing', 'ready'];

    private KitchenRepository $repo;
    private TableSessionRepository $sessions;

    public function __construct()
    {
        $this->repo     = new KitchenRepository();
        $this->sessions = new TableSessionRepository();
    }

    /** GET /kitchen/rounds?status=pending,preparing */
    public function index(Request $req): void
    {
        $statuses = self::DEFAULT_ACTIVE;
        if (!empty($req->query['status'])) {
            $requested = array_values(array_filter(
                array_map('trim', explode(',', (string) $req->query['status'])),
                static fn($s) => in_array($s, self::STATES, true)
            ));
            if ($requested !== []) {
                $statuses = $requested;
            }
        }

        Response::ok(['rounds' => $this->repo->listActiveRounds((int) $req->auth['business_id'], $statuses)]);
    }

    /** PUT /kitchen/rounds/{id}/status — Body: { status } */
    public function updateStatus(Request $req): void
    {
        $bid   = (int) $req->auth['business_id'];
        $id    = (int) $req->param('id');
        $round = $this->sessions->getRound($bid, $id);

        if (!$round) {
            Response::error('Comanda no encontrada', 404);
        }

        $status = (string) $req->input('status', '');
        if (!in_array($status, self::STATES, true)) {
            Response::error('Estado inválido', 422);
        }
        if (in_array($round['status'], self::FINAL, true)) {
            $label = $round['status'] === 'served' ? 'servida' : 'cancelada';
            Response::error('La comanda ya está ' . $label, 422);
        }

        $this->repo->updateStatus($bid, $id, $status);
        Response::ok(['round' => $this->sessions->getRound($bid, $id)]);
    }

    /** POST /kitchen/rounds/{id}/print — registra que la comanda se imprimió */
    public function print(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');

        if (!$this->sessions->getRound($bid, $id)) {
            Response::error('Comanda no encontrada', 404);
        }
        $this->repo->markPrinted($bid, $id);
        Response::ok(['round' => $this->sessions->getRound($bid, $id)]);
    }
}
