-- =====================================================================
--  Migración 015 · Redes sociales del negocio (tabla propia)
-- =====================================================================
--  Reemplaza las columnas sueltas businesses.instagram/facebook/tiktok.
--  `platform` es texto libre (no ENUM) para no migrar de nuevo cada vez
--  que aparezca una red nueva; el ícono lo resuelve el frontend con un
--  mapa conocido y cae a un ícono genérico si no la conoce.
-- =====================================================================

CREATE TABLE business_social_links (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id BIGINT UNSIGNED NOT NULL,
    platform    VARCHAR(30) NOT NULL,    -- 'instagram','facebook','tiktok','x',
                                         -- 'whatsapp','website','email','phone', etc.
    url         VARCHAR(255) NOT NULL,   -- link completo, o 'mailto:'/'tel:'
    sort_order  INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_social_business (business_id),
    CONSTRAINT fk_social_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrar las columnas viejas (guardaban el usuario, no la URL) a filas.
INSERT INTO business_social_links (business_id, platform, url, sort_order)
SELECT id, 'instagram', CONCAT('https://instagram.com/', instagram), 0
  FROM businesses WHERE instagram IS NOT NULL AND instagram <> '';
INSERT INTO business_social_links (business_id, platform, url, sort_order)
SELECT id, 'facebook', CONCAT('https://facebook.com/', facebook), 1
  FROM businesses WHERE facebook IS NOT NULL AND facebook <> '';
INSERT INTO business_social_links (business_id, platform, url, sort_order)
SELECT id, 'tiktok', CONCAT('https://tiktok.com/@', tiktok), 2
  FROM businesses WHERE tiktok IS NOT NULL AND tiktok <> '';

-- Una sola fuente de verdad: fuera las columnas viejas.
ALTER TABLE businesses
    DROP COLUMN instagram,
    DROP COLUMN facebook,
    DROP COLUMN tiktok;
