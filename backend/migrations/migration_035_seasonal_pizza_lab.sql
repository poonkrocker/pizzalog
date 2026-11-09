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
