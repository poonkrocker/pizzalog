-- =====================================================================
--  Migración 012 · Horario de atención del local
-- =====================================================================
--  Gatea el PEDIDO online, no la carta: la carta se sigue viendo cerrada.
--  Un local puede tener 0, 1 o varias franjas por día (mediodía y noche).
--  day_of_week: 0 = domingo … 6 = sábado (mismo criterio que date('w')).
-- =====================================================================

CREATE TABLE business_hours (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id BIGINT UNSIGNED NOT NULL,
    day_of_week TINYINT UNSIGNED NOT NULL,   -- 0=domingo … 6=sábado
    opens_at    TIME NOT NULL,
    closes_at   TIME NOT NULL,               -- si closes_at < opens_at, cruza medianoche
    PRIMARY KEY (id),
    KEY idx_hours_business (business_id, day_of_week),
    CONSTRAINT fk_hours_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE businesses
    ADD COLUMN accepts_online_orders TINYINT(1) NOT NULL DEFAULT 1 AFTER is_active;
    -- interruptor manual general, independiente del horario
