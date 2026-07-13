<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;
use Pizzalog\Repositories\VariantRepository;

/**
 * Opciones y variantes de un producto. Lectura: autenticado. Escritura:
 * admin/manager.
 */
class VariantController
{
    private VariantRepository $repo;

    public function __construct()
    {
        $this->repo = new VariantRepository();
    }

    /** GET /products/{id}/variants */
    public function show(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $pid = (int) $req->param('id');
        if (!$this->ownsProduct($bid, $pid)) {
            Response::error('Producto no encontrado', 404);
        }
        Response::ok($this->repo->forProduct($bid, $pid));
    }

    /**
     * PUT /products/{id}/options
     * Body: { options: [ { name, values: [str, ...] }, ... ] }
     * Define las dimensiones y regenera las combinaciones (preservando precios
     * de las que se mantienen). Enviar options vacío quita las variantes.
     */
    public function setOptions(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $pid = (int) $req->param('id');
        if (!$this->ownsProduct($bid, $pid)) {
            Response::error('Producto no encontrado', 404);
        }

        $raw = $req->input('options', []);
        if (!is_array($raw)) {
            Response::error('Formato de opciones inválido', 422);
        }
        if (count($raw) > 3) {
            Response::error('Máximo 3 opciones por producto', 422);
        }

        $options = [];
        $combos  = 1;
        foreach ($raw as $opt) {
            $name   = trim((string) ($opt['name'] ?? ''));
            $values = is_array($opt['values'] ?? null) ? $opt['values'] : [];
            $clean  = [];
            foreach ($values as $v) {
                $v = trim((string) $v);
                if ($v !== '') {
                    $clean[] = $v;
                }
            }
            if ($name === '' || count($clean) === 0) {
                Response::error('Cada opción necesita un nombre y al menos un valor', 422);
            }
            $options[] = ['name' => $name, 'values' => $clean];
            $combos   *= count($clean);
        }
        if ($combos > 100) {
            Response::error('Demasiadas combinaciones (máximo 100)', 422);
        }

        $this->repo->setOptions($bid, $pid, $options);
        Response::ok($this->repo->forProduct($bid, $pid));
    }

    /**
     * PUT /products/{id}/variants
     * Body: { variants: [ { id, price, sku?, is_active?, sort_order? }, ... ] }
     * Actualiza precio/sku/estado de las combinaciones generadas.
     */
    public function updateVariants(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $pid = (int) $req->param('id');
        if (!$this->ownsProduct($bid, $pid)) {
            Response::error('Producto no encontrado', 404);
        }

        $raw = $req->input('variants', []);
        if (!is_array($raw)) {
            Response::error('Formato de variantes inválido', 422);
        }

        $variants = [];
        foreach ($raw as $v) {
            if (!isset($v['id']) || !is_numeric($v['id'])) {
                continue;
            }
            $price = $v['price'] ?? 0;
            if (!is_numeric($price) || (float) $price < 0) {
                Response::error('Precio de variante inválido', 422);
            }
            $sku = isset($v['sku']) ? trim((string) $v['sku']) : '';
            $variants[] = [
                'id'         => (int) $v['id'],
                'price'      => (float) $price,
                'sku'        => $sku !== '' ? $sku : null,
                'is_active'  => (int) (bool) ($v['is_active'] ?? true),
                'sort_order' => (int) ($v['sort_order'] ?? 0),
            ];
        }

        $this->repo->updateVariants($bid, $pid, $variants);
        Response::ok($this->repo->forProduct($bid, $pid));
    }

    private function ownsProduct(int $bid, int $pid): bool
    {
        $stmt = Database::pdo()->prepare(
            'SELECT 1 FROM products WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$pid, $bid]);
        return (bool) $stmt->fetch();
    }
}
