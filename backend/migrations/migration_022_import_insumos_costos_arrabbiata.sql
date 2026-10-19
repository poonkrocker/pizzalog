-- =====================================================================
--  PIZZALOG · Migración 022
--  Importación de Insumos, Recetas, Costos y Fórmulas de Masa Arrabbiata
--  Generada a partir de "Calculadora de masa y costos.xlsx"
-- =====================================================================

SET NAMES utf8mb4;
SET @bid = 1; -- Negocio Pizzería Arrabbiata

-- ---------------------------------------------------------------------
-- 1) Extender product_ingredients para soportar gramajes / unidades
-- ---------------------------------------------------------------------
-- Agregar columnas si no existen
SET @dbname = DATABASE();
SET @tablename = 'product_ingredients';
SET @columnname = 'quantity';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_NAME = @tablename)
      AND (TABLE_SCHEMA = @dbname)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  'SELECT 1',
  'ALTER TABLE product_ingredients ADD COLUMN quantity DECIMAL(10,4) NULL DEFAULT NULL AFTER ingredient_id, ADD COLUMN unit VARCHAR(20) NULL DEFAULT NULL AFTER quantity'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- ---------------------------------------------------------------------
-- 2) Asegurar índice único en supplies (business_id, name)
-- ---------------------------------------------------------------------
SET @indexname = 'uq_supplies_business_name';
SET @tablename = 'supplies';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE
      (TABLE_NAME = @tablename)
      AND (TABLE_SCHEMA = @dbname)
      AND (INDEX_NAME = @indexname)
  ) > 0,
  'SELECT 1',
  'ALTER TABLE supplies ADD UNIQUE KEY uq_supplies_business_name (business_id, name)'
));
PREPARE addIndexIfNotExists FROM @preparedStatement;
EXECUTE addIndexIfNotExists;
DEALLOCATE PREPARE addIndexIfNotExists;

-- ---------------------------------------------------------------------
-- 3) Crear tabla de Perfiles de Masa (Calculadora de Amasado)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dough_profiles (
    id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id          BIGINT UNSIGNED NOT NULL,
    name                 VARCHAR(100)    NOT NULL,
    unit_weight_grams    DECIMAL(10,2)   NOT NULL DEFAULT 220.00,
    hydration_pct        DECIMAL(5,2)    NOT NULL DEFAULT 67.90,
    biga_pct             DECIMAL(5,2)    NOT NULL DEFAULT 25.00,
    biga_water_pct       DECIMAL(5,2)    NOT NULL DEFAULT 50.00,
    biga_yeast_pct       DECIMAL(6,3)    NOT NULL DEFAULT 0.500,
    poolish_pct          DECIMAL(5,2)    NOT NULL DEFAULT 0.00,
    poolish_water_pct    DECIMAL(5,2)    NOT NULL DEFAULT 100.00,
    poolish_yeast_pct    DECIMAL(6,3)    NOT NULL DEFAULT 0.000,
    direct_yeast_pct     DECIMAL(6,3)    NOT NULL DEFAULT 0.000,
    salt_pct             DECIMAL(5,2)    NOT NULL DEFAULT 2.70,
    sugar_pct            DECIMAL(5,2)    NOT NULL DEFAULT 0.00,
    oil_pct              DECIMAL(5,2)    NOT NULL DEFAULT 0.00,
    flour_white_pct      DECIMAL(5,2)    NOT NULL DEFAULT 81.75,
    flour_integral_pct   DECIMAL(5,2)    NOT NULL DEFAULT 12.17,
    flour_semola_pct     DECIMAL(5,2)    NOT NULL DEFAULT 6.08,
    cost_per_kg          DECIMAL(10,2)   NOT NULL DEFAULT 932.30,
    notes                TEXT            NULL,
    is_active            TINYINT(1)      NOT NULL DEFAULT 1,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_dough_business_name (business_id, name),
    KEY idx_dp_business (business_id),
    CONSTRAINT fk_dp_business FOREIGN KEY (business_id) REFERENCES businesses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4) Sembrar perfiles de masas estándar de Arrabbiata
-- ---------------------------------------------------------------------
INSERT INTO dough_profiles 
    (business_id, name, unit_weight_grams, hydration_pct, biga_pct, biga_water_pct, biga_yeast_pct, poolish_pct, poolish_water_pct, poolish_yeast_pct, direct_yeast_pct, salt_pct, sugar_pct, oil_pct, flour_white_pct, flour_integral_pct, flour_semola_pct, cost_per_kg, notes)
VALUES
    (@bid, 'Pizza Napolitana / Arrabbiata (Biga 25%)', 220.00, 67.90, 25.00, 50.00, 0.500, 0.00, 0.00, 0.000, 0.000, 2.70, 0.00, 0.00, 81.75, 12.17, 6.08, 932.30, 'Fórmula clásica Arrabbiata: 220g bollo, 67.9% hidr, Biga 25% con sémola e integral.'),
    (@bid, 'Pizza Napolitana (Biga 19%)', 220.00, 67.90, 19.00, 50.00, 0.500, 0.00, 0.00, 0.000, 0.000, 2.70, 0.00, 0.00, 81.75, 12.17, 6.08, 932.30, 'Variante Biga 19% para fermentaciones más lentas.'),
    (@bid, 'Pizza Napolitana (Biga 15%)', 220.00, 67.90, 15.00, 50.00, 0.500, 0.00, 0.00, 0.000, 0.000, 2.70, 0.00, 0.00, 81.75, 12.17, 6.08, 932.30, 'Variante Biga 15% para clima cálido / verano.'),
    (@bid, 'Pizza Molde Porteña 600g', 600.00, 75.30, 0.00, 0.00, 0.000, 0.00, 0.00, 0.000, 0.190, 2.30, 0.00, 0.00, 85.00, 0.00, 15.00, 900.71, 'Molde gruesa 600g: 75.3% hidratación, 15% sémola rimacinata, levadura directa 0.19%.'),
    (@bid, 'Focaccia Alta Hidratación', 330.00, 73.68, 0.00, 0.00, 0.000, 20.00, 100.00, 10.000, 0.000, 3.00, 2.00, 0.00, 100.00, 0.00, 0.00, 1001.55, 'Focaccia con Poolish 20% (100% agua, 10% levadura), 73.68% hidr, azúcar 2%, sal 3%.'),
    (@bid, 'Fainá Tradicional de Garbanzos', 185.00, 225.00, 0.00, 0.00, 0.000, 0.00, 0.00, 0.000, 0.000, 5.00, 0.00, 6.49, 0.00, 0.00, 0.00, 904.00, 'Fainá en base a 185g harina de garbanzo, 416cc agua, 9.25g sal y 12cc aceite de oliva por molde.')
ON DUPLICATE KEY UPDATE 
    unit_weight_grams = VALUES(unit_weight_grams),
    hydration_pct = VALUES(hydration_pct),
    cost_per_kg = VALUES(cost_per_kg),
    notes = VALUES(notes);

-- ---------------------------------------------------------------------
-- 5) Importar Catálogo de Insumos (supplies)
-- ---------------------------------------------------------------------
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Masa', 'Masa / Harinas', 'kg', 932.3, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Muzza', 'Lácteos / Quesos', 'kg', 10250, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Cremoso', 'Lácteos / Quesos', 'kg', 8700, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Albahaca', 'Verdulería', 'kg', 2600, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Cebolla', 'Verdulería', 'kg', 3200, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Hongos de pino', 'Despensa Secos', 'kg', 42000, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Provolone', 'Lácteos / Quesos', 'kg', 17200, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Queso azul', 'Lácteos / Quesos', 'kg', 16500, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Epicè ahumado', 'Lácteos / Quesos', 'kg', 14650, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Romero', 'Verdulería', 'kg', 2200, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Papa', 'Verdulería', 'kg', 1500, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Morrón', 'Verdulería', 'kg', 8000, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Jamón', 'Fiambres', 'kg', 18100, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Salame', 'Fiambres', 'kg', 16700, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Tomates secos', 'Despensa Secos', 'kg', 32000, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Salsa', 'Salsas', 'kg', 4200, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Ciboulette', 'Verdulería', 'kg', 2200, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Aceite de oliva', 'Aceites y Grasas', 'L', 22500, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Nueces', 'Despensa Secos', 'kg', 29000, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Harina de garbanzos', 'Masa / Harinas', 'kg', 3500, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Otros fainá (agua, sal)', 'Masa / Harinas', 'kg', 500, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Harina', 'Masa / Harinas', 'kg', 1500, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Sémola rimacinata', 'Masa / Harinas', 'kg', 1800, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Harina integral', 'Masa / Harinas', 'kg', 1640, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Levadura', 'Masa / Harinas', 'kg', 10000, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Sal', 'Despensa', 'kg', 650, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Azúcar', 'Despensa', 'kg', 1000, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Straciatella', 'Lácteos / Quesos', 'kg', 24520, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Manteca', 'Lácteos / Quesos', 'kg', 10500, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Mayonesa', 'Despensa', 'kg', 5000, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Queso Morbier', 'Lácteos / Quesos', 'kg', 12840, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Pera', 'Verdulería', 'kg', 3000, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Tomate', 'Verdulería', 'kg', 3000, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Anchoas', 'Conservas', 'u', 458.33, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;
INSERT INTO supplies (business_id, name, category, unit, cost, is_active)
VALUES (@bid, 'Reggianito', 'Lácteos / Quesos', 'kg', 16500, 1)
ON DUPLICATE KEY UPDATE cost = VALUES(cost), unit = VALUES(unit), category = VALUES(category), is_active = 1;

-- ---------------------------------------------------------------------
-- 6) Importar Catálogo de Ingredientes Canónicos (ingredients)
-- ---------------------------------------------------------------------
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Masa', 'masa', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Muzza', 'queso', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Cremoso', 'queso', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Albahaca', 'vegetal', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Cebolla', 'vegetal', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Hongos de pino', 'vegetal', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Provolone', 'queso', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Queso azul', 'queso', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Epicè ahumado', 'queso', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Romero', 'vegetal', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Papa', 'vegetal', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Morrón', 'vegetal', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Jamón', 'fiambre', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Salame', 'fiambre', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Tomates secos', 'vegetal', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Salsa', 'salsa', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Ciboulette', 'vegetal', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Aceite de oliva', 'condimento', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Nueces', 'vegetal', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Harina de garbanzos', 'masa', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Otros fainá (agua, sal)', 'masa', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Harina', 'masa', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Sémola rimacinata', 'masa', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Harina integral', 'masa', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Levadura', 'masa', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Sal', 'condimento', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Azúcar', 'condimento', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Straciatella', 'queso', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Manteca', 'condimento', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Mayonesa', 'condimento', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Queso Morbier', 'queso', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Pera', 'fruta', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Tomate', 'vegetal', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Anchoas', 'fiambre', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;
INSERT INTO ingredients (business_id, name, category, is_active)
VALUES (@bid, 'Reggianito', 'queso', 1)
ON DUPLICATE KEY UPDATE category = VALUES(category), is_active = 1;

-- ---------------------------------------------------------------------
-- 7) Categorías de Productos
-- ---------------------------------------------------------------------
INSERT INTO categories (business_id, name, is_active)
SELECT @bid, 'Pizza', 1
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE business_id = @bid AND name = 'Pizza')
LIMIT 1;

INSERT INTO categories (business_id, name, is_active)
SELECT @bid, 'Sandwiches', 1
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE business_id = @bid AND name = 'Sandwiches')
LIMIT 1;

INSERT INTO categories (business_id, name, is_active)
SELECT @bid, 'Focaccia', 1
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE business_id = @bid AND name = 'Focaccia')
LIMIT 1;

INSERT INTO categories (business_id, name, is_active)
SELECT @bid, 'Pizzas Especiales', 1
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE business_id = @bid AND name = 'Pizzas Especiales')
LIMIT 1;

INSERT INTO categories (business_id, name, is_active)
SELECT @bid, 'Extras', 1
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE business_id = @bid AND name = 'Extras')
LIMIT 1;

INSERT INTO categories (business_id, name, is_active)
SELECT @bid, 'Fainá', 1
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE business_id = @bid AND name = 'Fainá')
LIMIT 1;

-- ---------------------------------------------------------------------
-- 8) Actualizar / Insertar Productos y Escandallos
-- ---------------------------------------------------------------------

-- --- Margherita ---
UPDATE products 
   SET cost = 2112.25, price = IF(price = 0, 13000, price)
 WHERE business_id = @bid 
   AND (name = 'Margherita' OR name = 'Pizza Margherita' OR name = 'Margarita' OR name = 'Margherita');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Margherita', 13000, 2112.25, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Pizza'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Margherita' OR p.name = 'Pizza Margherita' OR p.name = 'Margarita' OR p.name = 'Margherita')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.22, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Margherita' OR p.name = 'Pizza Margherita' OR p.name = 'Margarita' OR p.name = 'Margherita')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.1, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Muzza'
WHERE p.business_id = @bid 
  AND (p.name = 'Margherita' OR p.name = 'Pizza Margherita' OR p.name = 'Margarita' OR p.name = 'Margherita')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.07, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Albahaca'
WHERE p.business_id = @bid 
  AND (p.name = 'Margherita' OR p.name = 'Pizza Margherita' OR p.name = 'Margarita' OR p.name = 'Margherita')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.1667, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Salsa'
WHERE p.business_id = @bid 
  AND (p.name = 'Margherita' OR p.name = 'Pizza Margherita' OR p.name = 'Margarita' OR p.name = 'Margherita')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Cipollina ---
UPDATE products 
   SET cost = 2244.25, price = IF(price = 0, 14000, price)
 WHERE business_id = @bid 
   AND (name = 'Cipollina' OR name = 'Pizza Cipollina' OR name = 'Cipollina' OR name = 'Cipollina');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Cipollina', 14000, 2244.25, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Pizza'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Cipollina' OR p.name = 'Pizza Cipollina' OR p.name = 'Cipollina' OR p.name = 'Cipollina')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.22, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Cipollina' OR p.name = 'Pizza Cipollina' OR p.name = 'Cipollina' OR p.name = 'Cipollina')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.1, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Muzza'
WHERE p.business_id = @bid 
  AND (p.name = 'Cipollina' OR p.name = 'Pizza Cipollina' OR p.name = 'Cipollina' OR p.name = 'Cipollina')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.05, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Cebolla'
WHERE p.business_id = @bid 
  AND (p.name = 'Cipollina' OR p.name = 'Pizza Cipollina' OR p.name = 'Cipollina' OR p.name = 'Cipollina')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.1667, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Salsa'
WHERE p.business_id = @bid 
  AND (p.name = 'Cipollina' OR p.name = 'Pizza Cipollina' OR p.name = 'Cipollina' OR p.name = 'Cipollina')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.07, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Ciboulette'
WHERE p.business_id = @bid 
  AND (p.name = 'Cipollina' OR p.name = 'Pizza Cipollina' OR p.name = 'Cipollina' OR p.name = 'Cipollina')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Genovesa ---
UPDATE products 
   SET cost = 2497.11, price = IF(price = 0, 14000, price)
 WHERE business_id = @bid 
   AND (name = 'Genovesa' OR name = 'Pizza Genovesa' OR name = 'Genovesa' OR name = 'Genovesa');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Genovesa', 14000, 2497.11, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Pizza'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Genovesa' OR p.name = 'Pizza Genovesa' OR p.name = 'Genovesa' OR p.name = 'Genovesa')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.22, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Genovesa' OR p.name = 'Pizza Genovesa' OR p.name = 'Genovesa' OR p.name = 'Genovesa')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.1, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Muzza'
WHERE p.business_id = @bid 
  AND (p.name = 'Genovesa' OR p.name = 'Pizza Genovesa' OR p.name = 'Genovesa' OR p.name = 'Genovesa')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.05, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Albahaca'
WHERE p.business_id = @bid 
  AND (p.name = 'Genovesa' OR p.name = 'Pizza Genovesa' OR p.name = 'Genovesa' OR p.name = 'Genovesa')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.01, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Provolone'
WHERE p.business_id = @bid 
  AND (p.name = 'Genovesa' OR p.name = 'Pizza Genovesa' OR p.name = 'Genovesa' OR p.name = 'Genovesa')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.03, 'L'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Aceite de oliva'
WHERE p.business_id = @bid 
  AND (p.name = 'Genovesa' OR p.name = 'Pizza Genovesa' OR p.name = 'Genovesa' OR p.name = 'Genovesa')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.01, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Nueces'
WHERE p.business_id = @bid 
  AND (p.name = 'Genovesa' OR p.name = 'Pizza Genovesa' OR p.name = 'Genovesa' OR p.name = 'Genovesa')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Pineta ---
UPDATE products 
   SET cost = 2770.25, price = IF(price = 0, 14000, price)
 WHERE business_id = @bid 
   AND (name = 'Pineta' OR name = 'Pizza Pineta' OR name = 'Pineta' OR name = 'Pineta');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Pineta', 14000, 2770.25, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Pizza'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Pineta' OR p.name = 'Pizza Pineta' OR p.name = 'Pineta' OR p.name = 'Pineta')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.22, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Pineta' OR p.name = 'Pizza Pineta' OR p.name = 'Pineta' OR p.name = 'Pineta')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.1, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Muzza'
WHERE p.business_id = @bid 
  AND (p.name = 'Pineta' OR p.name = 'Pizza Pineta' OR p.name = 'Pineta' OR p.name = 'Pineta')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.02, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Hongos de pino'
WHERE p.business_id = @bid 
  AND (p.name = 'Pineta' OR p.name = 'Pizza Pineta' OR p.name = 'Pineta' OR p.name = 'Pineta')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.1667, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Salsa'
WHERE p.business_id = @bid 
  AND (p.name = 'Pineta' OR p.name = 'Pizza Pineta' OR p.name = 'Pineta' OR p.name = 'Pineta')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Romerina ---
UPDATE products 
   SET cost = 2316.11, price = IF(price = 0, 15000, price)
 WHERE business_id = @bid 
   AND (name = 'Romerina' OR name = 'Pizza Romerina' OR name = 'Romerina' OR name = 'Romerina');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Romerina', 15000, 2316.11, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Pizza'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Romerina' OR p.name = 'Pizza Romerina' OR p.name = 'Romerina' OR p.name = 'Romerina')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.22, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Romerina' OR p.name = 'Pizza Romerina' OR p.name = 'Romerina' OR p.name = 'Romerina')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.1, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Muzza'
WHERE p.business_id = @bid 
  AND (p.name = 'Romerina' OR p.name = 'Pizza Romerina' OR p.name = 'Romerina' OR p.name = 'Romerina')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.03, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Provolone'
WHERE p.business_id = @bid 
  AND (p.name = 'Romerina' OR p.name = 'Pizza Romerina' OR p.name = 'Romerina' OR p.name = 'Romerina')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.15, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Romero'
WHERE p.business_id = @bid 
  AND (p.name = 'Romerina' OR p.name = 'Pizza Romerina' OR p.name = 'Romerina' OR p.name = 'Romerina')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.16, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Papa'
WHERE p.business_id = @bid 
  AND (p.name = 'Romerina' OR p.name = 'Pizza Romerina' OR p.name = 'Romerina' OR p.name = 'Romerina')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Quattro ---
UPDATE products 
   SET cost = 3020.61, price = IF(price = 0, 15000, price)
 WHERE business_id = @bid 
   AND (name = 'Quattro' OR name = 'Pizza Quattro' OR name = 'Quattro' OR name = 'Quattro');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Quattro', 15000, 3020.61, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Pizza'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Quattro' OR p.name = 'Pizza Quattro' OR p.name = 'Quattro' OR p.name = 'Quattro')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.22, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Quattro' OR p.name = 'Pizza Quattro' OR p.name = 'Quattro' OR p.name = 'Quattro')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.1, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Muzza'
WHERE p.business_id = @bid 
  AND (p.name = 'Quattro' OR p.name = 'Pizza Quattro' OR p.name = 'Quattro' OR p.name = 'Quattro')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.07, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Albahaca'
WHERE p.business_id = @bid 
  AND (p.name = 'Quattro' OR p.name = 'Pizza Quattro' OR p.name = 'Quattro' OR p.name = 'Quattro')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.02, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Provolone'
WHERE p.business_id = @bid 
  AND (p.name = 'Quattro' OR p.name = 'Pizza Quattro' OR p.name = 'Quattro' OR p.name = 'Quattro')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.05, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Queso azul'
WHERE p.business_id = @bid 
  AND (p.name = 'Quattro' OR p.name = 'Pizza Quattro' OR p.name = 'Quattro' OR p.name = 'Quattro')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.03, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Epicè ahumado'
WHERE p.business_id = @bid 
  AND (p.name = 'Quattro' OR p.name = 'Pizza Quattro' OR p.name = 'Quattro' OR p.name = 'Quattro')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Pucheta ---
UPDATE products 
   SET cost = 2022.61
 WHERE business_id = @bid 
   AND (name = 'Pucheta' OR name = 'Pizza Pucheta' OR name = 'Pucheta' OR name = 'Pucheta');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Pucheta', 0, 2022.61, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Pizza'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Pucheta' OR p.name = 'Pizza Pucheta' OR p.name = 'Pucheta' OR p.name = 'Pucheta')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.22, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Pucheta' OR p.name = 'Pizza Pucheta' OR p.name = 'Pucheta' OR p.name = 'Pucheta')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.1, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Muzza'
WHERE p.business_id = @bid 
  AND (p.name = 'Pucheta' OR p.name = 'Pizza Pucheta' OR p.name = 'Pucheta' OR p.name = 'Pucheta')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.025, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Queso azul'
WHERE p.business_id = @bid 
  AND (p.name = 'Pucheta' OR p.name = 'Pizza Pucheta' OR p.name = 'Pucheta' OR p.name = 'Pucheta')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.01, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Nueces'
WHERE p.business_id = @bid 
  AND (p.name = 'Pucheta' OR p.name = 'Pizza Pucheta' OR p.name = 'Pucheta' OR p.name = 'Pucheta')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.03, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Pera'
WHERE p.business_id = @bid 
  AND (p.name = 'Pucheta' OR p.name = 'Pizza Pucheta' OR p.name = 'Pucheta' OR p.name = 'Pucheta')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Especial ---
UPDATE products 
   SET cost = 2692.25, price = IF(price = 0, 15000, price)
 WHERE business_id = @bid 
   AND (name = 'Especial' OR name = 'Pizza Especial' OR name = 'Especial' OR name = 'Especial');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Especial', 15000, 2692.25, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Pizza'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Especial' OR p.name = 'Pizza Especial' OR p.name = 'Especial' OR p.name = 'Especial')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.22, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Especial' OR p.name = 'Pizza Especial' OR p.name = 'Especial' OR p.name = 'Especial')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.1, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Muzza'
WHERE p.business_id = @bid 
  AND (p.name = 'Especial' OR p.name = 'Pizza Especial' OR p.name = 'Especial' OR p.name = 'Especial')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.05, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Morrón'
WHERE p.business_id = @bid 
  AND (p.name = 'Especial' OR p.name = 'Pizza Especial' OR p.name = 'Especial' OR p.name = 'Especial')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.02, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Jamón'
WHERE p.business_id = @bid 
  AND (p.name = 'Especial' OR p.name = 'Pizza Especial' OR p.name = 'Especial' OR p.name = 'Especial')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.1667, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Salsa'
WHERE p.business_id = @bid 
  AND (p.name = 'Especial' OR p.name = 'Pizza Especial' OR p.name = 'Especial' OR p.name = 'Especial')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Arrabbiata ---
UPDATE products 
   SET cost = 3115.65, price = IF(price = 0, 15000, price)
 WHERE business_id = @bid 
   AND (name = 'Arrabbiata' OR name = 'Pizza Arrabbiata' OR name = 'Arrabbiata' OR name = 'Arrabbiata');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Arrabbiata', 15000, 3115.65, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Pizza'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Arrabbiata' OR p.name = 'Pizza Arrabbiata' OR p.name = 'Arrabbiata' OR p.name = 'Arrabbiata')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.22, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Arrabbiata' OR p.name = 'Pizza Arrabbiata' OR p.name = 'Arrabbiata' OR p.name = 'Arrabbiata')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.1, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Muzza'
WHERE p.business_id = @bid 
  AND (p.name = 'Arrabbiata' OR p.name = 'Pizza Arrabbiata' OR p.name = 'Arrabbiata' OR p.name = 'Arrabbiata')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.022, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Provolone'
WHERE p.business_id = @bid 
  AND (p.name = 'Arrabbiata' OR p.name = 'Pizza Arrabbiata' OR p.name = 'Arrabbiata' OR p.name = 'Arrabbiata')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.01, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Salame'
WHERE p.business_id = @bid 
  AND (p.name = 'Arrabbiata' OR p.name = 'Pizza Arrabbiata' OR p.name = 'Arrabbiata' OR p.name = 'Arrabbiata')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.02, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Tomates secos'
WHERE p.business_id = @bid 
  AND (p.name = 'Arrabbiata' OR p.name = 'Pizza Arrabbiata' OR p.name = 'Arrabbiata' OR p.name = 'Arrabbiata')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.1667, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Salsa'
WHERE p.business_id = @bid 
  AND (p.name = 'Arrabbiata' OR p.name = 'Pizza Arrabbiata' OR p.name = 'Arrabbiata' OR p.name = 'Arrabbiata')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Napolitana ---
UPDATE products 
   SET cost = 2291.51
 WHERE business_id = @bid 
   AND (name = 'Napolitana' OR name = 'Pizza Napolitana' OR name = 'Napolitana' OR name = 'Napolitana');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Napolitana', 0, 2291.51, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Pizza'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Napolitana' OR p.name = 'Pizza Napolitana' OR p.name = 'Napolitana' OR p.name = 'Napolitana')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.22, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Napolitana' OR p.name = 'Pizza Napolitana' OR p.name = 'Napolitana' OR p.name = 'Napolitana')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.1, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Muzza'
WHERE p.business_id = @bid 
  AND (p.name = 'Napolitana' OR p.name = 'Pizza Napolitana' OR p.name = 'Napolitana' OR p.name = 'Napolitana')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.167, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Salsa'
WHERE p.business_id = @bid 
  AND (p.name = 'Napolitana' OR p.name = 'Pizza Napolitana' OR p.name = 'Napolitana' OR p.name = 'Napolitana')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.12, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Tomate'
WHERE p.business_id = @bid 
  AND (p.name = 'Napolitana' OR p.name = 'Pizza Napolitana' OR p.name = 'Napolitana' OR p.name = 'Napolitana')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Fugazzeta ---
UPDATE products 
   SET cost = 2268.86
 WHERE business_id = @bid 
   AND (name = 'Fugazzeta' OR name = 'Pizza Fugazzeta' OR name = 'Fugazzeta' OR name = 'Fugazzeta');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Fugazzeta', 0, 2268.86, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Pizza'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Fugazzeta' OR p.name = 'Pizza Fugazzeta' OR p.name = 'Fugazzeta' OR p.name = 'Fugazzeta')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.22, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Fugazzeta' OR p.name = 'Pizza Fugazzeta' OR p.name = 'Fugazzeta' OR p.name = 'Fugazzeta')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.1, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Muzza'
WHERE p.business_id = @bid 
  AND (p.name = 'Fugazzeta' OR p.name = 'Pizza Fugazzeta' OR p.name = 'Fugazzeta' OR p.name = 'Fugazzeta')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.05, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Cremoso'
WHERE p.business_id = @bid 
  AND (p.name = 'Fugazzeta' OR p.name = 'Pizza Fugazzeta' OR p.name = 'Fugazzeta' OR p.name = 'Fugazzeta')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.12, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Cebolla'
WHERE p.business_id = @bid 
  AND (p.name = 'Fugazzeta' OR p.name = 'Pizza Fugazzeta' OR p.name = 'Fugazzeta' OR p.name = 'Fugazzeta')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.015, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Epicè ahumado'
WHERE p.business_id = @bid 
  AND (p.name = 'Fugazzeta' OR p.name = 'Pizza Fugazzeta' OR p.name = 'Fugazzeta' OR p.name = 'Fugazzeta')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Fugazzeta con queso azul ---
UPDATE products 
   SET cost = 2681.36
 WHERE business_id = @bid 
   AND (name = 'Fugazzeta con queso azul' OR name = 'Pizza Fugazzeta con queso azul' OR name = 'Fugazzeta con queso azul' OR name = 'Fugazzeta con queso azul');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Fugazzeta con queso azul', 0, 2681.36, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Pizza'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Fugazzeta con queso azul' OR p.name = 'Pizza Fugazzeta con queso azul' OR p.name = 'Fugazzeta con queso azul' OR p.name = 'Fugazzeta con queso azul')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.22, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Fugazzeta con queso azul' OR p.name = 'Pizza Fugazzeta con queso azul' OR p.name = 'Fugazzeta con queso azul' OR p.name = 'Fugazzeta con queso azul')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.1, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Muzza'
WHERE p.business_id = @bid 
  AND (p.name = 'Fugazzeta con queso azul' OR p.name = 'Pizza Fugazzeta con queso azul' OR p.name = 'Fugazzeta con queso azul' OR p.name = 'Fugazzeta con queso azul')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.05, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Cremoso'
WHERE p.business_id = @bid 
  AND (p.name = 'Fugazzeta con queso azul' OR p.name = 'Pizza Fugazzeta con queso azul' OR p.name = 'Fugazzeta con queso azul' OR p.name = 'Fugazzeta con queso azul')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.12, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Cebolla'
WHERE p.business_id = @bid 
  AND (p.name = 'Fugazzeta con queso azul' OR p.name = 'Pizza Fugazzeta con queso azul' OR p.name = 'Fugazzeta con queso azul' OR p.name = 'Fugazzeta con queso azul')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.025, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Queso azul'
WHERE p.business_id = @bid 
  AND (p.name = 'Fugazzeta con queso azul' OR p.name = 'Pizza Fugazzeta con queso azul' OR p.name = 'Fugazzeta con queso azul' OR p.name = 'Fugazzeta con queso azul')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.015, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Epicè ahumado'
WHERE p.business_id = @bid 
  AND (p.name = 'Fugazzeta con queso azul' OR p.name = 'Pizza Fugazzeta con queso azul' OR p.name = 'Fugazzeta con queso azul' OR p.name = 'Fugazzeta con queso azul')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Marinara ---
UPDATE products 
   SET cost = 1045.11
 WHERE business_id = @bid 
   AND (name = 'Marinara' OR name = 'Pizza Marinara' OR name = 'Marinara' OR name = 'Marinara');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Marinara', 0, 1045.11, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Pizza'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Marinara' OR p.name = 'Pizza Marinara' OR p.name = 'Marinara' OR p.name = 'Marinara')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.22, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Marinara' OR p.name = 'Pizza Marinara' OR p.name = 'Marinara' OR p.name = 'Marinara')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.2, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Salsa'
WHERE p.business_id = @bid 
  AND (p.name = 'Marinara' OR p.name = 'Pizza Marinara' OR p.name = 'Marinara' OR p.name = 'Marinara')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Pizzilante ---
UPDATE products 
   SET cost = 205.11
 WHERE business_id = @bid 
   AND (name = 'Pizzilante' OR name = 'Pizza Pizzilante' OR name = 'Pizzilante' OR name = 'Pizzilante');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Pizzilante', 0, 205.11, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Pizza'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Pizzilante' OR p.name = 'Pizza Pizzilante' OR p.name = 'Pizzilante' OR p.name = 'Pizzilante')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.22, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Pizzilante' OR p.name = 'Pizza Pizzilante' OR p.name = 'Pizzilante' OR p.name = 'Pizzilante')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Sandwich de jamón y queso Morbier ---
UPDATE products 
   SET cost = 1955.55, price = IF(price = 0, 8000, price)
 WHERE business_id = @bid 
   AND (name = 'Sandwich de jamón y queso Morbier' OR name = 'Pizza Sandwich de jamón y queso Morbier' OR name = 'Sandwich de jamón y queso Morbier' OR name = 'Sandwich de jamón y queso Morbier');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Sandwich de jamón y queso Morbier', 8000, 1955.55, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Sandwiches'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Sandwich de jamón y queso Morbier' OR p.name = 'Pizza Sandwich de jamón y queso Morbier' OR p.name = 'Sandwich de jamón y queso Morbier' OR p.name = 'Sandwich de jamón y queso Morbier')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.11, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Sandwich de jamón y queso Morbier' OR p.name = 'Pizza Sandwich de jamón y queso Morbier' OR p.name = 'Sandwich de jamón y queso Morbier' OR p.name = 'Sandwich de jamón y queso Morbier')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.06, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Jamón'
WHERE p.business_id = @bid 
  AND (p.name = 'Sandwich de jamón y queso Morbier' OR p.name = 'Pizza Sandwich de jamón y queso Morbier' OR p.name = 'Sandwich de jamón y queso Morbier' OR p.name = 'Sandwich de jamón y queso Morbier')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.025, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Mayonesa'
WHERE p.business_id = @bid 
  AND (p.name = 'Sandwich de jamón y queso Morbier' OR p.name = 'Pizza Sandwich de jamón y queso Morbier' OR p.name = 'Sandwich de jamón y queso Morbier' OR p.name = 'Sandwich de jamón y queso Morbier')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.05, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Queso Morbier'
WHERE p.business_id = @bid 
  AND (p.name = 'Sandwich de jamón y queso Morbier' OR p.name = 'Pizza Sandwich de jamón y queso Morbier' OR p.name = 'Sandwich de jamón y queso Morbier' OR p.name = 'Sandwich de jamón y queso Morbier')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Sandwich de salame ---
UPDATE products 
   SET cost = 1880.05, price = IF(price = 0, 7500, price)
 WHERE business_id = @bid 
   AND (name = 'Sandwich de salame' OR name = 'Pizza Sandwich de salame' OR name = 'Sandwich de salame' OR name = 'Sandwich de salame');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Sandwich de salame', 7500, 1880.05, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Sandwiches'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Sandwich de salame' OR p.name = 'Pizza Sandwich de salame' OR p.name = 'Sandwich de salame' OR p.name = 'Sandwich de salame')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.11, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Sandwich de salame' OR p.name = 'Pizza Sandwich de salame' OR p.name = 'Sandwich de salame' OR p.name = 'Sandwich de salame')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.05, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Epicè ahumado'
WHERE p.business_id = @bid 
  AND (p.name = 'Sandwich de salame' OR p.name = 'Pizza Sandwich de salame' OR p.name = 'Sandwich de salame' OR p.name = 'Sandwich de salame')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.05, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Salame'
WHERE p.business_id = @bid 
  AND (p.name = 'Sandwich de salame' OR p.name = 'Pizza Sandwich de salame' OR p.name = 'Sandwich de salame' OR p.name = 'Sandwich de salame')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.02, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Manteca'
WHERE p.business_id = @bid 
  AND (p.name = 'Sandwich de salame' OR p.name = 'Pizza Sandwich de salame' OR p.name = 'Sandwich de salame' OR p.name = 'Sandwich de salame')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Sandwich de salame y stracciatella ---
UPDATE products 
   SET cost = 2434.75, price = IF(price = 0, 9000, price)
 WHERE business_id = @bid 
   AND (name = 'Sandwich de salame y stracciatella' OR name = 'Pizza Sandwich de salame y stracciatella' OR name = 'Sandwich de salame y stracciatella' OR name = 'Sandwich de salame y stracciatella');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Sandwich de salame y stracciatella', 9000, 2434.75, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Sandwiches'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Sandwich de salame y stracciatella' OR p.name = 'Pizza Sandwich de salame y stracciatella' OR p.name = 'Sandwich de salame y stracciatella' OR p.name = 'Sandwich de salame y stracciatella')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.11, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Sandwich de salame y stracciatella' OR p.name = 'Pizza Sandwich de salame y stracciatella' OR p.name = 'Sandwich de salame y stracciatella' OR p.name = 'Sandwich de salame y stracciatella')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.01, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Albahaca'
WHERE p.business_id = @bid 
  AND (p.name = 'Sandwich de salame y stracciatella' OR p.name = 'Pizza Sandwich de salame y stracciatella' OR p.name = 'Sandwich de salame y stracciatella' OR p.name = 'Sandwich de salame y stracciatella')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.05, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Salame'
WHERE p.business_id = @bid 
  AND (p.name = 'Sandwich de salame y stracciatella' OR p.name = 'Pizza Sandwich de salame y stracciatella' OR p.name = 'Sandwich de salame y stracciatella' OR p.name = 'Sandwich de salame y stracciatella')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.06, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Straciatella'
WHERE p.business_id = @bid 
  AND (p.name = 'Sandwich de salame y stracciatella' OR p.name = 'Pizza Sandwich de salame y stracciatella' OR p.name = 'Sandwich de salame y stracciatella' OR p.name = 'Sandwich de salame y stracciatella')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Sandwich Pucheta ---
UPDATE products 
   SET cost = 2563.75, price = IF(price = 0, 9000, price)
 WHERE business_id = @bid 
   AND (name = 'Sandwich Pucheta' OR name = 'Pizza Sandwich Pucheta' OR name = 'Sandwich Pucheta' OR name = 'Sandwich Pucheta');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Sandwich Pucheta', 9000, 2563.75, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Sandwiches'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Sandwich Pucheta' OR p.name = 'Pizza Sandwich Pucheta' OR p.name = 'Sandwich Pucheta' OR p.name = 'Sandwich Pucheta')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.11, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Sandwich Pucheta' OR p.name = 'Pizza Sandwich Pucheta' OR p.name = 'Sandwich Pucheta' OR p.name = 'Sandwich Pucheta')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.015, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Queso azul'
WHERE p.business_id = @bid 
  AND (p.name = 'Sandwich Pucheta' OR p.name = 'Pizza Sandwich Pucheta' OR p.name = 'Sandwich Pucheta' OR p.name = 'Sandwich Pucheta')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.015, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Nueces'
WHERE p.business_id = @bid 
  AND (p.name = 'Sandwich Pucheta' OR p.name = 'Pizza Sandwich Pucheta' OR p.name = 'Sandwich Pucheta' OR p.name = 'Sandwich Pucheta')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.06, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Straciatella'
WHERE p.business_id = @bid 
  AND (p.name = 'Sandwich Pucheta' OR p.name = 'Pizza Sandwich Pucheta' OR p.name = 'Sandwich Pucheta' OR p.name = 'Sandwich Pucheta')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.015, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Manteca'
WHERE p.business_id = @bid 
  AND (p.name = 'Sandwich Pucheta' OR p.name = 'Pizza Sandwich Pucheta' OR p.name = 'Sandwich Pucheta' OR p.name = 'Sandwich Pucheta')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.05, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Pera'
WHERE p.business_id = @bid 
  AND (p.name = 'Sandwich Pucheta' OR p.name = 'Pizza Sandwich Pucheta' OR p.name = 'Sandwich Pucheta' OR p.name = 'Sandwich Pucheta')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Muzza teglia ---
UPDATE products 
   SET cost = 10214.99, price = IF(price = 0, 44000, price)
 WHERE business_id = @bid 
   AND (name = 'Muzza teglia' OR name = 'Pizza Muzza teglia' OR name = 'Muzza teglia' OR name = 'Muzza teglia');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Muzza teglia', 44000, 10214.99, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Pizzas Especiales'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Muzza teglia' OR p.name = 'Pizza Muzza teglia' OR p.name = 'Muzza teglia' OR p.name = 'Muzza teglia')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 1.3, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Muzza teglia' OR p.name = 'Pizza Muzza teglia' OR p.name = 'Muzza teglia' OR p.name = 'Muzza teglia')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.5, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Muzza'
WHERE p.business_id = @bid 
  AND (p.name = 'Muzza teglia' OR p.name = 'Pizza Muzza teglia' OR p.name = 'Muzza teglia' OR p.name = 'Muzza teglia')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.28, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Albahaca'
WHERE p.business_id = @bid 
  AND (p.name = 'Muzza teglia' OR p.name = 'Pizza Muzza teglia' OR p.name = 'Muzza teglia' OR p.name = 'Muzza teglia')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.75, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Salsa'
WHERE p.business_id = @bid 
  AND (p.name = 'Muzza teglia' OR p.name = 'Pizza Muzza teglia' OR p.name = 'Muzza teglia' OR p.name = 'Muzza teglia')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Muzza Romana ---
UPDATE products 
   SET cost = 7221.68, price = IF(price = 0, 35000, price)
 WHERE business_id = @bid 
   AND (name = 'Muzza Romana' OR name = 'Pizza Muzza Romana' OR name = 'Muzza Romana' OR name = 'Muzza Romana');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Muzza Romana', 35000, 7221.68, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Pizzas Especiales'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Muzza Romana' OR p.name = 'Pizza Muzza Romana' OR p.name = 'Muzza Romana' OR p.name = 'Muzza Romana')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.95, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Muzza Romana' OR p.name = 'Pizza Muzza Romana' OR p.name = 'Muzza Romana' OR p.name = 'Muzza Romana')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.36, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Muzza'
WHERE p.business_id = @bid 
  AND (p.name = 'Muzza Romana' OR p.name = 'Pizza Muzza Romana' OR p.name = 'Muzza Romana' OR p.name = 'Muzza Romana')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.21, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Albahaca'
WHERE p.business_id = @bid 
  AND (p.name = 'Muzza Romana' OR p.name = 'Pizza Muzza Romana' OR p.name = 'Muzza Romana' OR p.name = 'Muzza Romana')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.5, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Salsa'
WHERE p.business_id = @bid 
  AND (p.name = 'Muzza Romana' OR p.name = 'Pizza Muzza Romana' OR p.name = 'Muzza Romana' OR p.name = 'Muzza Romana')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Fainá ---
UPDATE products 
   SET cost = 904, price = IF(price = 0, 18000, price)
 WHERE business_id = @bid 
   AND (name = 'Fainá' OR name = 'Pizza Fainá' OR name = 'Fainá' OR name = 'Fainá');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Fainá', 18000, 904, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Fainá'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Fainá' OR p.name = 'Pizza Fainá' OR p.name = 'Fainá' OR p.name = 'Fainá')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.012, 'L'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Aceite de oliva'
WHERE p.business_id = @bid 
  AND (p.name = 'Fainá' OR p.name = 'Pizza Fainá' OR p.name = 'Fainá' OR p.name = 'Fainá')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.18, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Harina de garbanzos'
WHERE p.business_id = @bid 
  AND (p.name = 'Fainá' OR p.name = 'Pizza Fainá' OR p.name = 'Fainá' OR p.name = 'Fainá')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.008, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Otros fainá (agua, sal)'
WHERE p.business_id = @bid 
  AND (p.name = 'Fainá' OR p.name = 'Pizza Fainá' OR p.name = 'Fainá' OR p.name = 'Fainá')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Muzza Porteña 32cm ---
UPDATE products 
   SET cost = 4557.27, price = IF(price = 0, 20000, price)
 WHERE business_id = @bid 
   AND (name = 'Muzza Porteña 32cm' OR name = 'Pizza Muzza Porteña 32cm' OR name = 'Muzza Porteña 32cm' OR name = 'Muzza Porteña 32cm');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Muzza Porteña 32cm', 20000, 4557.27, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Pizzas Especiales'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Muzza Porteña 32cm' OR p.name = 'Pizza Muzza Porteña 32cm' OR p.name = 'Muzza Porteña 32cm' OR p.name = 'Muzza Porteña 32cm')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.38, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Muzza Porteña 32cm' OR p.name = 'Pizza Muzza Porteña 32cm' OR p.name = 'Muzza Porteña 32cm' OR p.name = 'Muzza Porteña 32cm')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.3, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Muzza'
WHERE p.business_id = @bid 
  AND (p.name = 'Muzza Porteña 32cm' OR p.name = 'Pizza Muzza Porteña 32cm' OR p.name = 'Muzza Porteña 32cm' OR p.name = 'Muzza Porteña 32cm')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.03, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Albahaca'
WHERE p.business_id = @bid 
  AND (p.name = 'Muzza Porteña 32cm' OR p.name = 'Pizza Muzza Porteña 32cm' OR p.name = 'Muzza Porteña 32cm' OR p.name = 'Muzza Porteña 32cm')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.25, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Salsa'
WHERE p.business_id = @bid 
  AND (p.name = 'Muzza Porteña 32cm' OR p.name = 'Pizza Muzza Porteña 32cm' OR p.name = 'Muzza Porteña 32cm' OR p.name = 'Muzza Porteña 32cm')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Especial porteña ---
UPDATE products 
   SET cost = 6344.27, price = IF(price = 0, 25000, price)
 WHERE business_id = @bid 
   AND (name = 'Especial porteña' OR name = 'Pizza Especial porteña' OR name = 'Especial porteña' OR name = 'Especial porteña');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Especial porteña', 25000, 6344.27, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Pizzas Especiales'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Especial porteña' OR p.name = 'Pizza Especial porteña' OR p.name = 'Especial porteña' OR p.name = 'Especial porteña')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.38, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Especial porteña' OR p.name = 'Pizza Especial porteña' OR p.name = 'Especial porteña' OR p.name = 'Especial porteña')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.3, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Muzza'
WHERE p.business_id = @bid 
  AND (p.name = 'Especial porteña' OR p.name = 'Pizza Especial porteña' OR p.name = 'Especial porteña' OR p.name = 'Especial porteña')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.12, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Morrón'
WHERE p.business_id = @bid 
  AND (p.name = 'Especial porteña' OR p.name = 'Pizza Especial porteña' OR p.name = 'Especial porteña' OR p.name = 'Especial porteña')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.05, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Jamón'
WHERE p.business_id = @bid 
  AND (p.name = 'Especial porteña' OR p.name = 'Pizza Especial porteña' OR p.name = 'Especial porteña' OR p.name = 'Especial porteña')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.25, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Salsa'
WHERE p.business_id = @bid 
  AND (p.name = 'Especial porteña' OR p.name = 'Pizza Especial porteña' OR p.name = 'Especial porteña' OR p.name = 'Especial porteña')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Muzza Porteña 36cm ---
UPDATE products 
   SET cost = 6202.38, price = IF(price = 0, 32000, price)
 WHERE business_id = @bid 
   AND (name = 'Muzza Porteña 36cm' OR name = 'Pizza Muzza Porteña 36cm' OR name = 'Muzza Porteña 36cm' OR name = 'Muzza Porteña 36cm');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Muzza Porteña 36cm', 32000, 6202.38, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Pizzas Especiales'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Muzza Porteña 36cm' OR p.name = 'Pizza Muzza Porteña 36cm' OR p.name = 'Muzza Porteña 36cm' OR p.name = 'Muzza Porteña 36cm')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.6, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Muzza Porteña 36cm' OR p.name = 'Pizza Muzza Porteña 36cm' OR p.name = 'Muzza Porteña 36cm' OR p.name = 'Muzza Porteña 36cm')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.42, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Muzza'
WHERE p.business_id = @bid 
  AND (p.name = 'Muzza Porteña 36cm' OR p.name = 'Pizza Muzza Porteña 36cm' OR p.name = 'Muzza Porteña 36cm' OR p.name = 'Muzza Porteña 36cm')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.03, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Albahaca'
WHERE p.business_id = @bid 
  AND (p.name = 'Muzza Porteña 36cm' OR p.name = 'Pizza Muzza Porteña 36cm' OR p.name = 'Muzza Porteña 36cm' OR p.name = 'Muzza Porteña 36cm')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.3, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Salsa'
WHERE p.business_id = @bid 
  AND (p.name = 'Muzza Porteña 36cm' OR p.name = 'Pizza Muzza Porteña 36cm' OR p.name = 'Muzza Porteña 36cm' OR p.name = 'Muzza Porteña 36cm')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Sánguche de muzza y tomate ---
UPDATE products 
   SET cost = 1539.05, price = IF(price = 0, 7500, price)
 WHERE business_id = @bid 
   AND (name = 'Sánguche de muzza y tomate' OR name = 'Pizza Sánguche de muzza y tomate' OR name = 'Sánguche de muzza y tomate' OR name = 'Sánguche de muzza y tomate');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Sánguche de muzza y tomate', 7500, 1539.05, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Sandwiches'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Sánguche de muzza y tomate' OR p.name = 'Pizza Sánguche de muzza y tomate' OR p.name = 'Sánguche de muzza y tomate' OR p.name = 'Sánguche de muzza y tomate')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.11, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Sánguche de muzza y tomate' OR p.name = 'Pizza Sánguche de muzza y tomate' OR p.name = 'Sánguche de muzza y tomate' OR p.name = 'Sánguche de muzza y tomate')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.05, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Muzza'
WHERE p.business_id = @bid 
  AND (p.name = 'Sánguche de muzza y tomate' OR p.name = 'Pizza Sánguche de muzza y tomate' OR p.name = 'Sánguche de muzza y tomate' OR p.name = 'Sánguche de muzza y tomate')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.01, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Albahaca'
WHERE p.business_id = @bid 
  AND (p.name = 'Sánguche de muzza y tomate' OR p.name = 'Pizza Sánguche de muzza y tomate' OR p.name = 'Sánguche de muzza y tomate' OR p.name = 'Sánguche de muzza y tomate')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.015, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Provolone'
WHERE p.business_id = @bid 
  AND (p.name = 'Sánguche de muzza y tomate' OR p.name = 'Pizza Sánguche de muzza y tomate' OR p.name = 'Sánguche de muzza y tomate' OR p.name = 'Sánguche de muzza y tomate')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.02, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Tomates secos'
WHERE p.business_id = @bid 
  AND (p.name = 'Sánguche de muzza y tomate' OR p.name = 'Pizza Sánguche de muzza y tomate' OR p.name = 'Sánguche de muzza y tomate' OR p.name = 'Sánguche de muzza y tomate')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Focaccia Arrabbiata ---
UPDATE products 
   SET cost = 4146.18
 WHERE business_id = @bid 
   AND (name = 'Focaccia Arrabbiata' OR name = 'Pizza Focaccia Arrabbiata' OR name = 'Focaccia Arrabbiata' OR name = 'Focaccia Arrabbiata');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Focaccia Arrabbiata', 0, 4146.18, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Focaccia'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Focaccia Arrabbiata' OR p.name = 'Pizza Focaccia Arrabbiata' OR p.name = 'Focaccia Arrabbiata' OR p.name = 'Focaccia Arrabbiata')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.23, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Masa'
WHERE p.business_id = @bid 
  AND (p.name = 'Focaccia Arrabbiata' OR p.name = 'Pizza Focaccia Arrabbiata' OR p.name = 'Focaccia Arrabbiata' OR p.name = 'Focaccia Arrabbiata')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.065, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Muzza'
WHERE p.business_id = @bid 
  AND (p.name = 'Focaccia Arrabbiata' OR p.name = 'Pizza Focaccia Arrabbiata' OR p.name = 'Focaccia Arrabbiata' OR p.name = 'Focaccia Arrabbiata')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.065, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Cremoso'
WHERE p.business_id = @bid 
  AND (p.name = 'Focaccia Arrabbiata' OR p.name = 'Pizza Focaccia Arrabbiata' OR p.name = 'Focaccia Arrabbiata' OR p.name = 'Focaccia Arrabbiata')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.035, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Provolone'
WHERE p.business_id = @bid 
  AND (p.name = 'Focaccia Arrabbiata' OR p.name = 'Pizza Focaccia Arrabbiata' OR p.name = 'Focaccia Arrabbiata' OR p.name = 'Focaccia Arrabbiata')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.01, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Salame'
WHERE p.business_id = @bid 
  AND (p.name = 'Focaccia Arrabbiata' OR p.name = 'Pizza Focaccia Arrabbiata' OR p.name = 'Focaccia Arrabbiata' OR p.name = 'Focaccia Arrabbiata')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.04, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Tomates secos'
WHERE p.business_id = @bid 
  AND (p.name = 'Focaccia Arrabbiata' OR p.name = 'Pizza Focaccia Arrabbiata' OR p.name = 'Focaccia Arrabbiata' OR p.name = 'Focaccia Arrabbiata')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.155, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Salsa'
WHERE p.business_id = @bid 
  AND (p.name = 'Focaccia Arrabbiata' OR p.name = 'Pizza Focaccia Arrabbiata' OR p.name = 'Focaccia Arrabbiata' OR p.name = 'Focaccia Arrabbiata')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Suma Stracciatella ---
UPDATE products 
   SET cost = 1226, price = IF(price = 0, 5000, price)
 WHERE business_id = @bid 
   AND (name = 'Suma Stracciatella' OR name = 'Pizza Suma Stracciatella' OR name = 'Suma Stracciatella' OR name = 'Suma Stracciatella');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Suma Stracciatella', 5000, 1226, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Extras'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Suma Stracciatella' OR p.name = 'Pizza Suma Stracciatella' OR p.name = 'Suma Stracciatella' OR p.name = 'Suma Stracciatella')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.05, 'kg'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Straciatella'
WHERE p.business_id = @bid 
  AND (p.name = 'Suma Stracciatella' OR p.name = 'Pizza Suma Stracciatella' OR p.name = 'Suma Stracciatella' OR p.name = 'Suma Stracciatella')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Suma anchoas ---
UPDATE products 
   SET cost = 916.67, price = IF(price = 0, 3000, price)
 WHERE business_id = @bid 
   AND (name = 'Suma anchoas' OR name = 'Pizza Suma anchoas' OR name = 'Suma anchoas' OR name = 'Suma anchoas');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Suma anchoas', 3000, 916.67, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Extras'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Suma anchoas' OR p.name = 'Pizza Suma anchoas' OR p.name = 'Suma anchoas' OR p.name = 'Suma anchoas')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 2, 'u'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Anchoas'
WHERE p.business_id = @bid 
  AND (p.name = 'Suma anchoas' OR p.name = 'Pizza Suma anchoas' OR p.name = 'Suma anchoas' OR p.name = 'Suma anchoas')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);

-- --- Dip de oliva ---
UPDATE products 
   SET cost = 450
 WHERE business_id = @bid 
   AND (name = 'Dip de oliva' OR name = 'Pizza Dip de oliva' OR name = 'Dip de oliva' OR name = 'Dip de oliva');

INSERT INTO products (business_id, category_id, name, price, cost, is_active)
SELECT @bid, c.id, 'Dip de oliva', 0, 450, 1
FROM categories c
WHERE c.business_id = @bid AND c.name = 'Pizza'
  AND NOT EXISTS (
      SELECT 1 FROM products p 
       WHERE p.business_id = @bid 
         AND (p.name = 'Dip de oliva' OR p.name = 'Pizza Dip de oliva' OR p.name = 'Dip de oliva' OR p.name = 'Dip de oliva')
  )
LIMIT 1;
INSERT INTO product_ingredients (product_id, ingredient_id, quantity, unit)
SELECT p.id, i.id, 0.02, 'L'
FROM products p
JOIN ingredients i ON i.business_id = @bid AND i.name = 'Aceite de oliva'
WHERE p.business_id = @bid 
  AND (p.name = 'Dip de oliva' OR p.name = 'Pizza Dip de oliva' OR p.name = 'Dip de oliva' OR p.name = 'Dip de oliva')
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit = VALUES(unit);
