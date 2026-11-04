-- Actualizador rápido de precios por lista de proveedor (Pizzalog App).
-- Idempotente: PriceListController también crea estas tablas si faltan.

CREATE TABLE IF NOT EXISTS supply_price_history (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    business_id   BIGINT UNSIGNED NOT NULL,
    supply_id     BIGINT UNSIGNED NOT NULL,
    old_cost      DECIMAL(14,4) NULL,
    new_cost      DECIMAL(14,4) NULL,
    unit          VARCHAR(16) NULL,
    supplier_id   BIGINT UNSIGNED NULL,
    source        VARCHAR(20) NOT NULL DEFAULT 'manual',  -- manual | price_list
    batch_id      VARCHAR(40) NULL,
    source_name   VARCHAR(190) NULL,
    raw_name      VARCHAR(255) NULL,
    raw_price     DECIMAL(14,4) NULL,
    user_id       BIGINT UNSIGNED NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_sph_supply (business_id, supply_id, created_at),
    KEY idx_sph_batch (business_id, batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supplier_item_aliases (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    business_id   BIGINT UNSIGNED NOT NULL,
    supplier_id   BIGINT UNSIGNED NOT NULL DEFAULT 0,      -- 0 = sin proveedor
    alias_key     VARCHAR(255) NOT NULL,
    raw_name      VARCHAR(255) NULL,
    supply_id     BIGINT UNSIGNED NOT NULL,
    pack_quantity DECIMAL(14,4) NULL,
    pack_unit     VARCHAR(8) NULL,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_supplier_alias (business_id, supplier_id, alias_key),
    KEY idx_alias_supply (business_id, supply_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
