-- =====================================================================
--  Migración 013 · Combos reales (apuntan a productos de la carta)
-- =====================================================================
--  El combo es un producto más (con su precio). Los productos elegidos
--  se guardan como líneas hijas con precio 0 colgadas de la línea padre,
--  así el ranking de popularidad las cuenta y la facturación no se infla.
-- =====================================================================

CREATE TABLE combo_groups (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id   BIGINT UNSIGNED NOT NULL,
    product_id    BIGINT UNSIGNED NOT NULL,   -- el combo (ej. "Promo 3 Pizzas")
    name          VARCHAR(80) NOT NULL,       -- "Elegí 3 pizzas"
    select_count  INT UNSIGNED NOT NULL DEFAULT 1,
    sort_order    INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_combo_groups_product (product_id),
    KEY idx_combo_groups_business (business_id),
    CONSTRAINT fk_combogroups_product FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE combo_group_items (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    combo_group_id  BIGINT UNSIGNED NOT NULL,
    product_id      BIGINT UNSIGNED NOT NULL,  -- producto elegible real
    sort_order      INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_comboitems_group (combo_group_id),
    CONSTRAINT fk_comboitems_group FOREIGN KEY (combo_group_id)
        REFERENCES combo_groups (id) ON DELETE CASCADE,
    CONSTRAINT fk_comboitems_product FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE products
    ADD COLUMN is_combo TINYINT(1) NOT NULL DEFAULT 0 AFTER has_variants;

ALTER TABLE sale_items
    ADD COLUMN parent_sale_item_id BIGINT UNSIGNED NULL AFTER variant_id,
    ADD CONSTRAINT fk_saleitems_parent FOREIGN KEY (parent_sale_item_id)
        REFERENCES sale_items (id) ON DELETE CASCADE;

ALTER TABLE order_items
    ADD COLUMN parent_order_item_id BIGINT UNSIGNED NULL AFTER product_id,
    ADD CONSTRAINT fk_orderitems_parent FOREIGN KEY (parent_order_item_id)
        REFERENCES order_items (id) ON DELETE CASCADE;
