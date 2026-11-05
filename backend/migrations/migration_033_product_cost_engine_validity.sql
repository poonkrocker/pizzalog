-- Pizzalog migration 033
-- Distinguish Cost Engine snapshots from stale/manual legacy products.cost values.
-- Existing rows default to not-current: no historical PHP/manual cost is trusted.

SET @has_cost_is_current = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'cost_is_current'
);
SET @sql = IF(@has_cost_is_current = 0,
  'ALTER TABLE products ADD COLUMN cost_is_current TINYINT(1) NOT NULL DEFAULT 0 AFTER cost',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_cost_engine_version = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'cost_engine_version'
);
SET @sql = IF(@has_cost_engine_version = 0,
  'ALTER TABLE products ADD COLUMN cost_engine_version VARCHAR(32) NULL AFTER cost_is_current',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_cost_input_hash = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'cost_input_hash'
);
SET @sql = IF(@has_cost_input_hash = 0,
  'ALTER TABLE products ADD COLUMN cost_input_hash CHAR(16) NULL AFTER cost_engine_version',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_cost_calculated_at = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'cost_calculated_at'
);
SET @sql = IF(@has_cost_calculated_at = 0,
  'ALTER TABLE products ADD COLUMN cost_calculated_at DATETIME NULL AFTER cost_input_hash',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
