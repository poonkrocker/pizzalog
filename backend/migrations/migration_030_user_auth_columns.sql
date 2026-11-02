-- Columnas de autenticación y permisos que antes se agregaban desde requests.
-- Ejecutar una sola vez durante el despliegue, antes de publicar esta versión.
SET @ddl = IF(
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'username') = 0,
    'ALTER TABLE users ADD COLUMN username VARCHAR(60) NULL AFTER name', 'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'allowed_modules') = 0,
    'ALTER TABLE users ADD COLUMN allowed_modules TEXT NULL AFTER role', 'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'can_use_pos') = 0,
    'ALTER TABLE users ADD COLUMN can_use_pos TINYINT(1) NOT NULL DEFAULT 1 AFTER allowed_modules', 'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'staff_person_id') = 0,
    'ALTER TABLE users ADD COLUMN staff_person_id INT NULL AFTER can_use_pos', 'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
    (SELECT IS_NULLABLE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'email') = 'NO',
    'ALTER TABLE users MODIFY COLUMN email VARCHAR(120) NULL', 'SELECT 1'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE users
   SET username = LOWER(SUBSTRING_INDEX(email, '@', 1))
 WHERE (username IS NULL OR username = '')
   AND email IS NOT NULL
   AND email <> '';
