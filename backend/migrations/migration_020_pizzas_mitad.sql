-- =====================================================================
--  Migración 020 · Pizzas combinables / Mitad y Mitad
-- =====================================================================
--  Permite marcar productos (pizzas) que admiten ser combinados
--  en modalidad "Mitad y Mitad" (Half & Half).
--  En la carta web y el TPV, permite elegir 2 sabores y cobra
--  automáticamente el valor de la mitad más cara.
-- =====================================================================

ALTER TABLE products
  ADD COLUMN is_combinable TINYINT(1) NOT NULL DEFAULT 0 AFTER is_open_price;
