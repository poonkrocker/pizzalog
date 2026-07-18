-- =====================================================================
--  Migración 018 · Columna `kind` en tables (mesa / barra)
-- =====================================================================
--  BUG: el alta de mesa o barra tiraba «error del servidor». El código PHP
--  (TableController + TableRepository) ya insertaba y leía la columna
--  `kind`, pero esa columna nunca se había creado en la base: el INSERT
--  fallaba porque MySQL no conoce la columna.
--
--  `kind` distingue una mesa común de una posición de barra. Todo lo que
--  existe hoy es mesa, así que el default cubre las filas viejas.
-- =====================================================================

ALTER TABLE tables
    ADD COLUMN kind VARCHAR(20) NOT NULL DEFAULT 'table' AFTER label;
    -- 'table' = mesa · 'bar' = barra
