-- Pizzalog: columnas para el selector de extras por categoría.
-- Compatible con MySQL: comprueba information_schema antes de agregar cada columna.
-- Se puede ejecutar más de una vez y también tolera una ejecución parcial previa.

SET @pizzalog_sql = IF(
    (SELECT COUNT(*)
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'categories'
        AND column_name = 'allows_extras') = 0,
    'ALTER TABLE categories ADD COLUMN allows_extras TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active',
    'SELECT 1'
);
PREPARE pizzalog_stmt FROM @pizzalog_sql;
EXECUTE pizzalog_stmt;
DEALLOCATE PREPARE pizzalog_stmt;

SET @pizzalog_sql = IF(
    (SELECT COUNT(*)
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'categories'
        AND column_name = 'target_category_ids') = 0,
    'ALTER TABLE categories ADD COLUMN target_category_ids TEXT NULL AFTER allows_extras',
    'SELECT 1'
);
PREPARE pizzalog_stmt FROM @pizzalog_sql;
EXECUTE pizzalog_stmt;
DEALLOCATE PREPARE pizzalog_stmt;
