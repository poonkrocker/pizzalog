-- =====================================================================
--  Migración 008 · Canales del TPV: para llevar y delivery propio
-- =====================================================================
--  Correr DESPUÉS de la 004 (que ya modificó este ENUM).
--  Suma dos canales a las ventas para distinguir en los números el
--  mostrador (counter), lo que se retira (takeaway) y el reparto
--  propio (delivery). Los pedidos de apps (pedidosya/rappi) ya existían.
-- =====================================================================

ALTER TABLE sales
    MODIFY channel ENUM('counter','web','whatsapp','pedidosya','rappi','phone','dine_in','takeaway','delivery')
        NOT NULL DEFAULT 'counter';
