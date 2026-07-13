-- =====================================================================
--  Migración 009 · Perfil público del negocio (la carta en /tunegocio)
-- =====================================================================
--  Campos del encabezado de la carta pública: foto de perfil,
--  descripción, redes sociales y ubicación en el mapa.
--  El slug ya existía (businesses.slug) y define la URL:
--  pizzalog.net/{slug}. Ahora se puede editar desde el panel.
-- =====================================================================

ALTER TABLE businesses
    ADD COLUMN description TEXT NULL AFTER address,
    ADD COLUMN logo_url    VARCHAR(300) NULL AFTER description,
    ADD COLUMN instagram   VARCHAR(120) NULL AFTER logo_url,
    ADD COLUMN facebook    VARCHAR(120) NULL AFTER instagram,
    ADD COLUMN tiktok      VARCHAR(120) NULL AFTER facebook,
    ADD COLUMN latitude    DECIMAL(10,7) NULL AFTER tiktok,
    ADD COLUMN longitude   DECIMAL(10,7) NULL AFTER latitude;
