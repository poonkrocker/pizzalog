-- =====================================================================
--  PIZZALOG · Migración 001
--  Costo por producto (márgenes) + composición de ingredientes
--  (análisis de preferencias, SIN control de stock por gramaje).
--
--  Correr sobre la base ya creada con pizzalog_schema.sql.
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
--  1) Descripción + costo del producto
--     description: el texto del que se extraen los ingredientes
--                  (y que se muestra en la carta).
--     cost: se carga a mano, de vez en cuando. Margen = price - cost.
--           NO se deriva de ingredientes (eso requeriría gramaje, que se
--           decidió no implementar).
-- ---------------------------------------------------------------------
ALTER TABLE products
    ADD COLUMN description TEXT          NULL                  AFTER name,
    ADD COLUMN cost        DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER price;


-- ---------------------------------------------------------------------
--  2) Catálogo canónico de ingredientes (por negocio)
--     Garantiza que "muzza" y "muzzarella" sean UNO solo, así los
--     dashboards no se fragmentan. La 'category' potencia el análisis
--     por tipo (¿la gente prefiere más vegetales? ¿más fiambres?).
-- ---------------------------------------------------------------------
CREATE TABLE ingredients (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id BIGINT UNSIGNED NOT NULL,
    name        VARCHAR(80)     NOT NULL,
    category    ENUM('masa','salsa','queso','fiambre','vegetal','fruta','condimento','otro')
                                NOT NULL DEFAULT 'otro',
    is_active   TINYINT(1)      NOT NULL DEFAULT 1,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    -- evita duplicados; con utf8mb4_unicode_ci el match ignora may/min
    UNIQUE KEY uq_ingredients_business_name (business_id, name),
    KEY idx_ingredients_business (business_id),
    CONSTRAINT fk_ingredients_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
--  3) Composición: qué ingredientes lleva cada producto (M:N)
--     Se llena automáticamente al guardar el producto, a partir de la
--     descripción (extracción + confirmación del usuario).
--     Cruzando sale_items -> products -> product_ingredients se obtiene
--     "qué ingredientes se venden más" sin guardar nada extra por venta.
--
--     Nota: el análisis usa la composición VIGENTE. Si en el futuro
--     querés precisión histórica estricta (o costeo por receta), se
--     suma con una migración posterior sin romper esto.
-- ---------------------------------------------------------------------
CREATE TABLE product_ingredients (
    product_id    BIGINT UNSIGNED NOT NULL,
    ingredient_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (product_id, ingredient_id),
    KEY idx_pi_ingredient (ingredient_id),
    CONSTRAINT fk_pi_product FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE CASCADE,
    CONSTRAINT fk_pi_ingredient FOREIGN KEY (ingredient_id)
        REFERENCES ingredients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
