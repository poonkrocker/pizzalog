-- Migración 025: Descuentos por ítem en cuentas de salón / barras
ALTER TABLE table_round_items
  ADD COLUMN IF NOT EXISTS original_unit_price DECIMAL(10,2) NULL DEFAULT NULL AFTER unit_price,
  ADD COLUMN IF NOT EXISTS discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER original_unit_price;
