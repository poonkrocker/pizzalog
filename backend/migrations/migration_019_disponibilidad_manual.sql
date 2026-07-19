-- =====================================================================
--  Migración 019 · Disponibilidad manual del producto (nivel bajo)
-- =====================================================================
--  Separa dos cosas que estaban mezcladas en show_online:
--
--   - show_online (nivel ALTO, ya existe): ¿el producto pertenece a la
--     carta online? Si es 0, NUNCA aparece (se vende solo en el local).
--     Decisión estructural, no cambia día a día.
--
--   - is_available (nivel BAJO, esta migración): ¿está disponible AHORA?
--     Apagado manual y rápido para cuando se acaba el stock (ej. no hay
--     más burrata). El producto sigue siendo de la carta, pero mientras
--     está en 0 DESAPARECE de la carta online. Se vuelve a prender con un
--     click desde el listado del panel.
--
--  Disponibilidad efectiva en la carta =
--      show_online = 1  AND  is_available = 1  AND  (dentro de horario)
--
--  Default 1: todo lo que hoy existe queda disponible, sin cambios.
-- =====================================================================

ALTER TABLE products
    ADD COLUMN is_available TINYINT(1) NOT NULL DEFAULT 1 AFTER show_online;
