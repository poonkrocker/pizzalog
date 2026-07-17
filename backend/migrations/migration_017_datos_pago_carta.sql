-- =====================================================================
--  Migración 017 · Datos de pago para el checkout de la carta
-- =====================================================================
--  Dos datos que hoy estaban hardcodeados en la web propia de Arrabbiata
--  y que ahora se configuran por negocio desde el panel:
--
--   - transfer_alias: qué mostrar cuando el cliente elige Transferencia
--     (el alias + a nombre de quién). Texto libre para que entre la
--     leyenda completa, no solo el alias.
--   - card_surcharge_pct: recargo por pago con tarjeta, en porcentaje.
--     0 = sin recargo. La carta lo suma al total y lo avisa; por ahora
--     es solo informativo de cara al cliente (no se persiste en el
--     pedido todavía).
-- =====================================================================

ALTER TABLE businesses
    ADD COLUMN transfer_alias     VARCHAR(255)  NULL              AFTER accepts_online_orders,
    ADD COLUMN card_surcharge_pct DECIMAL(5,2)  NOT NULL DEFAULT 0 AFTER transfer_alias;
