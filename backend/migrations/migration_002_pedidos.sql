-- =====================================================================
--  PIZZALOG · Migración 002
--  Módulo de pedidos (delivery) agnóstico al canal + diferenciación
--  de ventas por canal en los reportes.
--
--  Correr después de migration_001.
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
--  1) Canal en las ventas
--     'counter' = mostrador/TPV. El resto = delivery por cada canal.
--     Las ventas existentes quedan como 'counter' por defecto.
-- ---------------------------------------------------------------------
ALTER TABLE sales
    ADD COLUMN channel ENUM('counter','web','whatsapp','pedidosya','rappi','phone')
        NOT NULL DEFAULT 'counter' AFTER payment_method;

CREATE INDEX idx_sales_channel ON sales (business_id, channel, created_at);


-- ---------------------------------------------------------------------
--  2) Pedidos
--     Un pedido tiene ciclo de vida propio (antes de ser venta) y datos
--     de delivery. Todos los canales crean pedidos en esta misma tabla;
--     PedidosYa/Rappi serán adaptadores que inyectan acá.
--     Al concretarse, genera una venta y guarda su sale_id.
-- ---------------------------------------------------------------------
CREATE TABLE orders (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id    BIGINT UNSIGNED NOT NULL,
    order_number   BIGINT UNSIGNED NULL,                  -- correlativo por negocio
    channel        ENUM('web','whatsapp','pedidosya','rappi','phone','counter')
                                   NOT NULL DEFAULT 'web',
    external_ref   VARCHAR(80)     NULL,                  -- id del pedido en la plataforma externa
    status         ENUM('received','confirmed','preparing','on_the_way','delivered','cancelled')
                                   NOT NULL DEFAULT 'received',
    customer_name  VARCHAR(120)    NULL,
    customer_phone VARCHAR(40)     NULL,
    address        TEXT            NULL,
    delivery_fee   DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    items_total    DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    total          DECIMAL(12,2)   NOT NULL DEFAULT 0.00, -- items_total + delivery_fee
    payment_method ENUM('cash','card','transfer','mp','other') NULL,
    notes          VARCHAR(500)    NULL,
    sale_id        BIGINT UNSIGNED NULL,                  -- venta generada al concretarse
    created_by     BIGINT UNSIGNED NULL,
    created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_orders_number (business_id, order_number),
    KEY idx_orders_business_status (business_id, status),
    KEY idx_orders_business_date (business_id, created_at),
    CONSTRAINT fk_orders_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_orders_sale FOREIGN KEY (sale_id)
        REFERENCES sales (id) ON DELETE SET NULL,
    CONSTRAINT fk_orders_user FOREIGN KEY (created_by)
        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
--  3) Ítems del pedido
--     Snapshot de lo pedido (nombre y precio del momento), más notas por
--     ítem ("sin cebolla"). Independiente de sale_items: el pedido puede
--     editarse antes de confirmarse; la venta refleja lo facturado.
-- ---------------------------------------------------------------------
CREATE TABLE order_items (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id     BIGINT UNSIGNED NOT NULL,
    product_id   BIGINT UNSIGNED NULL,
    product_name VARCHAR(120)    NOT NULL,
    unit_price   DECIMAL(12,2)   NOT NULL,
    quantity     DECIMAL(10,3)   NOT NULL DEFAULT 1,
    line_total   DECIMAL(12,2)   NOT NULL,
    notes        VARCHAR(255)    NULL,
    PRIMARY KEY (id),
    KEY idx_orderitems_order (order_id),
    CONSTRAINT fk_orderitems_order FOREIGN KEY (order_id)
        REFERENCES orders (id) ON DELETE CASCADE,
    CONSTRAINT fk_orderitems_product FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
