-- =====================================================================
--  Migración 007 · Barras (lugares con varias cuentas) + nombre de cuenta
-- =====================================================================
--  Correr DESPUÉS de la 004 (salón).
--  - tables.kind: distingue una mesa de una barra. Una barra admite
--    varias cuentas abiertas a la vez (no se "ocupa").
--  - table_sessions.label: nombre corto de cada cuenta dentro de una
--    barra ("Juan", "Pareja", "Cuenta 2"), para diferenciarlas.
-- =====================================================================

ALTER TABLE tables
    ADD COLUMN kind ENUM('table','bar') NOT NULL DEFAULT 'table' AFTER label;

ALTER TABLE table_sessions
    ADD COLUMN label VARCHAR(60) NULL AFTER party_size;
