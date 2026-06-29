-- =====================================================================
--  PIZZALOG · Migración 004
--  Salón: gestión de mesas con croquis, y cuentas de mesa (sesiones).
--
--  Modelo:
--    table_areas     → sectores/ambientes (adentro, vereda...). Cada uno
--                      tiene su propio croquis.
--    tables          → mesas, con su posición en el plano del área.
--    table_sessions  → la "visita"/cuenta. NO se ata a una mesa: se ata a
--                      la sesión, que puede ocupar varias mesas (juntar).
--    session_tables  → qué mesas ocupa cada sesión (juntar / transferir).
--    table_rounds    → cada tanda de pedidos (comanda que va a cocina).
--    table_round_items → los ítems de cada ronda.
--
--  Cierre: la sesión genera una o varias ventas (dividir) vía SaleService,
--  con canal 'dine_in'. Por eso sales.table_session_id puede repetirse.
--
--  Correr después de migration_003.
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
--  1) Áreas / sectores del salón
-- ---------------------------------------------------------------------
CREATE TABLE table_areas (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id BIGINT UNSIGNED NOT NULL,
    name        VARCHAR(80)     NOT NULL,
    sort_order  INT             NOT NULL DEFAULT 0,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_area_name (business_id, name),
    KEY idx_areas_business (business_id),
    CONSTRAINT fk_areas_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
--  2) Mesas (catálogo + posición en el croquis)
--     pos_x/pos_y/width/height/rotation describen el rectángulo de la
--     mesa sobre el canvas del área. shape define cómo se dibuja.
-- ---------------------------------------------------------------------
CREATE TABLE tables (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id BIGINT UNSIGNED NOT NULL,
    area_id     BIGINT UNSIGNED NOT NULL,
    label       VARCHAR(40)     NOT NULL,            -- "1", "Mesa 5", "B2"
    capacity    SMALLINT UNSIGNED NOT NULL DEFAULT 4,
    shape       ENUM('round','square','rect') NOT NULL DEFAULT 'square',
    pos_x       INT             NOT NULL DEFAULT 0,
    pos_y       INT             NOT NULL DEFAULT 0,
    width       INT             NOT NULL DEFAULT 80,
    height      INT             NOT NULL DEFAULT 80,
    rotation    INT             NOT NULL DEFAULT 0,
    is_active   TINYINT(1)      NOT NULL DEFAULT 1,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_table_label (business_id, area_id, label),
    KEY idx_tables_business (business_id),
    KEY idx_tables_area (area_id),
    CONSTRAINT fk_tables_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_tables_area FOREIGN KEY (area_id)
        REFERENCES table_areas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
--  3) Sesiones de mesa (la cuenta / visita)
--     El estado de una mesa (libre/ocupada) se deriva de si participa en
--     una sesión 'open'; no se guarda en la mesa para evitar inconsistencias.
-- ---------------------------------------------------------------------
CREATE TABLE table_sessions (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id BIGINT UNSIGNED NOT NULL,
    status      ENUM('open','bill_requested','closed','cancelled') NOT NULL DEFAULT 'open',
    party_size  SMALLINT UNSIGNED NULL,
    opened_by   BIGINT UNSIGNED NULL,
    opened_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at   DATETIME        NULL,
    note        VARCHAR(255)    NULL,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_sessions_business_status (business_id, status),
    CONSTRAINT fk_sessions_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_sessions_user FOREIGN KEY (opened_by)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
--  4) Mesas que ocupa cada sesión (juntar / transferir)
--     Una sesión con varias filas = mesas juntadas. Cambiar la fila =
--     transferir. Que una mesa no esté en dos sesiones abiertas a la vez
--     se valida en el servicio (no en la base).
-- ---------------------------------------------------------------------
CREATE TABLE session_tables (
    session_id BIGINT UNSIGNED NOT NULL,
    table_id   BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (session_id, table_id),
    KEY idx_session_tables_table (table_id),
    CONSTRAINT fk_sessiontables_session FOREIGN KEY (session_id)
        REFERENCES table_sessions (id) ON DELETE CASCADE,
    CONSTRAINT fk_sessiontables_table FOREIGN KEY (table_id)
        REFERENCES tables (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
--  5) Rondas (comandas: cada tanda enviada a cocina)
-- ---------------------------------------------------------------------
CREATE TABLE table_rounds (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id BIGINT UNSIGNED NOT NULL,
    session_id  BIGINT UNSIGNED NOT NULL,
    number      INT             NOT NULL,            -- correlativo dentro de la sesión
    status      ENUM('pending','preparing','ready','served','cancelled') NOT NULL DEFAULT 'pending',
    note        VARCHAR(255)    NULL,
    created_by  BIGINT UNSIGNED NULL,
    printed_at  DATETIME        NULL,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_rounds_session (session_id),
    KEY idx_rounds_business_status (business_id, status),
    CONSTRAINT fk_rounds_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_rounds_session FOREIGN KEY (session_id)
        REFERENCES table_sessions (id) ON DELETE CASCADE,
    CONSTRAINT fk_rounds_user FOREIGN KEY (created_by)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
--  6) Ítems de cada ronda
--     session_id va denormalizado para sumar la cuenta sin pasar por las
--     rondas. name/unit_price son snapshot al momento del pedido.
-- ---------------------------------------------------------------------
CREATE TABLE table_round_items (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id BIGINT UNSIGNED NOT NULL,
    session_id  BIGINT UNSIGNED NOT NULL,
    round_id    BIGINT UNSIGNED NOT NULL,
    product_id  BIGINT UNSIGNED NULL,
    name        VARCHAR(160)    NOT NULL,
    qty         INT UNSIGNED    NOT NULL DEFAULT 1,
    unit_price  DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    note        VARCHAR(255)    NULL,
    status      ENUM('ordered','cancelled') NOT NULL DEFAULT 'ordered',
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_items_session (session_id),
    KEY idx_items_round (round_id),
    CONSTRAINT fk_items_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_items_session FOREIGN KEY (session_id)
        REFERENCES table_sessions (id) ON DELETE CASCADE,
    CONSTRAINT fk_items_round FOREIGN KEY (round_id)
        REFERENCES table_rounds (id) ON DELETE CASCADE,
    CONSTRAINT fk_items_product FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
--  7) Enganche con ventas
--     Una sesión puede generar varias ventas (dividir cuenta), por eso la
--     referencia vive en sales y puede repetirse. Se agrega 'dine_in' como
--     canal para que analytics separe salón de delivery y mostrador.
-- ---------------------------------------------------------------------
ALTER TABLE sales
    ADD COLUMN table_session_id BIGINT UNSIGNED NULL AFTER channel,
    ADD KEY idx_sales_session (table_session_id),
    ADD CONSTRAINT fk_sales_session FOREIGN KEY (table_session_id)
        REFERENCES table_sessions (id) ON DELETE SET NULL;

ALTER TABLE sales
    MODIFY channel ENUM('counter','web','whatsapp','pedidosya','rappi','phone','dine_in')
        NOT NULL DEFAULT 'counter';
