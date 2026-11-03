-- Pizzalog migration 032
-- Explicit supply mapping for dough profiles. Existing profiles remain valid
-- for quantity calculations; costing stays incomplete until ingredients are mapped.
ALTER TABLE dough_profiles
  ADD COLUMN ingredient_map JSON NULL AFTER cost_per_kg;
