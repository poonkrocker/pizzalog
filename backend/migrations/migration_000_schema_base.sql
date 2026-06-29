-- =====================================================================
--  PIZZALOG · Esquema de base de datos (MySQL 8.x / MariaDB 10.x)
--  Sistema de TPV + administración multi-tenant
--
--  Convenciones:
--   - Motor InnoDB + utf8mb4 (soporta acentos y emojis).
--   - Toda tabla de datos cuelga de business_id (multi-tenancy).
--   - Montos en DECIMAL(12,2). Moneda asumida: ARS.
--   - PIN y password se guardan SIEMPRE hasheados, nunca en claro.
--   - Las líneas de venta guardan copia (snapshot) de nombre y precio:
--     si luego cambiás o borrás un producto, los tickets viejos NO
--     se alteran. Clave en un país con precios que cambian seguido.
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '-03:00';  -- Córdoba, Argentina


-- =====================================================================
--  MÓDULO 1 · TENANCY
--  Cada fila = un local/cliente del sistema. Arrabbiata es el primero.
-- =====================================================================

CREATE TABLE businesses (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name          VARCHAR(120)    NOT NULL,
    slug          VARCHAR(60)     NOT NULL,              -- identificador url-friendly
    cuit          VARCHAR(13)     NULL,                  -- CUIT del comercio
    address       VARCHAR(255)    NULL,
    phone         VARCHAR(40)     NULL,
    timezone      VARCHAR(40)     NOT NULL DEFAULT 'America/Argentina/Cordoba',
    currency      CHAR(3)         NOT NULL DEFAULT 'ARS',
    is_active     TINYINT(1)      NOT NULL DEFAULT 1,
    created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_businesses_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================================
--  MÓDULO 2 · USUARIOS / EMPLEADOS
--  Una sola tabla para todos: dueño, cajero, cocina.
--   - password_hash: login al panel web (puede ser NULL para quien
--     solo ficha y opera el TPV).
--   - pin_hash: acceso rápido en el TPV y para fichar entrada/salida.
--   - hourly_rate: opcional, sirve para liquidar horas trabajadas.
-- =====================================================================

CREATE TABLE users (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id   BIGINT UNSIGNED NOT NULL,
    name          VARCHAR(120)    NOT NULL,
    email         VARCHAR(160)    NULL,
    password_hash VARCHAR(255)    NULL,
    pin_hash      VARCHAR(255)    NULL,
    role          ENUM('admin','manager','cashier','kitchen') NOT NULL DEFAULT 'cashier',
    hourly_rate   DECIMAL(10,2)   NULL,
    is_active     TINYINT(1)      NOT NULL DEFAULT 1,
    created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_business_email (business_id, email),
    KEY idx_users_business (business_id),
    CONSTRAINT fk_users_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================================
--  MÓDULO 3 · CATÁLOGO (categorías + productos)
--   - track_stock: 1 si el producto descuenta stock (ej: una Coca),
--     0 si no se controla (ej: una pizza hecha al momento).
--   - stock_quantity / stock_min: solo relevantes si track_stock=1.
-- =====================================================================

CREATE TABLE categories (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id   BIGINT UNSIGNED NOT NULL,
    name          VARCHAR(80)     NOT NULL,
    sort_order    INT             NOT NULL DEFAULT 0,
    is_active     TINYINT(1)      NOT NULL DEFAULT 1,
    created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_categories_business (business_id),
    CONSTRAINT fk_categories_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id    BIGINT UNSIGNED NOT NULL,
    category_id    BIGINT UNSIGNED NULL,
    name           VARCHAR(120)    NOT NULL,
    barcode        VARCHAR(64)     NULL,
    price          DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    image_url      VARCHAR(255)    NULL,
    track_stock    TINYINT(1)      NOT NULL DEFAULT 0,
    stock_quantity INT             NOT NULL DEFAULT 0,
    stock_min      INT             NOT NULL DEFAULT 0,
    is_active      TINYINT(1)      NOT NULL DEFAULT 1,
    created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_products_business (business_id),
    KEY idx_products_category (category_id),
    KEY idx_products_barcode (business_id, barcode),
    CONSTRAINT fk_products_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_products_category FOREIGN KEY (category_id)
        REFERENCES categories (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================================
--  MÓDULO 4 · CAJA (arqueo)
--  Una sesión de caja agrupa todas las ventas de un turno.
--  cash_movements registra ingresos/egresos que NO son ventas
--  (vuelto inicial, retiros, pago a proveedor en efectivo, etc.).
-- =====================================================================

CREATE TABLE cash_sessions (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id     BIGINT UNSIGNED NOT NULL,
    opened_by       BIGINT UNSIGNED NOT NULL,
    opened_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at       TIMESTAMP       NULL,
    opening_amount  DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    closing_amount  DECIMAL(12,2)   NULL,             -- contado al cerrar
    expected_amount DECIMAL(12,2)   NULL,             -- calculado por el sistema
    difference      DECIMAL(12,2)   NULL,             -- closing - expected
    status          ENUM('open','closed') NOT NULL DEFAULT 'open',
    note            VARCHAR(255)    NULL,
    PRIMARY KEY (id),
    KEY idx_cashsessions_business (business_id),
    CONSTRAINT fk_cashsessions_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_cashsessions_user FOREIGN KEY (opened_by)
        REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cash_movements (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    cash_session_id  BIGINT UNSIGNED NOT NULL,
    type             ENUM('in','out') NOT NULL,
    amount           DECIMAL(12,2)   NOT NULL,
    reason           VARCHAR(160)    NULL,
    created_by       BIGINT UNSIGNED NULL,
    created_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_cashmovements_session (cash_session_id),
    CONSTRAINT fk_cashmovements_session FOREIGN KEY (cash_session_id)
        REFERENCES cash_sessions (id) ON DELETE CASCADE,
    CONSTRAINT fk_cashmovements_user FOREIGN KEY (created_by)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================================
--  MÓDULO 5 · VENTAS
--   - sale_number: número de ticket correlativo POR negocio.
--   - client_uuid: id generado en el dispositivo. Permite vender
--     offline y sincronizar sin duplicar (la sync ignora un uuid ya
--     recibido). Es la pieza que habilita el modo offline pragmático.
--   - sale_items guarda product_name y unit_price como snapshot.
-- =====================================================================

CREATE TABLE sales (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id     BIGINT UNSIGNED NOT NULL,
    sale_number     BIGINT UNSIGNED NULL,
    client_uuid     CHAR(36)        NULL,              -- uuid del dispositivo (sync offline)
    user_id         BIGINT UNSIGNED NULL,              -- quién vendió
    cash_session_id BIGINT UNSIGNED NULL,
    subtotal        DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    discount        DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    total           DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    payment_method  ENUM('cash','card','transfer','mp','other') NOT NULL DEFAULT 'cash',
    status          ENUM('completed','cancelled') NOT NULL DEFAULT 'completed',
    note            VARCHAR(255)    NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sales_client_uuid (business_id, client_uuid),
    UNIQUE KEY uq_sales_number (business_id, sale_number),
    KEY idx_sales_business_date (business_id, created_at),
    KEY idx_sales_session (cash_session_id),
    CONSTRAINT fk_sales_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_sales_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_sales_session FOREIGN KEY (cash_session_id)
        REFERENCES cash_sessions (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sale_items (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    sale_id       BIGINT UNSIGNED NOT NULL,
    product_id    BIGINT UNSIGNED NULL,                -- NULL si el producto se borró luego
    product_name  VARCHAR(120)    NOT NULL,            -- snapshot al momento de la venta
    unit_price    DECIMAL(12,2)   NOT NULL,            -- snapshot al momento de la venta
    quantity      DECIMAL(10,3)   NOT NULL DEFAULT 1,  -- decimal por si vendés por peso
    line_total    DECIMAL(12,2)   NOT NULL,
    PRIMARY KEY (id),
    KEY idx_saleitems_sale (sale_id),
    KEY idx_saleitems_product (product_id),
    CONSTRAINT fk_saleitems_sale FOREIGN KEY (sale_id)
        REFERENCES sales (id) ON DELETE CASCADE,
    CONSTRAINT fk_saleitems_product FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================================
--  MÓDULO 6 · ASISTENCIA / HORAS
--  Un fichaje = una fila. clock_out NULL mientras el empleado está
--  dentro. Las horas se calculan en consulta (clock_out - clock_in).
--  device_label ayuda a atar el fichaje al equipo del local.
-- =====================================================================

CREATE TABLE time_entries (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id   BIGINT UNSIGNED NOT NULL,
    user_id       BIGINT UNSIGNED NOT NULL,
    clock_in      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    clock_out     TIMESTAMP       NULL,
    device_label  VARCHAR(80)     NULL,
    note          VARCHAR(255)    NULL,
    PRIMARY KEY (id),
    KEY idx_timeentries_business (business_id),
    KEY idx_timeentries_user_date (user_id, clock_in),
    CONSTRAINT fk_timeentries_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_timeentries_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================================
--  MÓDULO 7 · INVENTARIO (stock simple por unidad)
--  Cada cambio de stock deja rastro. El stock_quantity en products es
--  el valor "vivo"; esta tabla es el historial que lo explica.
--   - type 'sale'       -> descuento automático al vender (qty negativa)
--   - type 'restock'    -> carga de mercadería (qty positiva)
--   - type 'adjustment' -> rotura/vencimiento/consumo interno (con motivo)
-- =====================================================================

CREATE TABLE stock_movements (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id    BIGINT UNSIGNED NOT NULL,
    product_id     BIGINT UNSIGNED NOT NULL,
    type           ENUM('sale','restock','adjustment') NOT NULL,
    quantity_change INT            NOT NULL,            -- positivo o negativo
    reason         VARCHAR(160)    NULL,
    sale_id        BIGINT UNSIGNED NULL,                -- si vino de una venta
    created_by     BIGINT UNSIGNED NULL,
    created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_stockmov_business (business_id),
    KEY idx_stockmov_product (product_id),
    CONSTRAINT fk_stockmov_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_stockmov_product FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE CASCADE,
    CONSTRAINT fk_stockmov_sale FOREIGN KEY (sale_id)
        REFERENCES sales (id) ON DELETE SET NULL,
    CONSTRAINT fk_stockmov_user FOREIGN KEY (created_by)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================================
--  SEED MÍNIMO · primer negocio + usuario admin
--  (reemplazá los hashes por los reales generados en PHP con
--   password_hash(). Nunca guardes PIN ni clave en texto plano.)
-- =====================================================================

INSERT INTO businesses (name, slug, timezone)
VALUES ('Arrabbiata', 'arrabbiata', 'America/Argentina/Cordoba');

INSERT INTO users (business_id, name, email, password_hash, pin_hash, role)
VALUES (1, 'Eze', 'eze@arrabbiata.com.ar', '<<hash_password>>', '<<hash_pin>>', 'admin');
