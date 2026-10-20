<?php
namespace Pizzalog\Controllers;

use PDO;
use Pizzalog\Core\Database;
use Pizzalog\Core\Request;
use Pizzalog\Core\Response;

/**
 * Sistema integral de Personal:
 *  - Personas (Empleados / Dueños), Tarifas por hora históricas y vigentes, Horarios regulares y Feriados
 *  - Registro de Horas (Atención, Producción, Feriado Trabajado 2x, Feriado No Trabajado, Licencia, Vacación)
 *  - Retiros a Cuenta de mercadería / adelantos (Pendientes e Imputados a liquidación)
 *  - Liquidaciones (Semanales, Mensuales, Aguinaldo SAC y Vacaciones)
 *  - Portal / Perfil Online individual por empleado (accesible por código único sin login de admin)
 */
class StaffController
{
    private static bool $ensured = false;

    public function __construct()
    {
        self::ensureSchema();
    }

    private static function ensureSchema(): void
    {
        if (self::$ensured) {
            return;
        }
        $pdo = Database::pdo();

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS staff_people (
                id INT AUTO_INCREMENT PRIMARY KEY,
                business_id INT NOT NULL,
                code VARCHAR(50) NOT NULL,
                name VARCHAR(100) NOT NULL,
                role VARCHAR(60) NOT NULL DEFAULT 'Empleado',
                settlement_type VARCHAR(30) NOT NULL DEFAULT 'Semanal',
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                notes VARCHAR(255) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_staff_business_code (business_id, code),
                KEY idx_staff_business (business_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS staff_rates (
                id INT AUTO_INCREMENT PRIMARY KEY,
                business_id INT NOT NULL,
                person_id INT NOT NULL,
                hourly_rate DECIMAL(12,2) NOT NULL,
                valid_from DATE NOT NULL,
                valid_to DATE NULL,
                reason VARCHAR(160) NULL,
                KEY idx_rates_person (business_id, person_id, valid_from)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS staff_schedules (
                id INT AUTO_INCREMENT PRIMARY KEY,
                business_id INT NOT NULL,
                person_id INT NOT NULL,
                day_of_week VARCHAR(20) NOT NULL,
                shift VARCHAR(20) NOT NULL,
                start_time VARCHAR(10) NOT NULL,
                end_time VARCHAR(10) NOT NULL,
                base_hours DECIMAL(6,2) NOT NULL,
                valid_from DATE NOT NULL,
                valid_to DATE NULL,
                KEY idx_sched_person (business_id, person_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS staff_holidays (
                id INT AUTO_INCREMENT PRIMARY KEY,
                business_id INT NOT NULL,
                holiday_date DATE NOT NULL,
                description VARCHAR(160) NOT NULL,
                local_status VARCHAR(40) NOT NULL DEFAULT 'Por definir',
                KEY idx_holidays_date (business_id, holiday_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS staff_hours (
                id INT AUTO_INCREMENT PRIMARY KEY,
                business_id INT NOT NULL,
                person_id INT NOT NULL,
                work_date DATE NOT NULL,
                hour_type VARCHAR(40) NOT NULL DEFAULT 'atencion',
                shift VARCHAR(30) NULL,
                start_time VARCHAR(10) NULL,
                end_time VARCHAR(10) NULL,
                raw_hours DECIMAL(6,2) NOT NULL DEFAULT 0,
                factor DECIMAL(4,2) NOT NULL DEFAULT 1.00,
                effective_hours DECIMAL(6,2) NOT NULL DEFAULT 0,
                tasks VARCHAR(255) NULL,
                settlement_id INT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_hours_person_date (business_id, person_id, work_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS staff_withdrawals (
                id INT AUTO_INCREMENT PRIMARY KEY,
                business_id INT NOT NULL,
                person_id INT NOT NULL,
                withdrawal_date DATE NOT NULL,
                concept VARCHAR(160) NOT NULL,
                quantity DECIMAL(10,3) NOT NULL DEFAULT 1,
                unit VARCHAR(20) NOT NULL DEFAULT 'unidad',
                unit_price DECIMAL(12,2) NULL,
                subtotal DECIMAL(12,2) NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
                settlement_id INT NULL,
                notes VARCHAR(255) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_withdrawals_person (business_id, person_id, status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS staff_settlements (
                id INT AUTO_INCREMENT PRIMARY KEY,
                business_id INT NOT NULL,
                person_id INT NOT NULL,
                period_start DATE NOT NULL,
                period_end DATE NOT NULL,
                settlement_type VARCHAR(30) NOT NULL DEFAULT 'Semanal',
                hs_atencion DECIMAL(8,2) NOT NULL DEFAULT 0,
                monto_atencion DECIMAL(12,2) NOT NULL DEFAULT 0,
                hs_produccion DECIMAL(8,2) NOT NULL DEFAULT 0,
                monto_produccion DECIMAL(12,2) NOT NULL DEFAULT 0,
                hs_fer_trab DECIMAL(8,2) NOT NULL DEFAULT 0,
                monto_fer_trab DECIMAL(12,2) NOT NULL DEFAULT 0,
                hs_fer_no_trab DECIMAL(8,2) NOT NULL DEFAULT 0,
                monto_fer_no_trab DECIMAL(12,2) NOT NULL DEFAULT 0,
                hs_licencia DECIMAL(8,2) NOT NULL DEFAULT 0,
                monto_licencia DECIMAL(12,2) NOT NULL DEFAULT 0,
                monto_aguinaldo DECIMAL(12,2) NOT NULL DEFAULT 0,
                subtotal_horas DECIMAL(12,2) NOT NULL DEFAULT 0,
                conceptos_adic DECIMAL(12,2) NOT NULL DEFAULT 0,
                total_bruto DECIMAL(12,2) NOT NULL DEFAULT 0,
                retiros_aplicados DECIMAL(12,2) NOT NULL DEFAULT 0,
                total_neto DECIMAL(12,2) NOT NULL DEFAULT 0,
                status VARCHAR(20) NOT NULL DEFAULT 'Borrador',
                payment_date DATE NULL,
                notes VARCHAR(255) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_settlements_person (business_id, person_id, period_end)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");

        self::$ensured = true;
    }

    /**
     * Precarga los datos reales de Arrabbiata desde los Excels si el negocio aún no tiene personal cargado.
     */
    private function ensureSeeded(int $bid): void
    {
        $pdo = Database::pdo();
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM staff_people WHERE business_id = ?');
        $stmt->execute([$bid]);
        if ((int) $stmt->fetchColumn() > 0) {
            return;
        }

        $pdo->beginTransaction();
        try {
            // 1. Personas (IDs mapeados)
            $peopleData = [
                [1, 'ivan',    'Iván',    'Empleado', 'Semanal', 1, null],
                [2, 'lulu',    'Lulú',    'Empleada', 'Semanal', 1, 'Control de arqueos de caja (concepto adicional)'],
                [3, 'bruno',   'Bruno',   'Empleado', 'Semanal', 1, 'Solo atención'],
                [4, 'eze',     'Eze',     'Dueño',    'Mensual', 1, null],
                [5, 'tavo',    'Tavo',    'Dueño',    'Mensual', 1, null],
                [6, 'lea',     'Lea',     'Dueño',    'Mensual', 0, 'Histórico 2024'],
                [7, 'juliana', 'Juliana', 'Empleado', 'Semanal', 0, 'Histórico 2024-2025'],
                [8, 'gon',     'Gon',     'Empleado', 'Semanal', 0, 'Histórico 2024-2025'],
                [9, 'noe',     'Noe',     'Empleado', 'Semanal', 0, 'Histórico 2025'],
                [10, 'vero',   'Vero',    'Empleada', 'Semanal', 0, 'Histórico 2024'],
                [11, 'nacho',  'Nacho',   'Empleado', 'Semanal', 0, 'Histórico 2025'],
                [12, 'agus',   'Agus',    'Empleado', 'Semanal', 1, 'Alta ago 2026'],
            ];

            $insPerson = $pdo->prepare(
                'INSERT INTO staff_people (business_id, code, name, role, settlement_type, is_active, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            $idMap = [];
            foreach ($peopleData as [$excelId, $code, $name, $role, $type, $active, $notes]) {
                $insPerson->execute([$bid, $code, $name, $role, $type, $active, $notes]);
                $idMap[$excelId] = (int) $pdo->lastInsertId();
            }

            // 2. Tarifas históricas y vigentes
            $ratesData = [
                [1, 5500, '2026-03-02', '2026-05-31', 'Valor hora feb–may 2026'],
                [1, 6000, '2026-06-01', '2026-08-30', 'Actualización jun 2026'],
                [1, 7500, '2026-08-31', null,         'Actualización sep 2026'],

                [2, 5500, '2026-03-02', '2026-05-03', 'Valor hora mar–abr 2026'],
                [2, 7000, '2026-05-04', '2026-05-31', 'Actualización may 2026'],
                [2, 7500, '2026-06-01', '2026-08-30', 'Actualización jun 2026'],
                [2, 9000, '2026-08-31', null,         'Actualización sep 2026'],

                [3, 5000, '2026-03-02', '2026-05-31', 'Valor hora mar–may 2026'],
                [3, 5500, '2026-06-01', '2026-08-30', 'Actualización jun 2026'],
                [3, 6000, '2026-08-31', null,         'Actualización sep 2026'],

                [4, 7000, '2026-03-01', '2026-05-31', 'Valor hora mar–may 2026'],
                [4, 7500, '2026-06-01', '2026-08-30', 'Actualización jun 2026'],
                [4, 9000, '2026-08-31', null,         'Actualización sep 2026'],

                [5, 7000, '2026-03-01', '2026-05-31', 'Valor hora mar–may 2026'],
                [5, 7500, '2026-06-01', '2026-08-30', 'Actualización jun 2026'],
                [5, 9000, '2026-08-31', null,         'Actualización sep 2026'],

                [6, 3600, '2024-07-01', null, 'Histórico'],
                [7, 5000, '2025-05-01', null, 'Histórico'],
                [8, 5000, '2025-05-01', null, 'Histórico'],
                [9, 4500, '2025-05-01', null, 'Histórico'],
                [10, 3200, '2024-07-01', null, 'Histórico'],
                [11, 5500, '2025-11-01', null, 'Histórico'],

                [12, 5500, '2026-08-24', '2026-08-30', 'Ingreso ago 2026'],
                [12, 6000, '2026-08-31', null,         'Actualización sep 2026'],
            ];
            $insRate = $pdo->prepare(
                'INSERT INTO staff_rates (business_id, person_id, hourly_rate, valid_from, valid_to, reason)
                 VALUES (?, ?, ?, ?, ?, ?)'
            );
            foreach ($ratesData as [$exId, $rate, $from, $to, $reason]) {
                $insRate->execute([$bid, $idMap[$exId], $rate, $from, $to, $reason]);
            }

            // 3. Horarios regulares vigentes
            $schedData = [
                [1, 'Martes',    'Mañana', '11:30', '15:30', 4.0, '2026-05-01', null],
                [1, 'Miércoles', 'Mañana', '11:30', '15:30', 4.0, '2026-05-01', null],
                [1, 'Jueves',    'Mañana', '11:30', '15:30', 4.0, '2026-05-01', null],
                [1, 'Viernes',   'Mañana', '11:30', '15:30', 4.0, '2026-05-01', null],
                [1, 'Jueves',    'Noche',  '19:00', '01:00', 6.0, '2026-05-01', null],
                [1, 'Viernes',   'Noche',  '19:00', '01:00', 6.0, '2026-05-01', null],
                [1, 'Domingo',   'Noche',  '19:00', '01:00', 6.0, '2026-05-01', null],

                [2, 'Martes',    'Mañana', '11:30', '15:30', 4.0, '2024-01-01', null],
                [2, 'Miércoles', 'Mañana', '11:30', '15:30', 4.0, '2024-01-01', null],
                [2, 'Jueves',    'Mañana', '11:30', '15:30', 4.0, '2024-01-01', null],
                [2, 'Viernes',   'Mañana', '11:30', '15:30', 4.0, '2024-01-01', null],

                [3, 'Sábado',    'Noche',  '19:00', '01:00', 6.0, '2026-05-01', null],
                [3, 'Domingo',   'Noche',  '19:00', '01:00', 6.0, '2026-05-01', null],

                [4, 'Jueves',    'Noche',  '19:00', '01:00', 6.0, '2024-01-01', null],
                [4, 'Viernes',   'Noche',  '19:00', '01:00', 6.0, '2024-01-01', null],
                [4, 'Sábado',    'Noche',  '19:00', '01:00', 6.0, '2024-01-01', null],

                [5, 'Jueves',    'Noche',  '19:00', '01:00', 6.0, '2024-01-01', null],
                [5, 'Viernes',   'Noche',  '19:00', '01:00', 6.0, '2024-01-01', null],
                [5, 'Sábado',    'Noche',  '19:00', '01:00', 6.0, '2024-01-01', null],
                [5, 'Domingo',   'Noche',  '19:00', '01:00', 6.0, '2024-01-01', null],
            ];
            $insSched = $pdo->prepare(
                'INSERT INTO staff_schedules (business_id, person_id, day_of_week, shift, start_time, end_time, base_hours, valid_from, valid_to)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            foreach ($schedData as [$exId, $dow, $shift, $st, $et, $bh, $vf, $vt]) {
                $insSched->execute([$bid, $idMap[$exId], $dow, $shift, $st, $et, $bh, $vf, $vt]);
            }

            // 4. Feriados 2026
            $holidays = [
                ['2026-01-01', 'Año Nuevo', 'Por definir'],
                ['2026-02-16', 'Carnaval', 'Por definir'],
                ['2026-02-17', 'Carnaval', 'Por definir'],
                ['2026-03-24', 'Día de la Memoria', 'Por definir'],
                ['2026-04-02', 'Malvinas', 'Por definir'],
                ['2026-04-03', 'Viernes Santo', 'Por definir'],
                ['2026-05-01', 'Día del Trabajador', 'Por definir'],
                ['2026-05-25', 'Revolución de Mayo', 'Por definir'],
                ['2026-06-15', 'Güemes (trasladado)', 'Por definir'],
                ['2026-06-20', 'Paso a la Inmortalidad de Belgrano', 'Por definir'],
                ['2026-07-09', 'Día de la Independencia', 'Por definir'],
                ['2026-08-17', 'San Martín', 'Por definir'],
                ['2026-10-12', 'Diversidad Cultural', 'Abierto'],
                ['2026-11-23', 'Soberanía Nacional', 'Por definir'],
                ['2026-12-08', 'Inmaculada Concepción', 'Por definir'],
                ['2026-12-25', 'Navidad', 'Cerrado'],
            ];
            $insHol = $pdo->prepare(
                'INSERT INTO staff_holidays (business_id, holiday_date, description, local_status)
                 VALUES (?, ?, ?, ?)'
            );
            foreach ($holidays as [$hDate, $hDesc, $hStatus]) {
                $insHol->execute([$bid, $hDate, $hDesc, $hStatus]);
            }

            // 5. Liquidaciones recientes (Septiembre–Octubre 2026 + Aguinaldo)
            // Estructura: [excelPersonId, start, end, type, hsAt, mAt, hsPr, mPr, hsFT, mFT, hsFNT, mFNT, hsLic, mLic, mSac, subH, adic, bruto, retiros, neto, status, payDate, notes]
            $settlementsData = [
                // Iván
                [1, '2026-09-14', '2026-09-20', 'Semanal', 22, 165000, 3.0,  22500,  0, 0,     0, 0,     0, 0, 0, 187500, 0,     187500, 6200,  181300, 'Pagado', '2026-09-21', 'Importado del histórico'],
                [1, '2026-09-21', '2026-09-27', 'Semanal', 34, 255000, 3.0,  22500,  0, 0,     0, 0,     0, 0, 0, 277500, 0,     277500, 0,     277500, 'Pagado', '2026-09-28', 'Importado del histórico'],
                [1, '2026-09-28', '2026-10-04', 'Semanal', 28, 210000, 3.0,  22500,  0, 0,     0, 0,     0, 0, 0, 232500, 0,     232500, 22485, 210015, 'Pagado', '2026-10-05', 'Importado del histórico'],
                [1, '2026-10-05', '2026-10-11', 'Semanal', 24, 180000, 3.25, 24375,  0, 0,     4, 30000, 0, 0, 0, 234375, 0,     234375, 0,     234375, 'Pagado', '2026-10-12', 'Importado del histórico'],
                [1, '2026-10-12', '2026-10-18', 'Semanal', 28, 210000, 1.75, 13125,  0, 0,     0, 0,     0, 0, 0, 223125, 0,     223125, 0,     223125, 'Pagado', '2026-10-19', 'Importado del histórico'],

                // Lulú
                [2, '2026-09-14', '2026-09-20', 'Semanal', 16, 144000, 11.75, 105750, 0, 0,    0, 0,     0, 0, 0, 249750, 18000, 267750, 0,     267750, 'Pagado', '2026-09-21', 'Incluye control de arqueos'],
                [2, '2026-09-21', '2026-09-27', 'Semanal', 16, 144000, 14.50, 130500, 0, 0,    0, 0,     0, 0, 0, 274500, 18000, 292500, 0,     292500, 'Pagado', '2026-09-28', 'Incluye control de arqueos'],
                [2, '2026-09-28', '2026-10-04', 'Semanal', 16, 144000, 13.75, 123750, 0, 0,    0, 0,     0, 0, 0, 267750, 18000, 285750, 0,     285750, 'Pagado', '2026-10-05', 'Incluye control de arqueos'],
                [2, '2026-10-05', '2026-10-11', 'Semanal', 12, 108000, 13.75, 123750, 0, 0,    4, 36000, 0, 0, 0, 267750, 18000, 285750, 4800,  280950, 'Pagado', '2026-10-12', 'Incluye control de arqueos'],
                [2, '2026-10-12', '2026-10-18', 'Semanal', 16, 144000, 14.75, 132750, 0, 0,    0, 0,     0, 0, 0, 276750, 15000, 291750, 0,     291750, 'Pagado', '2026-10-19', 'Incluye control de arqueos'],

                // Bruno
                [3, '2026-09-14', '2026-09-20', 'Semanal', 12, 72000,  0, 0, 0, 0, 0, 0, 0, 0, 0, 72000, 0, 72000, 0,     72000, 'Pagado', '2026-09-21', 'Importado del histórico'],
                [3, '2026-09-21', '2026-09-27', 'Semanal', 6,  36000,  0, 0, 0, 0, 0, 0, 0, 0, 0, 36000, 0, 36000, 0,     36000, 'Pagado', '2026-09-28', 'Importado del histórico'],
                [3, '2026-09-28', '2026-10-04', 'Semanal', 12, 72000,  0, 0, 0, 0, 0, 0, 0, 0, 0, 72000, 0, 72000, 15994, 56006, 'Pagado', '2026-10-05', 'Importado del histórico'],
                [3, '2026-10-05', '2026-10-11', 'Semanal', 12, 72000,  0, 0, 0, 0, 0, 0, 0, 0, 0, 72000, 0, 72000, 0,     72000, 'Pagado', '2026-10-12', 'Importado del histórico'],
                [3, '2026-10-12', '2026-10-18', 'Semanal', 12, 72000,  0, 0, 0, 0, 0, 0, 0, 0, 0, 72000, 0, 72000, 0,     72000, 'Pagado', '2026-10-19', 'Importado del histórico'],

                // Agus
                [12, '2026-09-28', '2026-10-04', 'Semanal', 12, 72000,  0, 0, 0, 0, 0, 0, 0, 0, 0, 72000,  0, 72000,  0, 72000,  'Pagado', '2026-10-05', 'Importado del histórico'],
                [12, '2026-10-05', '2026-10-11', 'Semanal', 18, 108000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 108000, 0, 108000, 0, 108000, 'Pagado', '2026-10-12', 'Importado del histórico'],
                [12, '2026-10-12', '2026-10-18', 'Semanal', 18, 108000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 108000, 0, 108000, 0, 108000, 'Pagado', '2026-10-19', 'Importado del histórico'],

                // Eze y Tavo (Mensual Septiembre 2026)
                [4, '2026-09-01', '2026-09-30', 'Mensual', 72.5, 652500, 29.0, 261000, 0, 0, 0, 0, 0, 0, 0, 913500, 0, 913500, 3816,  909684, 'Pagado', '2026-10-01', 'Liquidación Mensual Sep 2026'],
                [5, '2026-09-01', '2026-09-30', 'Mensual', 79.0, 711000, 26.5, 238500, 0, 0, 0, 0, 0, 0, 0, 949500, 0, 949500, 62260, 887240, 'Pagado', '2026-10-01', 'Liquidación Mensual Sep 2026'],
            ];

            $insSett = $pdo->prepare(
                'INSERT INTO staff_settlements
                    (business_id, person_id, period_start, period_end, settlement_type,
                     hs_atencion, monto_atencion, hs_produccion, monto_produccion,
                     hs_fer_trab, monto_fer_trab, hs_fer_no_trab, monto_fer_no_trab,
                     hs_licencia, monto_licencia, monto_aguinaldo, subtotal_horas,
                     conceptos_adic, total_bruto, retiros_aplicados, total_neto,
                     status, payment_date, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            foreach ($settlementsData as $s) {
                $insSett->execute([
                    $bid, $idMap[$s[0]], $s[1], $s[2], $s[3],
                    $s[4], $s[5], $s[6], $s[7],
                    $s[8], $s[9], $s[10], $s[11],
                    $s[12], $s[13], $s[14], $s[15],
                    $s[16], $s[17], $s[18], $s[19],
                    $s[20], $s[21], $s[22],
                ]);
            }

            // 6. Retiros a cuenta (incluyendo los 3 Pendientes actuales de Iván e históricos imputados)
            $withdrawalsData = [
                // Pendientes de Iván (Total $18.325)
                [1, '2026-10-18', 'Reggianito', 0.4,  'kg',     16500, 6600,  'Pendiente', 'Cargado en hoja Retiros'],
                [1, '2026-10-11', 'Reggianito', 0.4,  'kg',     16500, 6600,  'Pendiente', 'Cargado en hoja Retiros'],
                [1, '2026-10-03', 'Muzza',      0.5,  'kg',     10250, 5125,  'Pendiente', 'Cargado en hoja Retiros'],

                // Imputados recientes
                [1, '2026-09-25', 'Harina 5kg + Muzza + Roquefort + Reggianito', 1, 'unidad', 22485, 22485, 'Imputado', 'Descontado en liq 28/09–04/10'],
                [1, '2026-09-14', 'Reggianito', 0.4,  'kg',     15500, 6200,  'Imputado', 'Descontado en liq 14/09–20/09'],
                [2, '2026-10-08', 'Muzza',      0.5,  'kg',     9600,  4800,  'Imputado', 'Descontado en liq 05/10–11/10'],
                [3, '2026-10-02', 'Provoleta + Muzza + Bondiola', 1, 'unidad', 15994, 15994, 'Imputado', 'Descontado en liq 28/09–04/10'],
                [4, '2026-09-10', 'mortadela (gr)', 180, 'g',   21.2,  3816,  'Imputado', 'Descontado en liq Sep 2026'],
                [5, '2026-09-29', 'Queso / Mercadería Sep', 1, 'unidad', 62260, 62260, 'Imputado', 'Descontado en liq Sep 2026'],
            ];
            $insWith = $pdo->prepare(
                'INSERT INTO staff_withdrawals
                    (business_id, person_id, withdrawal_date, concept, quantity, unit, unit_price, subtotal, status, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            foreach ($withdrawalsData as [$exId, $wDate, $concept, $qty, $unit, $up, $sub, $st, $notes]) {
                $insWith->execute([$bid, $idMap[$exId], $wDate, $concept, $qty, $unit, $up, $sub, $st, $notes]);
            }

            // 7. Horas recientes (Semana 12/10 al 18/10 y semana actual)
            $hoursData = [
                // Iván (12/10 al 18/10: 28h atención + 1.75h producción = 29.75h)
                [1, '2026-10-13', 'atencion',   'Mañana',     '11:30', '15:30', 4.0,  1.0, 4.0,  'Turno mañana martes'],
                [1, '2026-10-13', 'produccion', 'Producción', '15:30', '16:15', 0.75, 1.0, 0.75, 'Rallar muzza y preparar línea'],
                [1, '2026-10-14', 'atencion',   'Mañana',     '11:30', '15:30', 4.0,  1.0, 4.0,  'Turno mañana miércoles'],
                [1, '2026-10-15', 'atencion',   'Mañana',     '11:30', '15:30', 4.0,  1.0, 4.0,  'Turno mañana jueves'],
                [1, '2026-10-15', 'atencion',   'Noche',      '19:00', '01:00', 6.0,  1.0, 6.0,  'Turno noche jueves'],
                [1, '2026-10-16', 'atencion',   'Mañana',     '11:30', '15:30', 4.0,  1.0, 4.0,  'Turno mañana viernes'],
                [1, '2026-10-16', 'produccion', 'Producción', '15:30', '16:30', 1.0,  1.0, 1.0,  'Cortar fiambres y cebolla'],
                [1, '2026-10-18', 'atencion',   'Noche',      '19:00', '01:00', 6.0,  1.0, 6.0,  'Turno noche domingo'],

                // Lulú (12/10 al 18/10: 16h atención + 14.75h producción = 30.75h)
                [2, '2026-10-13', 'atencion',   'Mañana',     '11:30', '15:30', 4.0,  1.0, 4.0,  'Turno mañana martes'],
                [2, '2026-10-13', 'produccion', 'Producción', '08:00', '11:30', 3.5,  1.0, 3.5,  'Amasado, bollado y salsa'],
                [2, '2026-10-14', 'atencion',   'Mañana',     '11:30', '15:30', 4.0,  1.0, 4.0,  'Turno mañana miércoles'],
                [2, '2026-10-14', 'produccion', 'Producción', '08:00', '11:30', 3.5,  1.0, 3.5,  'Producción masas y fainá'],
                [2, '2026-10-15', 'atencion',   'Mañana',     '11:30', '15:30', 4.0,  1.0, 4.0,  'Turno mañana jueves'],
                [2, '2026-10-15', 'produccion', 'Producción', '07:45', '11:30', 3.75, 1.0, 3.75, 'Biga, bollado y prep general'],
                [2, '2026-10-16', 'atencion',   'Mañana',     '11:30', '15:30', 4.0,  1.0, 4.0,  'Turno mañana viernes'],
                [2, '2026-10-16', 'produccion', 'Producción', '07:30', '11:30', 4.0,  1.0, 4.0,  'Producción fin de semana'],

                // Bruno (12/10 al 18/10: 12h atención)
                [3, '2026-10-17', 'atencion',   'Noche',      '19:00', '01:00', 6.0,  1.0, 6.0,  'Turno noche sábado'],
                [3, '2026-10-18', 'atencion',   'Noche',      '19:00', '01:00', 6.0,  1.0, 6.0,  'Turno noche domingo'],

                // Agus (12/10 al 18/10: 18h atención)
                [12, '2026-10-16', 'atencion',  'Noche',      '19:00', '01:00', 6.0,  1.0, 6.0,  'Turno noche viernes'],
                [12, '2026-10-17', 'atencion',  'Noche',      '19:00', '01:00', 6.0,  1.0, 6.0,  'Turno noche sábado'],
                [12, '2026-10-18', 'atencion',  'Noche',      '19:00', '01:00', 6.0,  1.0, 6.0,  'Turno noche domingo'],
            ];
            $insHour = $pdo->prepare(
                'INSERT INTO staff_hours
                    (business_id, person_id, work_date, hour_type, shift, start_time, end_time, raw_hours, factor, effective_hours, tasks)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            foreach ($hoursData as [$exId, $wDate, $hType, $shift, $st, $et, $rawH, $fac, $effH, $tasks]) {
                $insHour->execute([$bid, $idMap[$exId], $wDate, $hType, $shift, $st, $et, $rawH, $fac, $effH, $tasks]);
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
        }
    }

    /** Devuelve el rango Lunes..Domingo de la semana actual. */
    private function currentWeekRange(): array
    {
        $today = new \DateTimeImmutable('today');
        $dow = (int) $today->format('N'); // 1 (Lun) .. 7 (Dom)
        $monday = $today->modify('-' . ($dow - 1) . ' days');
        $sunday = $monday->modify('+6 days');
        return [$monday->format('Y-m-d'), $sunday->format('Y-m-d')];
    }

    /** Obtiene la tarifa por hora vigente de una persona para una fecha dada. */
    private function rateForDate(int $bid, int $personId, string $date): float
    {
        $pdo = Database::pdo();
        $stmt = $pdo->prepare(
            'SELECT hourly_rate FROM staff_rates
              WHERE business_id = ? AND person_id = ?
                AND valid_from <= ?
                AND (valid_to IS NULL OR valid_to >= ?)
              ORDER BY valid_from DESC, id DESC
              LIMIT 1'
        );
        $stmt->execute([$bid, $personId, $date, $date]);
        $r = $stmt->fetchColumn();
        if ($r !== false) {
            return (float) $r;
        }
        // Fallback a la última tarifa cargada
        $stmt2 = $pdo->prepare(
            'SELECT hourly_rate FROM staff_rates
              WHERE business_id = ? AND person_id = ?
              ORDER BY valid_from DESC, id DESC
              LIMIT 1'
        );
        $stmt2->execute([$bid, $personId]);
        $r2 = $stmt2->fetchColumn();
        return $r2 !== false ? (float) $r2 : 0.0;
    }

    /** Factor multiplicador según el tipo de hora del Excel. */
    public static function factorForType(string $hourType): float
    {
        return match ($hourType) {
            'feriado_trabajado' => 2.0,
            'intercambio_dia'   => 0.0,
            default             => 1.0,
        };
    }

    /**
     * GET /staff/overview
     * Devuelve el resumen general del personal, tarifas, horarios, feriados e insumos para retiros.
     */
    public function overview(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $this->ensureSeeded($bid);
        $pdo = Database::pdo();

        [$weekStart, $weekEnd] = $this->currentWeekRange();
        $today = date('Y-m-d');

        $stmt = $pdo->prepare('SELECT * FROM staff_people WHERE business_id = ? ORDER BY is_active DESC, id ASC');
        $stmt->execute([$bid]);
        $peopleRows = $stmt->fetchAll();

        $people = [];
        foreach ($peopleRows as $p) {
            $pid = (int) $p['id'];
            $currentRate = $this->rateForDate($bid, $pid, $today);

            // Horas efectivas en la semana en curso
            $hStmt = $pdo->prepare(
                'SELECT COALESCE(SUM(effective_hours), 0)
                   FROM staff_hours
                  WHERE business_id = ? AND person_id = ? AND work_date BETWEEN ? AND ?'
            );
            $hStmt->execute([$bid, $pid, $weekStart, $weekEnd]);
            $weekHours = (float) $hStmt->fetchColumn();

            // Retiros pendientes
            $wStmt = $pdo->prepare(
                "SELECT COUNT(*) AS cnt, COALESCE(SUM(COALESCE(subtotal, 0)), 0) AS total
                   FROM staff_withdrawals
                  WHERE business_id = ? AND person_id = ? AND status = 'Pendiente'"
            );
            $wStmt->execute([$bid, $pid]);
            $wRow = $wStmt->fetch();

            // Última liquidación
            $sStmt = $pdo->prepare(
                'SELECT * FROM staff_settlements
                  WHERE business_id = ? AND person_id = ?
                  ORDER BY period_end DESC, id DESC
                  LIMIT 1'
            );
            $sStmt->execute([$bid, $pid]);
            $lastSett = $sStmt->fetch() ?: null;

            $people[] = [
                'id'                      => $pid,
                'code'                    => $p['code'],
                'name'                    => $p['name'],
                'role'                    => $p['role'],
                'settlement_type'         => $p['settlement_type'],
                'is_active'               => (int) $p['is_active'],
                'notes'                   => $p['notes'],
                'current_rate'            => $currentRate,
                'week_start'              => $weekStart,
                'week_end'                => $weekEnd,
                'week_effective_hours'    => $weekHours,
                'pending_withdrawals_cnt' => (int) ($wRow['cnt'] ?? 0),
                'pending_withdrawals_sum' => (float) ($wRow['total'] ?? 0),
                'last_settlement'         => $lastSett ? $this->castSettlement($lastSett, $p['name']) : null,
            ];
        }

        // Tarifas históricas y vigentes
        $rStmt = $pdo->prepare(
            'SELECT r.*, p.name AS person_name
               FROM staff_rates r
               JOIN staff_people p ON p.id = r.person_id
              WHERE r.business_id = ?
              ORDER BY r.person_id ASC, r.valid_from DESC'
        );
        $rStmt->execute([$bid]);
        $rates = array_map(static fn(array $r): array => [
            'id'          => (int) $r['id'],
            'person_id'   => (int) $r['person_id'],
            'person_name' => $r['person_name'],
            'hourly_rate' => (float) $r['hourly_rate'],
            'valid_from'  => $r['valid_from'],
            'valid_to'    => $r['valid_to'],
            'reason'      => $r['reason'],
        ], $rStmt->fetchAll());

        // Horarios regulares
        $schStmt = $pdo->prepare(
            'SELECT s.*, p.name AS person_name
               FROM staff_schedules s
               JOIN staff_people p ON p.id = s.person_id
              WHERE s.business_id = ?
              ORDER BY s.person_id ASC, s.id ASC'
        );
        $schStmt->execute([$bid]);
        $schedules = array_map(static fn(array $s): array => [
            'id'          => (int) $s['id'],
            'person_id'   => (int) $s['person_id'],
            'person_name' => $s['person_name'],
            'day_of_week' => $s['day_of_week'],
            'shift'       => $s['shift'],
            'start_time'  => $s['start_time'],
            'end_time'    => $s['end_time'],
            'base_hours'  => (float) $s['base_hours'],
            'valid_from'  => $s['valid_from'],
            'valid_to'    => $s['valid_to'],
        ], $schStmt->fetchAll());

        // Feriados
        $holStmt = $pdo->prepare('SELECT * FROM staff_holidays WHERE business_id = ? ORDER BY holiday_date ASC');
        $holStmt->execute([$bid]);
        $holidays = array_map(static fn(array $h): array => [
            'id'           => (int) $h['id'],
            'holiday_date' => $h['holiday_date'],
            'description'  => $h['description'],
            'local_status' => $h['local_status'],
        ], $holStmt->fetchAll());

        // Insumos y productos para sugerir precios en Retiros a Cuenta
        $supStmt = $pdo->prepare('SELECT id, name, unit, cost FROM supplies WHERE business_id = ? AND is_active = 1 ORDER BY name ASC');
        $supStmt->execute([$bid]);
        $supplies = array_map(static fn(array $s): array => [
            'id'   => (int) $s['id'],
            'name' => $s['name'],
            'unit' => $s['unit'] ?: 'unidad',
            'cost' => (float) ($s['cost'] ?? 0),
        ], $supStmt->fetchAll());

        Response::ok([
            'week_start' => $weekStart,
            'week_end'   => $weekEnd,
            'people'     => $people,
            'rates'      => $rates,
            'schedules'  => $schedules,
            'holidays'   => $holidays,
            'supplies'   => $supplies,
        ]);
    }

    /** POST /staff/people */
    public function storePerson(Request $req): void
    {
        $bid  = (int) $req->auth['business_id'];
        $name = trim((string) $req->input('name', ''));
        if ($name === '') {
            Response::error('El nombre es obligatorio', 422);
        }
        $role = trim((string) $req->input('role', 'Empleado')) ?: 'Empleado';
        $type = in_array($req->input('settlement_type'), ['Semanal', 'Mensual'], true)
            ? (string) $req->input('settlement_type')
            : 'Semanal';
        $rate  = (float) $req->input('hourly_rate', 0);
        $notes = trim((string) $req->input('notes', '')) ?: null;

        $baseCode = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '', iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name) ?: $name));
        if ($baseCode === '') {
            $baseCode = 'emp' . rand(100, 999);
        }
        $code = $baseCode;
        $pdo  = Database::pdo();
        $chk  = $pdo->prepare('SELECT COUNT(*) FROM staff_people WHERE business_id = ? AND code = ?');
        $i    = 2;
        while (true) {
            $chk->execute([$bid, $code]);
            if ((int) $chk->fetchColumn() === 0) break;
            $code = $baseCode . $i;
            $i++;
        }

        $pdo->prepare(
            'INSERT INTO staff_people (business_id, code, name, role, settlement_type, is_active, notes)
             VALUES (?, ?, ?, ?, ?, 1, ?)'
        )->execute([$bid, $code, $name, $role, $type, $notes]);
        $personId = (int) $pdo->lastInsertId();

        if ($rate > 0) {
            $pdo->prepare(
                'INSERT INTO staff_rates (business_id, person_id, hourly_rate, valid_from, valid_to, reason)
                 VALUES (?, ?, ?, ?, NULL, ?)'
            )->execute([$bid, $personId, $rate, date('Y-m-d'), 'Tarifa inicial']);
        }

        Response::ok(['id' => $personId, 'code' => $code], 201);
    }

    /** PUT /staff/people/{id} */
    public function updatePerson(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        $pdo = Database::pdo();

        $name   = trim((string) $req->input('name', ''));
        $role   = trim((string) $req->input('role', 'Empleado'));
        $type   = in_array($req->input('settlement_type'), ['Semanal', 'Mensual'], true)
            ? (string) $req->input('settlement_type')
            : 'Semanal';
        $active = (int) (bool) $req->input('is_active', true);
        $notes  = trim((string) $req->input('notes', '')) ?: null;

        if ($name === '') {
            Response::error('El nombre es obligatorio', 422);
        }

        $pdo->prepare(
            'UPDATE staff_people
                SET name = ?, role = ?, settlement_type = ?, is_active = ?, notes = ?
              WHERE id = ? AND business_id = ?'
        )->execute([$name, $role, $type, $active, $notes, $id, $bid]);

        $newRate = $req->input('hourly_rate');
        if ($newRate !== null && is_numeric($newRate) && (float) $newRate > 0) {
            $rateVal   = (float) $newRate;
            $validFrom = trim((string) $req->input('rate_valid_from', date('Y-m-d'))) ?: date('Y-m-d');
            $curRate   = $this->rateForDate($bid, $id, $validFrom);
            if (abs($curRate - $rateVal) > 0.01) {
                $prevDay = date('Y-m-d', strtotime($validFrom . ' -1 day'));
                $pdo->prepare(
                    'UPDATE staff_rates SET valid_to = ?
                      WHERE business_id = ? AND person_id = ? AND valid_to IS NULL AND valid_from < ?'
                )->execute([$prevDay, $bid, $id, $validFrom]);

                $pdo->prepare(
                    'INSERT INTO staff_rates (business_id, person_id, hourly_rate, valid_from, valid_to, reason)
                     VALUES (?, ?, ?, ?, NULL, ?)'
                )->execute([$bid, $id, $rateVal, $validFrom, 'Actualización de tarifa']);
            }
        }

        Response::ok(['updated' => true]);
    }

    /** GET /staff/hours */
    public function listHours(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $this->ensureSeeded($bid);
        $pdo = Database::pdo();

        $personId = isset($req->query['person_id']) && $req->query['person_id'] !== '' ? (int) $req->query['person_id'] : null;
        $from     = $req->query['from'] ?? null;
        $to       = $req->query['to'] ?? null;

        $sql = 'SELECT h.*, p.name AS person_name
                  FROM staff_hours h
                  JOIN staff_people p ON p.id = h.person_id
                 WHERE h.business_id = ?';
        $params = [$bid];

        if ($personId !== null) {
            $sql .= ' AND h.person_id = ?';
            $params[] = $personId;
        }
        if ($from) {
            $sql .= ' AND h.work_date >= ?';
            $params[] = $from;
        }
        if ($to) {
            $sql .= ' AND h.work_date <= ?';
            $params[] = $to;
        }
        $sql .= ' ORDER BY h.work_date DESC, h.id DESC LIMIT 400';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        $hours = array_map(fn(array $r): array => $this->castHour($r), $stmt->fetchAll());
        Response::ok(['hours' => $hours]);
    }

    /** POST /staff/hours */
    public function storeHour(Request $req): void
    {
        $bid      = (int) $req->auth['business_id'];
        $personId = (int) $req->input('person_id', 0);
        $workDate = trim((string) $req->input('work_date', date('Y-m-d')));
        $hourType = trim((string) $req->input('hour_type', 'atencion'));
        $shift    = trim((string) $req->input('shift', '')) ?: null;
        $start    = trim((string) $req->input('start_time', '')) ?: null;
        $end      = trim((string) $req->input('end_time', '')) ?: null;
        $rawHours = (float) $req->input('raw_hours', 0);
        $extraMin = (float) $req->input('extra_minutes', 0);
        $tasks    = trim((string) $req->input('tasks', '')) ?: null;

        if ($personId <= 0) {
            Response::error('Seleccioná una persona', 422);
        }
        if ($rawHours <= 0 && $start && $end) {
            $rawHours = $this->calcHoursBetween($start, $end);
        }
        if ($extraMin > 0) {
            $rawHours += round($extraMin / 60.0, 2);
        }
        if ($rawHours <= 0 && $hourType !== 'intercambio_dia') {
            Response::error('La cantidad de horas debe ser mayor a 0', 422);
        }

        $factor    = self::factorForType($hourType);
        $effective = round($rawHours * $factor, 2);

        $pdo = Database::pdo();
        $pdo->prepare(
            'INSERT INTO staff_hours
                (business_id, person_id, work_date, hour_type, shift, start_time, end_time, raw_hours, factor, effective_hours, tasks)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([$bid, $personId, $workDate, $hourType, $shift, $start, $end, $rawHours, $factor, $effective, $tasks]);

        Response::ok(['id' => (int) $pdo->lastInsertId()], 201);
    }

    /**
     * POST /staff/hours/shift-batch
     * Carga rápida de un Turno de Atención (Mañana 4h o Noche 6h) para varias personas a la vez,
     * replicando el formulario "Turnos de Atención" del Excel de Arrabbiata.
     */
    public function storeShiftBatch(Request $req): void
    {
        $bid       = (int) $req->auth['business_id'];
        $workDate  = trim((string) $req->input('work_date', date('Y-m-d')));
        $shift     = trim((string) $req->input('shift', 'Noche'));
        $isHoliday = (bool) $req->input('is_holiday', false);
        $entries   = $req->input('entries', []);

        if (!is_array($entries) || $entries === []) {
            Response::error('Seleccioná al menos una persona que haya trabajado en el turno', 422);
        }

        $baseHours = $shift === 'Mañana' ? 4.0 : 6.0;
        $start     = $shift === 'Mañana' ? '11:30' : '19:00';
        $end       = $shift === 'Mañana' ? '15:30' : '01:00';
        $hourType  = $isHoliday ? 'feriado_trabajado' : 'atencion';
        $factor    = self::factorForType($hourType);

        $pdo = Database::pdo();
        $ins = $pdo->prepare(
            'INSERT INTO staff_hours
                (business_id, person_id, work_date, hour_type, shift, start_time, end_time, raw_hours, factor, effective_hours, tasks)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );

        $count = 0;
        foreach ($entries as $e) {
            $pid = (int) ($e['person_id'] ?? 0);
            if ($pid <= 0) continue;
            $extraMin = (float) ($e['extra_minutes'] ?? 0);
            $customH  = isset($e['raw_hours']) && is_numeric($e['raw_hours']) && (float) $e['raw_hours'] > 0
                ? (float) $e['raw_hours']
                : $baseHours;
            $rawH = round($customH + ($extraMin / 60.0), 2);
            $effH = round($rawH * $factor, 2);
            $note = trim((string) ($e['tasks'] ?? '')) ?: ("Turno {$shift}" . ($extraMin > 0 ? " (+{$extraMin} min)" : ''));
            $ins->execute([$bid, $pid, $workDate, $hourType, $shift, $start, $end, $rawH, $factor, $effH, $note]);
            $count++;
        }

        Response::ok(['created' => $count], 201);
    }

    /** DELETE /staff/hours/{id} */
    public function destroyHour(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        Database::pdo()
            ->prepare('DELETE FROM staff_hours WHERE id = ? AND business_id = ?')
            ->execute([$id, $bid]);
        Response::ok(['deleted' => true]);
    }

    /** GET /staff/withdrawals */
    public function listWithdrawals(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $this->ensureSeeded($bid);
        $pdo = Database::pdo();

        $personId = isset($req->query['person_id']) && $req->query['person_id'] !== '' ? (int) $req->query['person_id'] : null;
        $status   = isset($req->query['status']) && $req->query['status'] !== '' ? (string) $req->query['status'] : null;

        $sql = 'SELECT w.*, p.name AS person_name
                  FROM staff_withdrawals w
                  JOIN staff_people p ON p.id = w.person_id
                 WHERE w.business_id = ?';
        $params = [$bid];

        if ($personId !== null) {
            $sql .= ' AND w.person_id = ?';
            $params[] = $personId;
        }
        if ($status !== null) {
            $sql .= ' AND w.status = ?';
            $params[] = $status;
        }
        $sql .= ' ORDER BY w.withdrawal_date DESC, w.id DESC LIMIT 300';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        $withdrawals = array_map(fn(array $w): array => $this->castWithdrawal($w), $stmt->fetchAll());
        Response::ok(['withdrawals' => $withdrawals]);
    }

    /** POST /staff/withdrawals */
    public function storeWithdrawal(Request $req): void
    {
        $bid      = (int) $req->auth['business_id'];
        $personId = (int) $req->input('person_id', 0);
        $date     = trim((string) $req->input('withdrawal_date', date('Y-m-d'))) ?: date('Y-m-d');
        $concept  = trim((string) $req->input('concept', ''));
        $quantity = (float) $req->input('quantity', 1);
        $unit     = trim((string) $req->input('unit', 'unidad')) ?: 'unidad';
        $upRaw    = $req->input('unit_price');
        $notes    = trim((string) $req->input('notes', '')) ?: null;

        if ($personId <= 0 || $concept === '' || $quantity <= 0) {
            Response::error('Completá persona, producto/concepto y cantidad mayor a 0', 422);
        }

        $unitPrice = ($upRaw !== null && $upRaw !== '' && is_numeric($upRaw)) ? (float) $upRaw : null;
        $subtotal  = $unitPrice !== null ? round($quantity * $unitPrice, 2) : null;

        $pdo = Database::pdo();
        $pdo->prepare(
            "INSERT INTO staff_withdrawals
                (business_id, person_id, withdrawal_date, concept, quantity, unit, unit_price, subtotal, status, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente', ?)"
        )->execute([$bid, $personId, $date, $concept, $quantity, $unit, $unitPrice, $subtotal, $notes]);

        Response::ok(['id' => (int) $pdo->lastInsertId()], 201);
    }

    /** PUT /staff/withdrawals/{id} */
    public function updateWithdrawal(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        $pdo = Database::pdo();

        $stmt = $pdo->prepare('SELECT * FROM staff_withdrawals WHERE id = ? AND business_id = ? LIMIT 1');
        $stmt->execute([$id, $bid]);
        $curr = $stmt->fetch();
        if (!$curr) {
            Response::error('Retiro no encontrado', 404);
        }

        $concept  = trim((string) $req->input('concept', $curr['concept']));
        $quantity = (float) $req->input('quantity', $curr['quantity']);
        $unit     = trim((string) $req->input('unit', $curr['unit']));
        $upRaw    = $req->input('unit_price', $curr['unit_price']);
        $status   = in_array($req->input('status'), ['Pendiente', 'Imputado'], true)
            ? (string) $req->input('status')
            : $curr['status'];
        $notes    = $req->input('notes') !== null ? (trim((string) $req->input('notes')) ?: null) : $curr['notes'];

        $unitPrice = ($upRaw !== null && $upRaw !== '' && is_numeric($upRaw)) ? (float) $upRaw : null;
        $subtotal  = $unitPrice !== null ? round($quantity * $unitPrice, 2) : null;

        $pdo->prepare(
            'UPDATE staff_withdrawals
                SET concept = ?, quantity = ?, unit = ?, unit_price = ?, subtotal = ?, status = ?, notes = ?
              WHERE id = ? AND business_id = ?'
        )->execute([$concept, $quantity, $unit, $unitPrice, $subtotal, $status, $notes, $id, $bid]);

        Response::ok(['updated' => true]);
    }

    /** DELETE /staff/withdrawals/{id} */
    public function destroyWithdrawal(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        Database::pdo()
            ->prepare('DELETE FROM staff_withdrawals WHERE id = ? AND business_id = ?')
            ->execute([$id, $bid]);
        Response::ok(['deleted' => true]);
    }

    /** GET /staff/settlements */
    public function listSettlements(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $this->ensureSeeded($bid);
        $pdo = Database::pdo();

        $personId = isset($req->query['person_id']) && $req->query['person_id'] !== '' ? (int) $req->query['person_id'] : null;

        $sql = 'SELECT s.*, p.name AS person_name
                  FROM staff_settlements s
                  JOIN staff_people p ON p.id = s.person_id
                 WHERE s.business_id = ?';
        $params = [$bid];
        if ($personId !== null) {
            $sql .= ' AND s.person_id = ?';
            $params[] = $personId;
        }
        $sql .= ' ORDER BY s.period_end DESC, s.id DESC LIMIT 200';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        $settlements = array_map(
            fn(array $s): array => $this->castSettlement($s, (string) $s['person_name']),
            $stmt->fetchAll()
        );
        Response::ok(['settlements' => $settlements]);
    }

    /**
     * POST /staff/settlements/preview
     * Calcula todos los montos de una liquidación (Semanal, Mensual, Aguinaldo SAC o Vacaciones)
     * en base a las horas registradas en el período, las tarifas vigentes en cada fecha y los retiros pendientes.
     */
    public function previewSettlement(Request $req): void
    {
        $bid         = (int) $req->auth['business_id'];
        $personId    = (int) $req->input('person_id', 0);
        $periodStart = trim((string) $req->input('period_start', ''));
        $periodEnd   = trim((string) $req->input('period_end', ''));
        $type        = trim((string) $req->input('settlement_type', 'Semanal'));
        $adic        = (float) $req->input('conceptos_adic', 0);

        if ($personId <= 0 || $periodStart === '' || $periodEnd === '') {
            Response::error('Indicá persona, fecha de inicio y fecha de fin del período', 422);
        }

        $pdo = Database::pdo();
        $pStmt = $pdo->prepare('SELECT * FROM staff_people WHERE id = ? AND business_id = ? LIMIT 1');
        $pStmt->execute([$personId, $bid]);
        $person = $pStmt->fetch();
        if (!$person) {
            Response::error('Persona no encontrada', 404);
        }

        $hsAt = 0.0; $mAt = 0.0;
        $hsPr = 0.0; $mPr = 0.0;
        $hsFT = 0.0; $mFT = 0.0;
        $hsFNT = 0.0; $mFNT = 0.0;
        $hsLic = 0.0; $mLic = 0.0;
        $mSac = 0.0;

        if ($type === 'Aguinaldo') {
            // SAC = 50% de la mejor remuneración mensual del semestre
            $year = substr($periodEnd, 0, 4);
            $month = (int) substr($periodEnd, 5, 2);
            $semStart = $month <= 6 ? "{$year}-01-01" : "{$year}-07-01";
            $semEnd   = $month <= 6 ? "{$year}-06-30" : "{$year}-12-31";

            $stmt = $pdo->prepare(
                "SELECT SUBSTRING(period_end, 1, 7) AS ym, SUM(total_bruto) AS monthly_bruto
                   FROM staff_settlements
                  WHERE business_id = ? AND person_id = ?
                    AND settlement_type IN ('Semanal', 'Mensual')
                    AND period_end BETWEEN ? AND ?
                  GROUP BY ym
                  ORDER BY monthly_bruto DESC
                  LIMIT 1"
            );
            $stmt->execute([$bid, $personId, $semStart, $semEnd]);
            $best = $stmt->fetch();
            $bestMonthly = $best ? (float) $best['monthly_bruto'] : 0.0;
            $mSac = round($bestMonthly * 0.5, 2);
        } else {
            // Sumar horas del período
            $hStmt = $pdo->prepare(
                'SELECT * FROM staff_hours
                  WHERE business_id = ? AND person_id = ?
                    AND work_date BETWEEN ? AND ?
                  ORDER BY work_date ASC'
            );
            $hStmt->execute([$bid, $personId, $periodStart, $periodEnd]);
            foreach ($hStmt->fetchAll() as $h) {
                $rate = $this->rateForDate($bid, $personId, $h['work_date']);
                $raw  = (float) $h['raw_hours'];
                $eff  = (float) $h['effective_hours'];
                $amt  = round($eff * $rate, 2);

                switch ($h['hour_type']) {
                    case 'atencion':
                        $hsAt += $eff;
                        $mAt  += $amt;
                        break;
                    case 'produccion':
                        $hsPr += $eff;
                        $mPr  += $amt;
                        break;
                    case 'feriado_trabajado':
                        $hsFT += $raw;
                        $mFT  += $amt; // effective_hours ya tiene factor 2x
                        break;
                    case 'feriado_no_trab':
                        $hsFNT += $eff;
                        $mFNT  += $amt;
                        break;
                    case 'licencia_enf':
                    case 'vacacion':
                        $hsLic += $eff;
                        $mLic  += $amt;
                        break;
                }
            }
        }

        // Retiros pendientes de esa persona
        $wStmt = $pdo->prepare(
            "SELECT * FROM staff_withdrawals
              WHERE business_id = ? AND person_id = ? AND status = 'Pendiente'
              ORDER BY withdrawal_date ASC, id ASC"
        );
        $wStmt->execute([$bid, $personId]);
        $pendingWithdrawals = array_map(fn(array $w): array => $this->castWithdrawal($w), $wStmt->fetchAll());

        $retirosSum = 0.0;
        $withoutPriceCount = 0;
        foreach ($pendingWithdrawals as $pw) {
            if ($pw['subtotal'] === null || $pw['unit_price'] === null) {
                $withoutPriceCount++;
            } else {
                $retirosSum += $pw['subtotal'];
            }
        }

        $subtotalHoras = round($mAt + $mPr + $mFT + $mFNT + $mLic + $mSac, 2);
        $totalBruto    = round($subtotalHoras + $adic, 2);
        $totalNeto     = round($totalBruto - $retirosSum, 2);

        Response::ok([
            'preview' => [
                'person_id'               => $personId,
                'person_name'             => $person['name'],
                'period_start'            => $periodStart,
                'period_end'              => $periodEnd,
                'settlement_type'         => $type,
                'current_rate'            => $this->rateForDate($bid, $personId, $periodEnd),
                'hs_atencion'             => round($hsAt, 2),
                'monto_atencion'          => round($mAt, 2),
                'hs_produccion'           => round($hsPr, 2),
                'monto_produccion'        => round($mPr, 2),
                'hs_fer_trab'             => round($hsFT, 2),
                'monto_fer_trab'          => round($mFT, 2),
                'hs_fer_no_trab'          => round($hsFNT, 2),
                'monto_fer_no_trab'       => round($mFNT, 2),
                'hs_licencia'             => round($hsLic, 2),
                'monto_licencia'          => round($mLic, 2),
                'monto_aguinaldo'         => round($mSac, 2),
                'subtotal_horas'          => $subtotalHoras,
                'conceptos_adic'          => round($adic, 2),
                'total_bruto'             => $totalBruto,
                'retiros_aplicados'       => round($retirosSum, 2),
                'total_neto'              => $totalNeto,
                'pending_withdrawals'     => $pendingWithdrawals,
                'withdrawals_missing_price' => $withoutPriceCount,
            ],
        ]);
    }

    /**
     * POST /staff/settlements
     * Guarda una liquidación y marca como 'Imputado' los retiros pendientes de esa persona.
     */
    public function storeSettlement(Request $req): void
    {
        $bid         = (int) $req->auth['business_id'];
        $personId    = (int) $req->input('person_id', 0);
        $periodStart = trim((string) $req->input('period_start', ''));
        $periodEnd   = trim((string) $req->input('period_end', ''));
        $type        = trim((string) $req->input('settlement_type', 'Semanal'));
        $status      = in_array($req->input('status'), ['Borrador', 'Pagado'], true)
            ? (string) $req->input('status')
            : 'Pagado';
        $payDate     = $status === 'Pagado'
            ? (trim((string) $req->input('payment_date', date('Y-m-d'))) ?: date('Y-m-d'))
            : null;
        $notes       = trim((string) $req->input('notes', '')) ?: null;
        $imputeWithdrawals = (bool) $req->input('impute_withdrawals', true);

        if ($personId <= 0 || $periodStart === '' || $periodEnd === '') {
            Response::error('Datos de liquidación incompletos', 422);
        }

        $hsAt   = (float) $req->input('hs_atencion', 0);
        $mAt    = (float) $req->input('monto_atencion', 0);
        $hsPr   = (float) $req->input('hs_produccion', 0);
        $mPr    = (float) $req->input('monto_produccion', 0);
        $hsFT   = (float) $req->input('hs_fer_trab', 0);
        $mFT    = (float) $req->input('monto_fer_trab', 0);
        $hsFNT  = (float) $req->input('hs_fer_no_trab', 0);
        $mFNT   = (float) $req->input('monto_fer_no_trab', 0);
        $hsLic  = (float) $req->input('hs_licencia', 0);
        $mLic   = (float) $req->input('monto_licencia', 0);
        $mSac   = (float) $req->input('monto_aguinaldo', 0);
        $subH   = (float) $req->input('subtotal_horas', $mAt + $mPr + $mFT + $mFNT + $mLic + $mSac);
        $adic   = (float) $req->input('conceptos_adic', 0);
        $bruto  = (float) $req->input('total_bruto', $subH + $adic);
        $ret    = (float) $req->input('retiros_aplicados', 0);
        $neto   = (float) $req->input('total_neto', $bruto - $ret);

        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            $pdo->prepare(
                'INSERT INTO staff_settlements
                    (business_id, person_id, period_start, period_end, settlement_type,
                     hs_atencion, monto_atencion, hs_produccion, monto_produccion,
                     hs_fer_trab, monto_fer_trab, hs_fer_no_trab, monto_fer_no_trab,
                     hs_licencia, monto_licencia, monto_aguinaldo, subtotal_horas,
                     conceptos_adic, total_bruto, retiros_aplicados, total_neto,
                     status, payment_date, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $bid, $personId, $periodStart, $periodEnd, $type,
                $hsAt, $mAt, $hsPr, $mPr,
                $hsFT, $mFT, $hsFNT, $mFNT,
                $hsLic, $mLic, $mSac, $subH,
                $adic, $bruto, $ret, $neto,
                $status, $payDate, $notes,
            ]);
            $settlementId = (int) $pdo->lastInsertId();

            if ($imputeWithdrawals && $ret > 0) {
                $pdo->prepare(
                    "UPDATE staff_withdrawals
                        SET status = 'Imputado', settlement_id = ?
                      WHERE business_id = ? AND person_id = ? AND status = 'Pendiente' AND subtotal IS NOT NULL"
                )->execute([$settlementId, $bid, $personId]);
            }

            $pdo->prepare(
                'UPDATE staff_hours
                    SET settlement_id = ?
                  WHERE business_id = ? AND person_id = ? AND work_date BETWEEN ? AND ? AND settlement_id IS NULL'
            )->execute([$settlementId, $bid, $personId, $periodStart, $periodEnd]);

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        Response::ok(['id' => $settlementId], 201);
    }

    /** PUT /staff/settlements/{id}/status */
    public function updateSettlementStatus(Request $req): void
    {
        $bid    = (int) $req->auth['business_id'];
        $id     = (int) $req->param('id');
        $status = in_array($req->input('status'), ['Borrador', 'Pagado'], true)
            ? (string) $req->input('status')
            : 'Pagado';
        $payDate = $status === 'Pagado'
            ? (trim((string) $req->input('payment_date', date('Y-m-d'))) ?: date('Y-m-d'))
            : null;

        Database::pdo()
            ->prepare('UPDATE staff_settlements SET status = ?, payment_date = ? WHERE id = ? AND business_id = ?')
            ->execute([$status, $payDate, $id, $bid]);

        Response::ok(['updated' => true]);
    }

    /** DELETE /staff/settlements/{id} */
    public function destroySettlement(Request $req): void
    {
        $bid = (int) $req->auth['business_id'];
        $id  = (int) $req->param('id');
        $pdo = Database::pdo();

        $pdo->prepare("UPDATE staff_withdrawals SET status = 'Pendiente', settlement_id = NULL WHERE settlement_id = ? AND business_id = ?")
            ->execute([$id, $bid]);
        $pdo->prepare('UPDATE staff_hours SET settlement_id = NULL WHERE settlement_id = ? AND business_id = ?')
            ->execute([$id, $bid]);
        $pdo->prepare('DELETE FROM staff_settlements WHERE id = ? AND business_id = ?')
            ->execute([$id, $bid]);

        Response::ok(['deleted' => true]);
    }

    // =========================================================================
    //  PERFIL ONLINE DEL EMPLEADO (ACCESO PÚBLICO POR CÓDIGO / LINK PERSONAL)
    // =========================================================================

    private function findPersonByCode(string $code): array
    {
        $pdo = Database::pdo();
        // Si aún no se corrió el seed para el primer negocio activo, asegurarlo:
        $bStmt = $pdo->query('SELECT id FROM businesses WHERE is_active = 1 ORDER BY id ASC LIMIT 1');
        $firstBid = $bStmt ? (int) $bStmt->fetchColumn() : 0;
        if ($firstBid > 0) {
            $this->ensureSeeded($firstBid);
        }

        $stmt = $pdo->prepare(
            'SELECT p.*, b.name AS business_name, b.slug AS business_slug
               FROM staff_people p
               JOIN businesses b ON b.id = p.business_id
              WHERE LOWER(p.code) = LOWER(?)
              ORDER BY p.id ASC
              LIMIT 1'
        );
        $stmt->execute([trim($code)]);
        $person = $stmt->fetch();
        if (!$person) {
            Response::error('No encontramos el perfil de empleado solicitado', 404);
        }
        return $person;
    }

    /**
     * GET /public/staff-portal/{code}
     * Devuelve todos los datos del Perfil Personal del empleado (idéntico a su Excel personal).
     */
    public function portalShow(Request $req): void
    {
        $person = $this->findPersonByCode((string) $req->param('code'));
        $bid    = (int) $person['business_id'];
        $pid    = (int) $person['id'];
        $pdo    = Database::pdo();

        [$weekStart, $weekEnd] = $this->currentWeekRange();
        $today = date('Y-m-d');
        $currentRate = $this->rateForDate($bid, $pid, $today);

        // Horas de la semana en curso
        $wHoursStmt = $pdo->prepare(
            'SELECT COALESCE(SUM(effective_hours), 0)
               FROM staff_hours
              WHERE business_id = ? AND person_id = ? AND work_date BETWEEN ? AND ?'
        );
        $wHoursStmt->execute([$bid, $pid, $weekStart, $weekEnd]);
        $weekEffectiveHours = (float) $wHoursStmt->fetchColumn();

        // Retiros pendientes
        $pendStmt = $pdo->prepare(
            "SELECT * FROM staff_withdrawals
              WHERE business_id = ? AND person_id = ? AND status = 'Pendiente'
              ORDER BY withdrawal_date DESC, id DESC"
        );
        $pendStmt->execute([$bid, $pid]);
        $pendingWithdrawals = array_map(fn(array $w): array => $this->castWithdrawal($w), $pendStmt->fetchAll());
        $pendingTotal = array_reduce(
            $pendingWithdrawals,
            static fn(float $acc, array $w): float => $acc + ($w['subtotal'] ?? 0.0),
            0.0
        );

        // Última liquidación
        $lastStmt = $pdo->prepare(
            'SELECT * FROM staff_settlements
              WHERE business_id = ? AND person_id = ?
              ORDER BY period_end DESC, id DESC
              LIMIT 1'
        );
        $lastStmt->execute([$bid, $pid]);
        $lastSettRow = $lastStmt->fetch();
        $lastSettlement = $lastSettRow ? $this->castSettlement($lastSettRow, $person['name']) : null;

        // Historial de horas del empleado
        $hStmt = $pdo->prepare(
            'SELECT h.*, p.name AS person_name
               FROM staff_hours h
               JOIN staff_people p ON p.id = h.person_id
              WHERE h.business_id = ? AND h.person_id = ?
              ORDER BY h.work_date DESC, h.id DESC
              LIMIT 120'
        );
        $hStmt->execute([$bid, $pid]);
        $hours = array_map(fn(array $h): array => $this->castHour($h), $hStmt->fetchAll());

        // Historial completo de retiros del empleado
        $allWStmt = $pdo->prepare(
            'SELECT w.*, p.name AS person_name
               FROM staff_withdrawals w
               JOIN staff_people p ON p.id = w.person_id
              WHERE w.business_id = ? AND w.person_id = ?
              ORDER BY w.withdrawal_date DESC, w.id DESC
              LIMIT 120'
        );
        $allWStmt->execute([$bid, $pid]);
        $withdrawals = array_map(fn(array $w): array => $this->castWithdrawal($w), $allWStmt->fetchAll());

        // Historial de liquidaciones del empleado
        $sStmt = $pdo->prepare(
            'SELECT * FROM staff_settlements
              WHERE business_id = ? AND person_id = ?
              ORDER BY period_end DESC, id DESC
              LIMIT 50'
        );
        $sStmt->execute([$bid, $pid]);
        $settlements = array_map(
            fn(array $s): array => $this->castSettlement($s, $person['name']),
            $sStmt->fetchAll()
        );

        // Horarios regulares del empleado
        $schStmt = $pdo->prepare(
            'SELECT * FROM staff_schedules
              WHERE business_id = ? AND person_id = ?
              ORDER BY id ASC'
        );
        $schStmt->execute([$bid, $pid]);
        $schedules = array_map(static fn(array $s): array => [
            'id'          => (int) $s['id'],
            'day_of_week' => $s['day_of_week'],
            'shift'       => $s['shift'],
            'start_time'  => $s['start_time'],
            'end_time'    => $s['end_time'],
            'base_hours'  => (float) $s['base_hours'],
        ], $schStmt->fetchAll());

        // Insumos disponibles para autocompletar retiros a cuenta
        $supStmt = $pdo->prepare('SELECT id, name, unit, cost FROM supplies WHERE business_id = ? AND is_active = 1 ORDER BY name ASC');
        $supStmt->execute([$bid]);
        $supplies = array_map(static fn(array $s): array => [
            'id'   => (int) $s['id'],
            'name' => $s['name'],
            'unit' => $s['unit'] ?: 'unidad',
            'cost' => (float) ($s['cost'] ?? 0),
        ], $supStmt->fetchAll());

        Response::ok([
            'person' => [
                'id'              => $pid,
                'code'            => $person['code'],
                'name'            => $person['name'],
                'role'            => $person['role'],
                'settlement_type' => $person['settlement_type'],
                'notes'           => $person['notes'],
                'business_name'   => $person['business_name'],
                'current_rate'    => $currentRate,
            ],
            'current_week' => [
                'period_start'    => $weekStart,
                'period_end'      => $weekEnd,
                'effective_hours' => $weekEffectiveHours,
                'estimated_amount' => round($weekEffectiveHours * $currentRate, 2),
            ],
            'pending_withdrawals' => [
                'count' => count($pendingWithdrawals),
                'total' => round($pendingTotal, 2),
                'items' => $pendingWithdrawals,
            ],
            'last_settlement' => $lastSettlement,
            'schedules'       => $schedules,
            'hours'           => $hours,
            'withdrawals'     => $withdrawals,
            'settlements'     => $settlements,
            'supplies'        => $supplies,
        ]);
    }

    /**
     * POST /public/staff-portal/{code}/withdrawals
     * Permite al empleado registrar un retiro a cuenta desde su Perfil Online.
     */
    public function portalStoreWithdrawal(Request $req): void
    {
        $person   = $this->findPersonByCode((string) $req->param('code'));
        $bid      = (int) $person['business_id'];
        $personId = (int) $person['id'];

        $date     = trim((string) $req->input('withdrawal_date', date('Y-m-d'))) ?: date('Y-m-d');
        $concept  = trim((string) $req->input('concept', ''));
        $quantity = (float) $req->input('quantity', 1);
        $unit     = trim((string) $req->input('unit', 'unidad')) ?: 'unidad';
        $upRaw    = $req->input('unit_price');
        $notes    = trim((string) $req->input('notes', '')) ?: 'Cargado desde Perfil Online';

        if ($concept === '' || $quantity <= 0) {
            Response::error('Indicá qué mercadería/producto retiraste y la cantidad', 422);
        }

        $unitPrice = ($upRaw !== null && $upRaw !== '' && is_numeric($upRaw) && (float) $upRaw > 0)
            ? (float) $upRaw
            : null;
        $subtotal  = $unitPrice !== null ? round($quantity * $unitPrice, 2) : null;

        $pdo = Database::pdo();
        $pdo->prepare(
            "INSERT INTO staff_withdrawals
                (business_id, person_id, withdrawal_date, concept, quantity, unit, unit_price, subtotal, status, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente', ?)"
        )->execute([$bid, $personId, $date, $concept, $quantity, $unit, $unitPrice, $subtotal, $notes]);

        Response::ok(['id' => (int) $pdo->lastInsertId()], 201);
    }

    /**
     * POST /public/staff-portal/{code}/hours
     * Permite al empleado registrar horas de producción o turno desde su Perfil Online.
     */
    public function portalStoreHour(Request $req): void
    {
        $person   = $this->findPersonByCode((string) $req->param('code'));
        $bid      = (int) $person['business_id'];
        $personId = (int) $person['id'];

        $workDate = trim((string) $req->input('work_date', date('Y-m-d'))) ?: date('Y-m-d');
        $hourType = trim((string) $req->input('hour_type', 'produccion')) ?: 'produccion';
        $shift    = trim((string) $req->input('shift', 'Producción')) ?: 'Producción';
        $start    = trim((string) $req->input('start_time', '')) ?: null;
        $end      = trim((string) $req->input('end_time', '')) ?: null;
        $rawHours = (float) $req->input('raw_hours', 0);
        $tasks    = trim((string) $req->input('tasks', '')) ?: null;

        if ($rawHours <= 0 && $start && $end) {
            $rawHours = $this->calcHoursBetween($start, $end);
        }
        if ($rawHours <= 0) {
            Response::error('Indicá la hora de inicio y fin o la cantidad de horas', 422);
        }

        $factor    = self::factorForType($hourType);
        $effective = round($rawHours * $factor, 2);

        $pdo = Database::pdo();
        $pdo->prepare(
            'INSERT INTO staff_hours
                (business_id, person_id, work_date, hour_type, shift, start_time, end_time, raw_hours, factor, effective_hours, tasks)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([$bid, $personId, $workDate, $hourType, $shift, $start, $end, $rawHours, $factor, $effective, $tasks]);

        Response::ok(['id' => (int) $pdo->lastInsertId()], 201);
    }

    // =========================================================================
    //  HELPERS
    // =========================================================================

    private function calcHoursBetween(string $start, string $end): float
    {
        if (!preg_match('/^(\d{1,2}):(\d{2})/', $start, $m1) || !preg_match('/^(\d{1,2}):(\d{2})/', $end, $m2)) {
            return 0.0;
        }
        $min1 = ((int) $m1[1]) * 60 + (int) $m1[2];
        $min2 = ((int) $m2[1]) * 60 + (int) $m2[2];
        if ($min2 <= $min1) {
            $min2 += 24 * 60; // cruza medianoche (ej. 19:00 a 01:00 = 6h)
        }
        return round(($min2 - $min1) / 60.0, 2);
    }

    private function castHour(array $r): array
    {
        return [
            'id'              => (int) $r['id'],
            'person_id'       => (int) $r['person_id'],
            'person_name'     => $r['person_name'] ?? '',
            'work_date'       => $r['work_date'],
            'hour_type'       => $r['hour_type'],
            'shift'           => $r['shift'],
            'start_time'      => $r['start_time'],
            'end_time'        => $r['end_time'],
            'raw_hours'       => (float) $r['raw_hours'],
            'factor'          => (float) $r['factor'],
            'effective_hours' => (float) $r['effective_hours'],
            'tasks'           => $r['tasks'],
            'settlement_id'   => $r['settlement_id'] !== null ? (int) $r['settlement_id'] : null,
        ];
    }

    private function castWithdrawal(array $w): array
    {
        return [
            'id'              => (int) $w['id'],
            'person_id'       => (int) $w['person_id'],
            'person_name'     => $w['person_name'] ?? '',
            'withdrawal_date' => $w['withdrawal_date'],
            'concept'         => $w['concept'],
            'quantity'        => (float) $w['quantity'],
            'unit'            => $w['unit'],
            'unit_price'      => $w['unit_price'] !== null ? (float) $w['unit_price'] : null,
            'subtotal'        => $w['subtotal'] !== null ? (float) $w['subtotal'] : null,
            'status'          => $w['status'],
            'settlement_id'   => $w['settlement_id'] !== null ? (int) $w['settlement_id'] : null,
            'notes'           => $w['notes'],
        ];
    }

    private function castSettlement(array $s, string $personName = ''): array
    {
        return [
            'id'                => (int) $s['id'],
            'person_id'         => (int) $s['person_id'],
            'person_name'       => $personName ?: ($s['person_name'] ?? ''),
            'period_start'      => $s['period_start'],
            'period_end'        => $s['period_end'],
            'settlement_type'   => $s['settlement_type'],
            'hs_atencion'       => (float) $s['hs_atencion'],
            'monto_atencion'    => (float) $s['monto_atencion'],
            'hs_produccion'     => (float) $s['hs_produccion'],
            'monto_produccion'  => (float) $s['monto_produccion'],
            'hs_fer_trab'       => (float) $s['hs_fer_trab'],
            'monto_fer_trab'    => (float) $s['monto_fer_trab'],
            'hs_fer_no_trab'    => (float) $s['hs_fer_no_trab'],
            'monto_fer_no_trab' => (float) $s['monto_fer_no_trab'],
            'hs_licencia'       => (float) $s['hs_licencia'],
            'monto_licencia'    => (float) $s['monto_licencia'],
            'monto_aguinaldo'   => (float) $s['monto_aguinaldo'],
            'subtotal_horas'    => (float) $s['subtotal_horas'],
            'conceptos_adic'    => (float) $s['conceptos_adic'],
            'total_bruto'       => (float) $s['total_bruto'],
            'retiros_aplicados' => (float) $s['retiros_aplicados'],
            'total_neto'        => (float) $s['total_neto'],
            'status'            => $s['status'],
            'payment_date'      => $s['payment_date'],
            'notes'             => $s['notes'],
        ];
    }
}
