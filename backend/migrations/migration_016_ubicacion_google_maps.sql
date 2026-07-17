-- =====================================================================
--  Migración 016 · Ubicación = link de Google Maps (no coordenadas)
-- =====================================================================
--  latitude/longitude solo se usaban para el iframe del mapa en la carta
--  (PublicController::menu + MapModal). No hay cálculo de zona de
--  delivery ni nada más que dependa de ellas, así que se dropean.
-- =====================================================================

ALTER TABLE businesses
    ADD COLUMN google_maps_url VARCHAR(255) NULL AFTER address;
    -- el link "Compartir" del perfil de Google Maps del negocio
    -- (https://maps.app.goo.gl/... o https://www.google.com/maps/place/...)

ALTER TABLE businesses
    DROP COLUMN latitude,
    DROP COLUMN longitude;
