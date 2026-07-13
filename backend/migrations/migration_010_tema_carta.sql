-- =====================================================================
--  Migración 010 · Tema de la carta pública (colores estilo Fotolog)
-- =====================================================================
--  Cada negocio puede personalizar su carta: color de fondo, patrón,
--  color de acento (títulos y precios), de links y de texto.
--  Se guarda como JSON en texto; NULL = tema por defecto.
-- =====================================================================

ALTER TABLE businesses
    ADD COLUMN theme TEXT NULL AFTER longitude;
