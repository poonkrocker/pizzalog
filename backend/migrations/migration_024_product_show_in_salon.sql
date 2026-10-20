-- Migración 024: Disponibilidad de productos en salón vs carta online
-- Permite distinguir productos exclusivos de delivery/carta online y ocultarlos en salón.

ALTER TABLE products
    ADD COLUMN show_in_salon TINYINT(1) NOT NULL DEFAULT 1 AFTER show_online;
