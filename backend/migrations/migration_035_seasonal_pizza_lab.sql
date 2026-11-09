CREATE TABLE IF NOT EXISTS seasonal_pizza_variant_periods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE DEFAULT NULL,
  source ENUM('manual','inferred') NOT NULL DEFAULT 'manual',
  verified TINYINT(1) NOT NULL DEFAULT 0,
  notes VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_seasonal_period_variant (business_id,variant_id,start_date,end_date),
  CONSTRAINT fk_seasonal_period_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_seasonal_period_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @db := DATABASE();
SET @has_linked_variant := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='recipe_studio_recipes' AND COLUMN_NAME='linked_variant_id');
SET @ddl := IF(@has_linked_variant=0,'ALTER TABLE recipe_studio_recipes ADD COLUMN linked_variant_id BIGINT UNSIGNED NULL AFTER linked_product_id','SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
SET @has_variant_cost := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='product_variants' AND COLUMN_NAME='cost');
SET @ddl := IF(@has_variant_cost=0,'ALTER TABLE product_variants ADD COLUMN cost DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER price','SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
SET @has_variant_cost_current := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='product_variants' AND COLUMN_NAME='cost_is_current');
SET @ddl := IF(@has_variant_cost_current=0,'ALTER TABLE product_variants ADD COLUMN cost_is_current TINYINT(1) NOT NULL DEFAULT 0 AFTER cost','SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
SET @has_variant_recipe_index := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='recipe_studio_recipes' AND INDEX_NAME='idx_recipe_studio_linked_variant');
SET @ddl := IF(@has_variant_recipe_index=0,'CREATE INDEX idx_recipe_studio_linked_variant ON recipe_studio_recipes (business_id,linked_variant_id)','SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
CREATE TABLE IF NOT EXISTS seasonal_pizza_variant_recipes (
 business_id BIGINT UNSIGNED NOT NULL,
 variant_id BIGINT UNSIGNED NOT NULL,
 recipe_id BIGINT UNSIGNED NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (business_id,variant_id),
 UNIQUE KEY uq_seasonal_variant_recipe (business_id,recipe_id),
 CONSTRAINT fk_seasonal_recipe_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
 CONSTRAINT fk_seasonal_recipe_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
 CONSTRAINT fk_seasonal_recipe_recipe FOREIGN KEY (recipe_id) REFERENCES recipe_studio_recipes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
