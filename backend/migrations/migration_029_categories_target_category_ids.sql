-- Pizzalog: Columnas allows_extras y target_category_ids en categories para selector de extras por categoría
ALTER TABLE categories ADD COLUMN IF NOT EXISTS allows_extras TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS target_category_ids TEXT NULL AFTER allows_extras;
