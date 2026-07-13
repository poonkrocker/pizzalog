-- =====================================================================
--  RE-IMPORTACIÓN Loyverse -> Pizzalog  CON VARIANTES
--  Arrabbiata (business_id = 1)
--  56 productos · 50 variantes
--
--  Requiere la migración 006 aplicada (tablas de variantes).
--
--  ¡ATENCIÓN! Este script BORRA todos los productos y categorías del
--  negocio 1 y los vuelve a crear con el modelo de variantes. Las ventas
--  ya hechas conservan su snapshot (nombre y precio), no se pierden.
--  Corré esto UNA vez, reemplaza la importación aplanada anterior.
-- =====================================================================

SET NAMES utf8mb4;
START TRANSACTION;

-- Limpiar catálogo actual del negocio (cascada a opciones/valores/variantes)
DELETE FROM products   WHERE business_id = 1;
DELETE FROM categories WHERE business_id = 1;

-- Categorías
INSERT INTO categories (business_id, name, sort_order) VALUES (1, 'Pizza', 1);
INSERT INTO categories (business_id, name, sort_order) VALUES (1, 'Entradas', 2);
INSERT INTO categories (business_id, name, sort_order) VALUES (1, 'Panchos', 3);
INSERT INTO categories (business_id, name, sort_order) VALUES (1, 'Postres', 4);
INSERT INTO categories (business_id, name, sort_order) VALUES (1, 'Bebida', 5);
INSERT INTO categories (business_id, name, sort_order) VALUES (1, 'Cafetería', 6);
INSERT INTO categories (business_id, name, sort_order) VALUES (1, 'Costos Extra', 7);

-- Productos simples
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Panchos' LIMIT 1), '2 panchos', NULL, 12000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Bebida' LIMIT 1), '2x1 vermouth mediodía', '2 vermouth CARPANO O PUNT E MES x 4500 MEDIODÍA', 4500.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Bebida' LIMIT 1), 'Agua Saborizada', NULL, 4000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Bebida' LIMIT 1), 'Amargo', NULL, 4000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Bebida' LIMIT 1), 'Botella Amargo', NULL, 16000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Bebida' LIMIT 1), 'Botella Vermú RRBB', NULL, 15000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Cafetería' LIMIT 1), 'Café', NULL, 2000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Cafetería' LIMIT 1), 'Café con leche', NULL, 3000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Cafetería' LIMIT 1), 'Café doble', NULL, 3000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Cafetería' LIMIT 1), 'Cortado', NULL, 2000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Cafetería' LIMIT 1), 'Cortado doble', NULL, 3000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Costos Extra' LIMIT 1), 'Costo Envío', NULL, 0.00, 0.00, 0, 1, 0, 1);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Costos Extra' LIMIT 1), 'Diferencia Rappi', NULL, 0.00, 0.00, 0, 1, 0, 1);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Entradas' LIMIT 1), 'Fainá', NULL, 3000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Bebida' LIMIT 1), 'Fernet', NULL, 7000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'Fugazzeta con queso azul', NULL, 14000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Bebida' LIMIT 1), 'Gin Tonic', NULL, 7000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Costos Extra' LIMIT 1), 'Interés TC', NULL, 0.00, 0.00, 0, 1, 0, 1);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Cafetería' LIMIT 1), 'Lágrima', NULL, 3000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Bebida' LIMIT 1), 'Medida de Jameson', NULL, 8000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Panchos' LIMIT 1), 'Pancho', 'Pancho x 1', 7000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'Pizza Arrabbiata', NULL, 14000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'Pizza Especial', NULL, 14000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'Pizza Fugazzeta', NULL, 13000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'Pizza Marinara', NULL, 13000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'Pizza Napolitana', NULL, 13000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'Pizza Pucheta', NULL, 14000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'Pizza Quattro', NULL, 14000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'Pizzilante', NULL, 13000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Entradas' LIMIT 1), 'Platito', NULL, 5000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'Promo 2 pizzas', NULL, 25000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'Promo 3 Pizzas', NULL, 36000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'Promo 4 Pizzas', NULL, 45000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'promo pizza + lata', NULL, 12000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Costos Extra' LIMIT 1), 'Propina', NULL, 0.00, 0.00, 0, 1, 0, 1);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Bebida' LIMIT 1), 'Sidra Juliá', NULL, 12000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Bebida' LIMIT 1), 'Sidra Txapela', NULL, 18000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Bebida' LIMIT 1), 'Soda', NULL, 4000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'Super Fugazzeta', NULL, 20000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Postres' LIMIT 1), 'Tarta Vasca', NULL, 9000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Bebida' LIMIT 1), 'Te verde', NULL, 5000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Postres' LIMIT 1), 'Tiramisu', NULL, 8000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Bebida' LIMIT 1), 'Vermut Común', NULL, 4500.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Bebida' LIMIT 1), 'Vermut Premium', NULL, 6000.00, 0.00, 0, 1, 0, 0);
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Bebida' LIMIT 1), 'Vino en Copa', NULL, 5000.00, 0.00, 0, 1, 0, 0);

-- Productos con variantes
-- Cerveza
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Bebida' LIMIT 1), 'Cerveza', NULL, 0.00, 0.00, 0, 1, 1, 0);
SET @pid = LAST_INSERT_ID();
INSERT INTO product_options (business_id, product_id, name, sort_order) VALUES (1, @pid, 'Marca', 0);
SET @o0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'APA', 0);
SET @o0v0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'American Amber', 1);
SET @o0v1 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'American IPA', 2);
SET @o0v2 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Caramel IPA', 3);
SET @o0v3 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Hoppy Lager', 4);
SET @o0v4 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Juicy IPA', 5);
SET @o0v5 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Lager', 6);
SET @o0v6 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Peroni', 7);
SET @o0v7 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Session IPA', 8);
SET @o0v8 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Sin Alcohol', 9);
SET @o0v9 = LAST_INSERT_ID();
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'APA', 6000.00, 0);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v0);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'American Amber', 6000.00, 1);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v1);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'American IPA', 7000.00, 2);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v2);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Caramel IPA', 7000.00, 3);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v3);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Hoppy Lager', 6000.00, 4);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v4);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Juicy IPA', 7500.00, 5);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v5);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Lager', 5000.00, 6);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v6);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Peroni', 7000.00, 7);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v7);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Session IPA', 6000.00, 8);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v8);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Sin Alcohol', 4500.00, 9);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v9);

-- Cynar
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Bebida' LIMIT 1), 'Cynar', NULL, 0.00, 0.00, 0, 1, 1, 0);
SET @pid = LAST_INSERT_ID();
INSERT INTO product_options (business_id, product_id, name, sort_order) VALUES (1, @pid, 'Bebida', 0);
SET @o0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Soda', 0);
SET @o0v0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'gaseosa', 1);
SET @o0v1 = LAST_INSERT_ID();
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Soda', 5000.00, 0);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v0);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'gaseosa', 7000.00, 1);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v1);

-- Gaseosa
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Bebida' LIMIT 1), 'Gaseosa', NULL, 0.00, 0.00, 0, 1, 1, 0);
SET @pid = LAST_INSERT_ID();
INSERT INTO product_options (business_id, product_id, name, sort_order) VALUES (1, @pid, 'Sabor', 0);
SET @o0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Coca', 0);
SET @o0v0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Fanta', 1);
SET @o0v1 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Ginger Ale', 2);
SET @o0v2 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Sprite', 3);
SET @o0v3 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'pomelo', 4);
SET @o0v4 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'tonica', 5);
SET @o0v5 = LAST_INSERT_ID();
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Coca', 4000.00, 0);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v0);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Fanta', 4000.00, 1);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v1);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Ginger Ale', 4000.00, 2);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v2);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Sprite', 4000.00, 3);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v3);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'pomelo', 4000.00, 4);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v4);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'tonica', 4000.00, 5);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v5);

-- Pizza Cipollina
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'Pizza Cipollina', NULL, 0.00, 0.00, 0, 1, 1, 0);
SET @pid = LAST_INSERT_ID();
INSERT INTO product_options (business_id, product_id, name, sort_order) VALUES (1, @pid, 'Queso', 0);
SET @o0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Queso Común', 0);
SET @o0v0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Queso Vegano', 1);
SET @o0v1 = LAST_INSERT_ID();
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Queso Común', 12000.00, 0);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v0);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Queso Vegano', 12000.00, 1);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v1);

-- Pizza Genovesa
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'Pizza Genovesa', NULL, 0.00, 0.00, 0, 1, 1, 0);
SET @pid = LAST_INSERT_ID();
INSERT INTO product_options (business_id, product_id, name, sort_order) VALUES (1, @pid, 'Queso', 0);
SET @o0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Queso Común', 0);
SET @o0v0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Queso Vegano', 1);
SET @o0v1 = LAST_INSERT_ID();
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Queso Común', 13000.00, 0);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v0);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Queso Vegano', 13000.00, 1);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v1);

-- Pizza Margarita
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'Pizza Margarita', NULL, 0.00, 0.00, 0, 1, 1, 0);
SET @pid = LAST_INSERT_ID();
INSERT INTO product_options (business_id, product_id, name, sort_order) VALUES (1, @pid, 'Queso', 0);
SET @o0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Queso Común', 0);
SET @o0v0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Queso Vegano', 1);
SET @o0v1 = LAST_INSERT_ID();
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Queso Común', 11000.00, 0);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v0);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Queso Vegano', 11000.00, 1);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v1);

-- Pizza molde entera
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'Pizza molde entera', NULL, 0.00, 0.00, 0, 1, 1, 0);
SET @pid = LAST_INSERT_ID();
INSERT INTO product_options (business_id, product_id, name, sort_order) VALUES (1, @pid, 'Variedad', 0);
SET @o0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Fugazzeta', 0);
SET @o0v0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Muzzarella', 1);
SET @o0v1 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Napolitana', 2);
SET @o0v2 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'arrabbiata', 3);
SET @o0v3 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'especial', 4);
SET @o0v4 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'pineta', 5);
SET @o0v5 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'pucheta', 6);
SET @o0v6 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'quattro', 7);
SET @o0v7 = LAST_INSERT_ID();
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Fugazzeta', 30000.00, 0);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v0);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Muzzarella', 24000.00, 1);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v1);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Napolitana', 30000.00, 2);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v2);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'arrabbiata', 36000.00, 3);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v3);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'especial', 36000.00, 4);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v4);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'pineta', 30000.00, 5);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v5);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'pucheta', 36000.00, 6);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v6);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'quattro', 36000.00, 7);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v7);

-- Pizza Pineta
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'Pizza Pineta', NULL, 0.00, 0.00, 0, 1, 1, 0);
SET @pid = LAST_INSERT_ID();
INSERT INTO product_options (business_id, product_id, name, sort_order) VALUES (1, @pid, 'Queso', 0);
SET @o0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Queso Común', 0);
SET @o0v0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Queso Vegano', 1);
SET @o0v1 = LAST_INSERT_ID();
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Queso Común', 13000.00, 0);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v0);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Queso Vegano', 13000.00, 1);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v1);

-- Pizza Romerina
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'Pizza Romerina', NULL, 0.00, 0.00, 0, 1, 1, 0);
SET @pid = LAST_INSERT_ID();
INSERT INTO product_options (business_id, product_id, name, sort_order) VALUES (1, @pid, 'Queso', 0);
SET @o0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Queso Común', 0);
SET @o0v0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Queso Vegano', 1);
SET @o0v1 = LAST_INSERT_ID();
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Queso Común', 14000.00, 0);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v0);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Queso Vegano', 14000.00, 1);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v1);

-- Porcion Molde
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Pizza' LIMIT 1), 'Porcion Molde', NULL, 0.00, 0.00, 0, 1, 1, 0);
SET @pid = LAST_INSERT_ID();
INSERT INTO product_options (business_id, product_id, name, sort_order) VALUES (1, @pid, 'Variedad', 0);
SET @o0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Arrabbiata', 0);
SET @o0v0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Especial', 1);
SET @o0v1 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Fugazzeta', 2);
SET @o0v2 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Fugazzeta Rellena', 3);
SET @o0v3 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Muzzarella', 4);
SET @o0v4 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Napolitana', 5);
SET @o0v5 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Pineta', 6);
SET @o0v6 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Pucheta', 7);
SET @o0v7 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Quattro', 8);
SET @o0v8 = LAST_INSERT_ID();
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Arrabbiata', 6000.00, 0);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v0);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Especial', 6000.00, 1);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v1);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Fugazzeta', 5000.00, 2);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v2);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Fugazzeta Rellena', 7000.00, 3);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v3);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Muzzarella', 4000.00, 4);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v4);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Napolitana', 5000.00, 5);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v5);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Pineta', 5000.00, 6);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v6);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Pucheta', 6000.00, 7);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v7);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Quattro', 6000.00, 8);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v8);

-- Vino botella
INSERT INTO products (business_id, category_id, name, description, price, cost, track_stock, is_active, has_variants, is_open_price) VALUES (1, (SELECT id FROM categories WHERE business_id=1 AND name='Bebida' LIMIT 1), 'Vino botella', NULL, 0.00, 0.00, 0, 1, 1, 0);
SET @pid = LAST_INSERT_ID();
INSERT INTO product_options (business_id, product_id, name, sort_order) VALUES (1, @pid, 'Etiqueta', 0);
SET @o0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Bonarda Las Liebres', 0);
SET @o0v0 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Criolla Alma Hippie', 1);
SET @o0v1 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Malbec Ambrosia', 2);
SET @o0v2 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Pinot Noir Serbal', 3);
SET @o0v3 = LAST_INSERT_ID();
INSERT INTO product_option_values (business_id, option_id, value, sort_order) VALUES (1, @o0, 'Sauv Blanc Antucura', 4);
SET @o0v4 = LAST_INSERT_ID();
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Bonarda Las Liebres', 18000.00, 0);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v0);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Criolla Alma Hippie', 18000.00, 1);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v1);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Malbec Ambrosia', 18000.00, 2);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v2);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Pinot Noir Serbal', 18000.00, 3);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v3);
INSERT INTO product_variants (business_id, product_id, label, price, sort_order) VALUES (1, @pid, 'Sauv Blanc Antucura', 18000.00, 4);
SET @var = LAST_INSERT_ID();
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES (@var, @o0v4);

COMMIT;

-- Verificación:
-- SELECT name, has_variants, is_open_price FROM products WHERE business_id=1 ORDER BY has_variants DESC, name;
-- SELECT p.name, v.label, v.price FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.business_id=1 ORDER BY p.name, v.sort_order;
