<?php
namespace Pizzalog\Controllers;

use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

/**
 * Gestión de cadetes / repartidores y liquidación de viajes y cobranzas.
 */
class DeliveryDriverController
{
    private const VEHICLE_TYPES = ['moto', 'bici', 'auto', 'otro'];

    /** GET /drivers?all=0|1 */
    public function index(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $all = !empty($req->query['all']);

        $sql = 'SELECT id, name, phone, vehicle_type, vehicle_plate, fee_per_trip, is_active, created_at
                  FROM delivery_drivers
                 WHERE business_id = ?';
        $params = [$bid];

        if (!$all) {
            $sql .= ' AND is_active = 1';
        }

        $sql .= ' ORDER BY name ASC';

        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);

        $drivers = array_map([$this, 'castDriver'], $stmt->fetchAll());
        Response::ok(['drivers' => $drivers]);
    }

    /** GET /drivers/{id} */
    public function show(Request $req): void
    {
        $bid    = (int) $req->auth['business_id'];
        $id     = (int) $req->param('id');
        $driver = $this->findOwned($bid, $id);

        Response::ok(['driver' => $this->castDriver($driver)]);
    }

    /**
     * POST /drivers
     * Body: { name, phone?, vehicle_type?, vehicle_plate?, fee_per_trip? }
     */
    public function store(Request $req): void
    {
        $bid  = (int) $req->auth['business_id'];
        $name = trim((string) $req->input('name', ''));

        if ($name === '') {
            Response::error('El nombre del cadete es requerido', 422);
        }

        $phone        = trim((string) $req->input('phone', '')) ?: null;
        $vehicleType  = (string) $req->input('vehicle_type', 'moto');
        if (!in_array($vehicleType, self::VEHICLE_TYPES, true)) {
            $vehicleType = 'moto';
        }
        $vehiclePlate = trim((string) $req->input('vehicle_plate', '')) ?: null;
        $feePerTrip   = max(0.0, (float) $req->input('fee_per_trip', 0));

        $pdo = Database::pdo();
        $stmt = $pdo->prepare(
            'INSERT INTO delivery_drivers (business_id, name, phone, vehicle_type, vehicle_plate, fee_per_trip, is_active)
             VALUES (?, ?, ?, ?, ?, ?, 1)'
        );
        $stmt->execute([$bid, $name, $phone, $vehicleType, $vehiclePlate, $feePerTrip]);
        $id = (int) $pdo->lastInsertId();

        Response::ok(['driver' => $this->castDriver($this->findOwned($bid, $id))], 201);
    }

    /**
     * PUT /drivers/{id}
     * Body: { name, phone?, vehicle_type?, vehicle_plate?, fee_per_trip?, is_active? }
     */
    public function update(Request $req): void
    {
        $bid    = (int) $req->auth['business_id'];
        $id     = (int) $req->param('id');
        $driver = $this->findOwned($bid, $id);

        $name = trim((string) $req->input('name', $driver['name']));
        if ($name === '') {
            Response::error('El nombre del cadete no puede quedar vacío', 422);
        }

        $phone        = $req->has('phone') ? (trim((string) $req->input('phone', '')) ?: null) : $driver['phone'];
        $vehicleType  = (string) $req->input('vehicle_type', $driver['vehicle_type']);
        if (!in_array($vehicleType, self::VEHICLE_TYPES, true)) {
            $vehicleType = $driver['vehicle_type'];
        }
        $vehiclePlate = $req->has('vehicle_plate') ? (trim((string) $req->input('vehicle_plate', '')) ?: null) : $driver['vehicle_plate'];
        $feePerTrip   = $req->has('fee_per_trip') ? max(0.0, (float) $req->input('fee_per_trip')) : (float) $driver['fee_per_trip'];
        $isActive     = $req->has('is_active') ? ((int) $req->input('is_active') === 1 ? 1 : 0) : (int) $driver['is_active'];

        $stmt = Database::pdo()->prepare(
            'UPDATE delivery_drivers
                SET name = ?, phone = ?, vehicle_type = ?, vehicle_plate = ?, fee_per_trip = ?, is_active = ?
              WHERE id = ? AND business_id = ?'
        );
        $stmt->execute([$name, $phone, $vehicleType, $vehiclePlate, $feePerTrip, $isActive, $id, $bid]);

        Response::ok(['driver' => $this->castDriver($this->findOwned($bid, $id))]);
    }

    /** DELETE /drivers/{id} (baja lógica) */
    public function destroy(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        $this->findOwned($bid, $id);

        Database::pdo()
            ->prepare('UPDATE delivery_drivers SET is_active = 0 WHERE id = ? AND business_id = ?')
            ->execute([$id, $bid]);

        Response::ok(['ok' => true]);
    }

    /**
     * GET /drivers/settlement?from=&to=&driver_id=
     * Liquidación de turnos para uno o todos los cadetes.
     */
    public function settlement(Request $req): void
    {
        $bid      = (int) $req->auth['business_id'];
        $from     = !empty($req->query['from']) ? (string) $req->query['from'] : date('Y-m-d');
        $to       = !empty($req->query['to']) ? (string) $req->query['to'] : date('Y-m-d');
        $driverId = !empty($req->query['driver_id']) ? (int) $req->query['driver_id'] : null;

        $fromDt = $from . ' 00:00:00';
        $toDt   = $to . ' 23:59:59';

        // 1. Obtener cadetes involucrados
        $driversQuery = 'SELECT id, name, phone, vehicle_type, vehicle_plate, fee_per_trip
                           FROM delivery_drivers
                          WHERE business_id = ?';
        $dParams = [$bid];
        if ($driverId !== null) {
            $driversQuery .= ' AND id = ?';
            $dParams[] = $driverId;
        } else {
            $driversQuery .= ' AND is_active = 1';
        }
        $driversQuery .= ' ORDER BY name ASC';

        $dStmt = Database::pdo()->prepare($driversQuery);
        $dStmt->execute($dParams);
        $driversList = $dStmt->fetchAll();

        // 2. Obtener pedidos entregados en el rango asignados a cadetes
        $ordersSql = 'SELECT o.id, o.order_number, o.channel, o.status, o.customer_name,
                             o.customer_phone, o.address, o.delivery_fee, o.total,
                             o.payment_method, o.delivery_driver_id, o.created_at
                        FROM orders o
                       WHERE o.business_id = ?
                         AND o.status = "delivered"
                         AND o.delivery_driver_id IS NOT NULL
                         AND o.created_at BETWEEN ? AND ?';
        $oParams = [$bid, $fromDt, $toDt];
        if ($driverId !== null) {
            $ordersSql .= ' AND o.delivery_driver_id = ?';
            $oParams[] = $driverId;
        }
        $ordersSql .= ' ORDER BY o.created_at ASC';

        $oStmt = Database::pdo()->prepare($ordersSql);
        $oStmt->execute($oParams);
        $orders = $oStmt->fetchAll();

        // Agrupar pedidos por cadete
        $ordersByDriver = [];
        foreach ($orders as $ord) {
            $did = (int) $ord['delivery_driver_id'];
            if (!isset($ordersByDriver[$did])) {
                $ordersByDriver[$did] = [];
            }
            $ordersByDriver[$did][] = [
                'id'             => (int) $ord['id'],
                'order_number'   => (int) $ord['order_number'],
                'customer_name'  => $ord['customer_name'],
                'customer_phone' => $ord['customer_phone'],
                'address'        => $ord['address'],
                'delivery_fee'   => (float) $ord['delivery_fee'],
                'total'          => (float) $ord['total'],
                'payment_method' => $ord['payment_method'],
                'created_at'     => $ord['created_at'],
                'status'         => $ord['status'],
            ];
        }

        $settlements = [];
        foreach ($driversList as $d) {
            $did         = (int) $d['id'];
            $driverOrders = $ordersByDriver[$did] ?? [];
            $feePerTrip  = (float) $d['fee_per_trip'];

            $cashOrdersCount    = 0;
            $cashCollected      = 0.0;
            $otherPaymentsCount = 0;
            $otherPaymentsTotal = 0.0;

            foreach ($driverOrders as $o) {
                if ($o['payment_method'] === 'cash') {
                    $cashOrdersCount++;
                    $cashCollected += $o['total'];
                } else {
                    $otherPaymentsCount++;
                    $otherPaymentsTotal += $o['total'];
                }
            }

            $totalOrders     = count($driverOrders);
            $totalEarnedFees = round($totalOrders * $feePerTrip, 2);
            $cashCollected   = round($cashCollected, 2);
            $netCashBalance  = round($cashCollected - $totalEarnedFees, 2);

            $settlements[] = [
                'driver_id'            => $did,
                'driver_name'          => $d['name'],
                'driver_phone'         => $d['phone'],
                'fee_per_trip'         => $feePerTrip,
                'total_orders'         => $totalOrders,
                'cash_orders_count'    => $cashOrdersCount,
                'cash_collected'       => $cashCollected,
                'other_payments_count' => $otherPaymentsCount,
                'other_payments_total' => round($otherPaymentsTotal, 2),
                'total_earned_fees'    => $totalEarnedFees,
                'net_cash_balance'     => $netCashBalance,
                'orders'               => $driverOrders,
            ];
        }

        Response::ok([
            'settlements' => $settlements,
            'period'      => ['from' => $from, 'to' => $to],
        ]);
    }

    private function findOwned(int $bid, int $id): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, name, phone, vehicle_type, vehicle_plate, fee_per_trip, is_active, created_at
               FROM delivery_drivers
              WHERE id = ? AND business_id = ? LIMIT 1'
        );
        $stmt->execute([$id, $bid]);
        $driver = $stmt->fetch();

        if (!$driver) {
            Response::error('Cadete no encontrado', 404);
        }
        return $driver;
    }

    private function castDriver(array $d): array
    {
        return [
            'id'            => (int) $d['id'],
            'name'          => $d['name'],
            'phone'         => $d['phone'],
            'vehicle_type'  => $d['vehicle_type'],
            'vehicle_plate' => $d['vehicle_plate'],
            'fee_per_trip'  => (float) $d['fee_per_trip'],
            'is_active'     => (int) $d['is_active'],
            'created_at'    => $d['created_at'] ?? null,
        ];
    }
}
