-- =====================================================================
--  Migración 017 · Datos de pago y modalidades del checkout
-- =====================================================================
--  Datos que en la web propia de Arrabbiata estaban hardcodeados y que
--  ahora se configuran por negocio desde el panel:
--
--   - transfer_alias: qué mostrar cuando el cliente elige Transferencia
--     (alias + a nombre de quién). Texto libre.
--   - card_surcharge_pct: recargo por pago con tarjeta, en %. 0 = sin
--     recargo. La carta lo suma al total y lo avisa (informativo por ahora,
--     no se persiste en el pedido).
--   - pay_methods_pickup / pay_methods_delivery: qué formas de pago acepta
--     el negocio en cada modalidad (retiro en local / envío a domicilio).
--     JSON con claves de 'cash','card','transfer','mp'. NULL = todas.
--     Reemplaza la regla fija de Arrabbiata (delivery = solo transferencia):
--     ahora cada negocio decide, y hasta puede diferir entre retiro y envío.
-- =====================================================================

ALTER TABLE businesses
    ADD COLUMN transfer_alias        VARCHAR(255) NULL               AFTER accepts_online_orders,
    ADD COLUMN card_surcharge_pct    DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER transfer_alias,
    ADD COLUMN pay_methods_pickup    JSON         NULL               AFTER card_surcharge_pct,
    ADD COLUMN pay_methods_delivery  JSON         NULL               AFTER pay_methods_pickup;
    -- NULL en cualquiera de los dos = se aceptan todos los métodos en esa
    -- modalidad. Formato: ["cash","transfer"]  (subconjunto de los válidos)
