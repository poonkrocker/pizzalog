-- =====================================================================
--  Migración 014 · Orden manual de productos dentro de la categoría
-- =====================================================================
--  Hasta ahora la carta salía ordenada por nombre. Ahora manda
--  sort_order (ASC), con id como desempate estable.
--  Se inicializa siguiendo el orden alfabético actual para que la carta
--  no cambie al correr la migración.
-- =====================================================================

ALTER TABLE products
    ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER category_id;

SET @row := 0;
SET @cat := NULL;
UPDATE products p
  JOIN (
    SELECT id,
           @row := IF(@cat = COALESCE(category_id, 0), @row + 1, 0) AS rn,
           @cat := COALESCE(category_id, 0)                          AS grp
      FROM (SELECT id, category_id FROM products ORDER BY COALESCE(category_id, 0), name, id) o
  ) x ON x.id = p.id
   SET p.sort_order = x.rn;
