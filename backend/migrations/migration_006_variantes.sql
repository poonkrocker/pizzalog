-- =====================================================================
--  PIZZALOG · Migración 006
--  Variantes con opciones combinables (estilo Loyverse/Square) y precio
--  abierto.
--
--  Modelo (cinco piezas):
--    products              → el producto ancla (ya existe). Se le suman flags.
--    product_options       → dimensiones del producto (ej "Tamaño", "Masa")
--    product_option_values → valores de cada dimensión (ej "Chica", "Grande")
--    product_variants      → cada combinación materializada, con SU precio
--    variant_option_values → puente: qué valores componen cada variante
--
--  Una variante es una combinación concreta (ej "Grande / Masa madre") con su
--  precio. El puente permite resolver, dado un valor elegido por dimensión, a
--  qué variante corresponde.
--
--  Correr después de migration_005.
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
--  1) Flags en products
--     has_variants : el producto se vende por variantes (su precio propio
--                    se ignora; el precio vive en cada variante).
--     is_open_price: precio abierto; se ingresa al momento de vender
--                    (Costo Envío, Propina, seña...).
-- ---------------------------------------------------------------------
ALTER TABLE products
    ADD COLUMN has_variants  TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active,
    ADD COLUMN is_open_price TINYINT(1) NOT NULL DEFAULT 0 AFTER has_variants;


-- ---------------------------------------------------------------------
--  2) Opciones (dimensiones)
-- ---------------------------------------------------------------------
CREATE TABLE product_options (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id BIGINT UNSIGNED NOT NULL,
    product_id  BIGINT UNSIGNED NOT NULL,
    name        VARCHAR(80)     NOT NULL,          -- "Tamaño", "Masa", "Marca"
    sort_order  INT             NOT NULL DEFAULT 0,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_poptions_product (product_id),
    CONSTRAINT fk_poptions_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_poptions_product FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
--  3) Valores de cada opción
-- ---------------------------------------------------------------------
CREATE TABLE product_option_values (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id BIGINT UNSIGNED NOT NULL,
    option_id   BIGINT UNSIGNED NOT NULL,
    value       VARCHAR(80)     NOT NULL,          -- "Chica", "Grande", "APA"
    sort_order  INT             NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_povalues_option (option_id),
    CONSTRAINT fk_povalues_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_povalues_option FOREIGN KEY (option_id)
        REFERENCES product_options (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
--  4) Variantes (combinaciones materializadas)
--     label: nombre compuesto cacheado ("Grande / Masa madre") para mostrar
--     y snapshotear sin recalcular joins.
-- ---------------------------------------------------------------------
CREATE TABLE product_variants (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id BIGINT UNSIGNED NOT NULL,
    product_id  BIGINT UNSIGNED NOT NULL,
    label       VARCHAR(160)    NOT NULL,
    price       DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    sku         VARCHAR(64)     NULL,
    sort_order  INT             NOT NULL DEFAULT 0,
    is_active   TINYINT(1)      NOT NULL DEFAULT 1,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_pvariants_product (product_id),
    CONSTRAINT fk_pvariants_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_pvariants_product FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
--  5) Puente variante ↔ valores que la componen
--     Permite resolver: dados los valores elegidos (uno por dimensión),
--     qué variante corresponde.
-- ---------------------------------------------------------------------
CREATE TABLE variant_option_values (
    variant_id      BIGINT UNSIGNED NOT NULL,
    option_value_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (variant_id, option_value_id),
    KEY idx_vov_value (option_value_id),
    CONSTRAINT fk_vov_variant FOREIGN KEY (variant_id)
        REFERENCES product_variants (id) ON DELETE CASCADE,
    CONSTRAINT fk_vov_value FOREIGN KEY (option_value_id)
        REFERENCES product_option_values (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
--  6) Referencia a la variante en las líneas de venta y de comanda.
--     El nombre y el precio ya se snapshotean; variant_id agrega trazabilidad.
-- ---------------------------------------------------------------------
ALTER TABLE sale_items
    ADD COLUMN variant_id BIGINT UNSIGNED NULL AFTER product_id,
    ADD KEY idx_saleitems_variant (variant_id),
    ADD CONSTRAINT fk_saleitems_variant FOREIGN KEY (variant_id)
        REFERENCES product_variants (id) ON DELETE SET NULL;

ALTER TABLE table_round_items
    ADD COLUMN variant_id BIGINT UNSIGNED NULL AFTER product_id,
    ADD KEY idx_round_items_variant (variant_id),
    ADD CONSTRAINT fk_round_items_variant FOREIGN KEY (variant_id)
        REFERENCES product_variants (id) ON DELETE SET NULL;
