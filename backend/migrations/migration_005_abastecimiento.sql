-- =====================================================================
--  PIZZALOG · Migración 005
--  Abastecimiento y contactos:
--    suppliers         → proveedores
--    supplies          → insumos (consumibles NO vendibles: descartables,
--                        limpieza, etc.). Inventario propio, separado del
--                        stock de productos a la venta.
--    supply_movements  → entradas/salidas/ajustes de insumo
--    customers         → clientes (CRM básico para delivery)
--
--  Correr después de migration_004.
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
--  1) Proveedores
-- ---------------------------------------------------------------------
CREATE TABLE suppliers (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id  BIGINT UNSIGNED NOT NULL,
    name         VARCHAR(160)    NOT NULL,
    contact_name VARCHAR(160)    NULL,
    phone        VARCHAR(40)     NULL,
    email        VARCHAR(160)    NULL,
    cuit         VARCHAR(13)     NULL,
    notes        VARCHAR(500)    NULL,
    is_active    TINYINT(1)      NOT NULL DEFAULT 1,
    created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_suppliers_business (business_id),
    CONSTRAINT fk_suppliers_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
--  2) Insumos
--     stock en DECIMAL(12,3) para admitir fracciones (kg, litros).
--     unit es libre ('u', 'caja', 'pack', 'kg', 'lt'...).
-- ---------------------------------------------------------------------
CREATE TABLE supplies (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id BIGINT UNSIGNED NOT NULL,
    name        VARCHAR(160)    NOT NULL,
    category    VARCHAR(80)     NULL,            -- "Descartables", "Limpieza"...
    unit        VARCHAR(20)     NOT NULL DEFAULT 'u',
    stock       DECIMAL(12,3)   NOT NULL DEFAULT 0.000,
    min_stock   DECIMAL(12,3)   NULL,            -- umbral de alerta
    cost        DECIMAL(12,2)   NULL,            -- costo unitario de compra
    supplier_id BIGINT UNSIGNED NULL,
    is_active   TINYINT(1)      NOT NULL DEFAULT 1,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_supplies_business (business_id),
    KEY idx_supplies_supplier (supplier_id),
    CONSTRAINT fk_supplies_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_supplies_supplier FOREIGN KEY (supplier_id)
        REFERENCES suppliers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
--  3) Movimientos de insumo
--     quantity es el delta con signo (+ entrada, - consumo). 'count' fija
--     un recuento (el delta lo calcula el servicio).
-- ---------------------------------------------------------------------
CREATE TABLE supply_movements (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id BIGINT UNSIGNED NOT NULL,
    supply_id   BIGINT UNSIGNED NOT NULL,
    type        ENUM('restock','consumption','adjustment','count') NOT NULL,
    quantity    DECIMAL(12,3)   NOT NULL,
    reason      VARCHAR(255)    NULL,
    user_id     BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_supplymov_business (business_id),
    KEY idx_supplymov_supply (supply_id),
    CONSTRAINT fk_supplymov_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_supplymov_supply FOREIGN KEY (supply_id)
        REFERENCES supplies (id) ON DELETE CASCADE,
    CONSTRAINT fk_supplymov_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
--  4) Clientes (CRM básico para delivery)
-- ---------------------------------------------------------------------
CREATE TABLE customers (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id BIGINT UNSIGNED NOT NULL,
    name        VARCHAR(160)    NOT NULL,
    phone       VARCHAR(40)     NULL,
    email       VARCHAR(160)    NULL,
    address     VARCHAR(255)    NULL,
    notes       VARCHAR(500)    NULL,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_customers_business (business_id),
    KEY idx_customers_phone (business_id, phone),
    CONSTRAINT fk_customers_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
