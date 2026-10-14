-- =====================================================================
--  PIZZALOG · Migración 021
--  Gestión de Cadetes / Repartidores y Liquidación de Turno
--
--  1) delivery_drivers: catálogo de cadetes y repartidores del negocio,
--     con tipo de vehículo, patente y tarifa base por viaje/envío.
--  2) orders.delivery_driver_id: vinculación del pedido con el cadete asignado.
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS delivery_drivers (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id    BIGINT UNSIGNED NOT NULL,
    name           VARCHAR(120)    NOT NULL,
    phone          VARCHAR(40)     NULL,
    vehicle_type   ENUM('moto','bici','auto','otro') NOT NULL DEFAULT 'moto',
    vehicle_plate  VARCHAR(20)     NULL,
    fee_per_trip   DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    is_active      TINYINT(1)      NOT NULL DEFAULT 1,
    created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_drivers_business_active (business_id, is_active),
    CONSTRAINT fk_drivers_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE orders
    ADD COLUMN delivery_driver_id BIGINT UNSIGNED NULL,
    ADD KEY idx_orders_driver (delivery_driver_id);
