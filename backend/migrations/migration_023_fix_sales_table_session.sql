-- =====================================================================
--  PIZZALOG · Migración 023
--  Garantizar columna table_session_id y canal 'dine_in' en tabla sales
-- =====================================================================
--  Permite vincular las ventas cobradas desde las mesas del salón
--  a su respectiva sesión (table_sessions), y registrar el canal 'dine_in'.
-- =====================================================================

SET NAMES utf8mb4;

-- 1. Agregar columna table_session_id en sales
ALTER TABLE sales
    ADD COLUMN table_session_id BIGINT UNSIGNED NULL AFTER channel;

-- 2. Asegurar que channel admita 'dine_in' (Salón)
ALTER TABLE sales
    MODIFY channel ENUM('counter','web','whatsapp','pedidosya','rappi','phone','dine_in')
        NOT NULL DEFAULT 'counter';

-- 3. Índice y clave foránea (opcional según motor)
ALTER TABLE sales
    ADD KEY idx_sales_session (table_session_id);
