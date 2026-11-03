-- Pizzalog migration 032
-- Explicit supply mapping for dough profiles. Existing profiles remain valid
-- for quantity calculations; costing stays incomplete until ingredients are mapped.
-- The dynamic ALTER keeps this safe when the updated API has already created
-- the table/column on a fresh installation.

CREATE TABLE IF NOT EXISTS dough_profiles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    unit_weight_grams DECIMAL(10,2) NOT NULL DEFAULT 220.00,
    hydration_pct DECIMAL(5,2) NOT NULL DEFAULT 67.90,
    biga_pct DECIMAL(5,2) NOT NULL DEFAULT 25.00,
    biga_water_pct DECIMAL(5,2) NOT NULL DEFAULT 50.00,
    biga_yeast_pct DECIMAL(6,3) NOT NULL DEFAULT 0.500,
    poolish_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    poolish_water_pct DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    poolish_yeast_pct DECIMAL(6,3) NOT NULL DEFAULT 0.000,
    direct_yeast_pct DECIMAL(6,3) NOT NULL DEFAULT 0.000,
    salt_pct DECIMAL(5,2) NOT NULL DEFAULT 2.70,
    sugar_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    oil_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    flour_white_pct DECIMAL(5,2) NOT NULL DEFAULT 81.75,
    flour_integral_pct DECIMAL(5,2) NOT NULL DEFAULT 12.17,
    flour_semola_pct DECIMAL(5,2) NOT NULL DEFAULT 6.08,
    cost_per_kg DECIMAL(10,2) NOT NULL DEFAULT 932.30,
    ingredient_map JSON NULL,
    notes TEXT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_dp_business (business_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @has_ingredient_map = (
    SELECT COUNT(*)
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'dough_profiles'
       AND COLUMN_NAME = 'ingredient_map'
);
SET @add_ingredient_map_sql = IF(
    @has_ingredient_map = 0,
    'ALTER TABLE dough_profiles ADD COLUMN ingredient_map JSON NULL AFTER cost_per_kg',
    'SELECT 1'
);
PREPARE add_ingredient_map_stmt FROM @add_ingredient_map_sql;
EXECUTE add_ingredient_map_stmt;
DEALLOCATE PREPARE add_ingredient_map_stmt;
