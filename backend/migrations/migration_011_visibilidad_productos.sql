-- =====================================================================
--  Migración 011 · Visibilidad avanzada de productos
-- =====================================================================
--  Separa "existe y se vende en el local" de "se muestra en la carta
--  online". Suma carta secreta, badge libre y ventana de disponibilidad
--  por día y hora (evaluada en America/Argentina/Cordoba).
-- =====================================================================

ALTER TABLE products
    ADD COLUMN show_online   TINYINT(1)   NOT NULL DEFAULT 1  AFTER is_active,
    -- 0 = existe y se vende en el TPV/salón, pero NO aparece en la carta
    -- online ni en pedidos web (ej. "2x1 vermouth mediodía", cargos internos)
    ADD COLUMN is_secret     TINYINT(1)   NOT NULL DEFAULT 0  AFTER show_online,
    -- carta secreta: no aparece en el listado normal de la carta online,
    -- solo se ve entrando por /public/{slug}/menu/secreta
    ADD COLUMN is_vegan_opt  TINYINT(1)   NOT NULL DEFAULT 0  AFTER is_secret,
    -- badge visual "tiene opción vegana"; no reemplaza a la variante real
    ADD COLUMN badge_text    VARCHAR(40)  NULL               AFTER is_vegan_opt,
    ADD COLUMN visible_days  JSON         NULL               AFTER badge_text,
    -- null = todos los días. Formato: ["mon","tue","wed","thu","fri","sat","sun"]
    ADD COLUMN visible_from  TIME         NULL               AFTER visible_days,
    ADD COLUMN visible_until TIME         NULL               AFTER visible_from;
    -- null en ambos = sin restricción horaria. Si visible_until < visible_from
    -- se interpreta que cruza medianoche (ej. 20:00 → 02:00)
