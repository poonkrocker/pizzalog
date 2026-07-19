<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Repositories\TableSessionRepository;
use Pizzalog\Services\TableCheckoutService;

/**
 * Operación de mesa: abrir la cuenta, ver el detalle en vivo, sumar rondas
 * (comandas) y pedir la cuenta. Las maniobras (juntar/transferir/dividir) y
 * el cobro van en bloques aparte. Operable por cualquier usuario autenticado.
 */
class TableSessionController
{
    private TableSessionRepository $repo;

    public function __construct()
    {
        $this->repo = new TableSessionRepository();
    }

    /** GET /table-sessions — cuentas abiertas (resumen) */
    public function index(Request $req): void
    {
        Response::ok(['sessions' => $this->repo->listOpenSessions((int) $req->auth['business_id'])]);
    }

    /** GET /table-sessions/{id} — la cuenta en vivo */
    public function show(Request $req): void
    {
        $session = $this->repo->getSessionDetail((int) $req->auth['business_id'], (int) $req->param('id'));
        if (!$session) {
            Response::error('Cuenta no encontrada', 404);
        }
        Response::ok(['session' => $session]);
    }

    /**
     * POST /table-sessions — abrir cuenta
     * Body: { table_ids: [int, ...], party_size?, note? }
     */
    public function store(Request $req): void
    {
        $bid      = (int) $req->auth['business_id'];
        $tableIds = $req->input('table_ids', []);

        if (!is_array($tableIds) || $tableIds === []) {
            Response::error('Indicá al menos una mesa', 422);
        }
        $tableIds = array_values(array_unique(array_map('intval', $tableIds)));

        $check = $this->repo->validateTablesFree($bid, $tableIds);
        if (!($check['ok'] ?? false)) {
            $msg = isset($check['busy'])
                ? 'La mesa ' . $check['busy'] . ' ya tiene una cuenta abierta'
                : ($check['error'] ?? 'Mesas inválidas');
            Response::error($msg, 422);
        }

        $partySize = $req->input('party_size');
        $partySize = is_numeric($partySize) ? (int) $partySize : null;
        $note      = trim((string) $req->input('note', '')) ?: null;
        $label     = trim((string) $req->input('label', '')) ?: null;

        $id = $this->repo->openSession($bid, (int) $req->auth['user_id'], $tableIds, $partySize, $note, $label);
        Response::ok(['session' => $this->repo->getSessionDetail($bid, $id)], 201);
    }

    /**
     * POST /table-sessions/{id}/rounds — agregar una comanda
     * Body: { items: [ { product_id, qty, note? }, ... ], note? }
     */
    public function addRound(Request $req): void
    {
        $bid     = (int) $req->auth['business_id'];
        $id      = (int) $req->param('id');
        $session = $this->repo->getSession($bid, $id);

        if (!$session) {
            Response::error('Cuenta no encontrada', 404);
        }
        if (!$this->repo->isOpen($session)) {
            Response::error('La cuenta no está abierta', 422);
        }

        $items = $req->input('items', []);
        if (!is_array($items) || $items === []) {
            Response::error('La comanda no tiene ítems', 422);
        }
        foreach ($items as $it) {
            if (!isset($it['product_id']) || (int) $it['product_id'] <= 0) {
                Response::error('Cada ítem necesita un product_id válido', 422);
            }
        }

        $note = trim((string) $req->input('note', '')) ?: null;

        try {
            $roundId = $this->repo->addRound($bid, $id, (int) $req->auth['user_id'], $items, $note);
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }

        Response::ok(['round' => $this->repo->getRound($bid, $roundId)], 201);
    }

    /** POST /table-sessions/{id}/request-bill — marcar que pidieron la cuenta */
    public function requestBill(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');

        if (!$this->repo->getSession($bid, $id)) {
            Response::error('Cuenta no encontrada', 404);
        }
        if (!$this->repo->requestBill($bid, $id)) {
            Response::error('La cuenta no está abierta', 422);
        }
        Response::ok(['session' => $this->repo->getSessionDetail($bid, $id)]);
    }

    /** DELETE /table-sessions/{id}/items/{itemId} — anular un ítem mal cargado */
    public function cancelItem(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');

        $session = $this->repo->getSession($bid, $id);
        if (!$session) {
            Response::error('Cuenta no encontrada', 404);
        }
        if (!$this->repo->isOpen($session)) {
            Response::error('La cuenta no está abierta', 422);
        }
        if (!$this->repo->cancelItem($bid, $id, (int) $req->param('itemId'))) {
            Response::error('El ítem no existe o ya fue anulado', 422);
        }
        Response::ok(['session' => $this->repo->getSessionDetail($bid, $id)]);
    }

    /**
     * PUT /table-sessions/{id}/tables — reemplaza las mesas de la cuenta.
     * Sirve para transferir (otro conjunto) y para juntar/soltar mesas.
     * Body: { table_ids: [int, ...] }
     */
    public function setTables(Request $req): void
    {
        $bid     = (int) $req->auth['business_id'];
        $id      = (int) $req->param('id');
        $session = $this->repo->getSession($bid, $id);

        if (!$session) {
            Response::error('Cuenta no encontrada', 404);
        }
        if (!$this->repo->isOpen($session)) {
            Response::error('La cuenta no está abierta', 422);
        }

        $tableIds = $req->input('table_ids', []);
        if (!is_array($tableIds) || $tableIds === []) {
            Response::error('Indicá al menos una mesa', 422);
        }

        $result = $this->repo->replaceTables($bid, $id, $tableIds);
        if (!($result['ok'] ?? false)) {
            $msg = isset($result['busy'])
                ? 'La mesa ' . $result['busy'] . ' ya tiene una cuenta abierta'
                : ($result['error'] ?? 'Mesas inválidas');
            Response::error($msg, 422);
        }

        Response::ok(['session' => $this->repo->getSessionDetail($bid, $id)]);
    }

    /**
     * POST /table-sessions/{id}/merge — fusiona otra cuenta dentro de esta.
     * Body: { source_session_id }
     */
    public function merge(Request $req): void
    {
        $bid      = (int) $req->auth['business_id'];
        $targetId = (int) $req->param('id');
        $sourceId = (int) $req->input('source_session_id', 0);

        if ($sourceId <= 0 || $sourceId === $targetId) {
            Response::error('Indicá otra cuenta para fusionar', 422);
        }

        $target = $this->repo->getSession($bid, $targetId);
        $source = $this->repo->getSession($bid, $sourceId);
        if (!$target || !$source) {
            Response::error('Alguna de las cuentas no existe', 404);
        }
        if (!$this->repo->isOpen($target) || !$this->repo->isOpen($source)) {
            Response::error('Ambas cuentas deben estar abiertas', 422);
        }

        $this->repo->mergeSessions($bid, $targetId, $sourceId);
        Response::ok(['session' => $this->repo->getSessionDetail($bid, $targetId)]);
    }

    /**
     * POST /table-sessions/{id}/close — cobra y cierra la cuenta.
     * Body simple:   { payment_method, cash_session_id?, note? }
     * Body dividido: { splits: [ { item_ids:[...], payment_method }, ... ], cash_session_id?, note? }
     */
    public function close(Request $req): void
    {
        $bid     = (int) $req->auth['business_id'];
        $id      = (int) $req->param('id');
        $session = $this->repo->getSession($bid, $id);

        if (!$session) {
            Response::error('Cuenta no encontrada', 404);
        }
        if (!$this->repo->isOpen($session)) {
            Response::error('La cuenta no está abierta', 422);
        }

        $splits        = $req->input('splits', []);
        $splits        = is_array($splits) ? $splits : [];
        $paymentMethod = (string) $req->input('payment_method', 'cash');
        $cashSessionId = $req->input('cash_session_id');
        $cashSessionId = is_numeric($cashSessionId) ? (int) $cashSessionId : null;
        $note          = trim((string) $req->input('note', '')) ?: null;

        try {
            $saleIds = (new TableCheckoutService())
                ->close($bid, (int) $req->auth['user_id'], $id, $paymentMethod, $splits, $cashSessionId, $note);
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }

        Response::ok(['sale_ids' => $saleIds], 201);
    }

    /** POST /table-sessions/{id}/cancel — descarta la cuenta sin cobrar (manage) */
    public function cancel(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');

        if (!$this->repo->getSession($bid, $id)) {
            Response::error('Cuenta no encontrada', 404);
        }
        if (!$this->repo->cancelSession($bid, $id)) {
            Response::error('La cuenta no está abierta', 422);
        }
        Response::ok(['cancelled' => true]);
    }
}
