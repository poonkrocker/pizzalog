-- Preferencias de analítica guardadas por negocio (presets de mapa de calor).
CREATE TABLE IF NOT EXISTS analytics_preferences (
  business_id INT NOT NULL PRIMARY KEY,
  settings_json JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
