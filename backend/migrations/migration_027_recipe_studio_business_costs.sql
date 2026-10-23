-- Pizzalog: Recetario reutilizable y costeo operativo.
-- Las tablas se separan de products/product_ingredients para permitir subrecetas
-- sin convertir preparaciones internas en productos vendibles del TPV.
CREATE TABLE IF NOT EXISTS recipe_studio_recipes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id BIGINT UNSIGNED NOT NULL,
  linked_product_id BIGINT UNSIGNED NULL,
  name VARCHAR(160) NOT NULL,
  recipe_type ENUM('product','subrecipe') NOT NULL DEFAULT 'product',
  yield_quantity DECIMAL(12,4) NOT NULL DEFAULT 1,
  yield_unit VARCHAR(24) NOT NULL DEFAULT 'u',
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  target_food_cost_pct DECIMAL(5,2) NOT NULL DEFAULT 30,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_recipe_studio_business (business_id),
  KEY idx_recipe_studio_linked_product (linked_product_id),
  CONSTRAINT fk_recipe_studio_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recipe_studio_components (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id BIGINT UNSIGNED NOT NULL,
  recipe_id BIGINT UNSIGNED NOT NULL,
  component_type ENUM('supply','recipe') NOT NULL,
  supply_id BIGINT UNSIGNED NULL,
  component_recipe_id BIGINT UNSIGNED NULL,
  quantity DECIMAL(12,4) NOT NULL,
  unit VARCHAR(24) NOT NULL DEFAULT 'kg',
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_recipe_components_recipe (business_id, recipe_id),
  KEY idx_recipe_components_subrecipe (business_id, component_recipe_id),
  CONSTRAINT fk_recipe_component_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_recipe_component_parent FOREIGN KEY (recipe_id) REFERENCES recipe_studio_recipes(id) ON DELETE CASCADE,
  CONSTRAINT fk_recipe_component_supply FOREIGN KEY (supply_id) REFERENCES supplies(id) ON DELETE RESTRICT,
  CONSTRAINT fk_recipe_component_child FOREIGN KEY (component_recipe_id) REFERENCES recipe_studio_recipes(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS business_cost_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  category ENUM('employees','rent','utilities','services','taxes','maintenance','software','other') NOT NULL DEFAULT 'other',
  quantity DECIMAL(12,3) NOT NULL DEFAULT 1,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  period ENUM('monthly','weekly','daily','yearly') NOT NULL DEFAULT 'monthly',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_business_cost_items_business (business_id, is_active),
  CONSTRAINT fk_business_cost_items_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
