-- Migración 036: Suscripciones y facturación multicanal (Mercado Pago + LemonSqueezy)
-- para Pizzalog Tools, eventos de webhook idempotentes y tokens de activación.

CREATE TABLE IF NOT EXISTS tools_subscriptions (
    id                       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tools_account_id         BIGINT UNSIGNED NOT NULL,
    provider                 VARCHAR(32) NOT NULL,            -- mercadopago | lemonsqueezy
    provider_customer_id     VARCHAR(128) NULL,
    provider_subscription_id VARCHAR(128) NULL,
    plan                     VARCHAR(32) NOT NULL,            -- monthly | yearly
    status                   VARCHAR(32) NOT NULL DEFAULT 'active', -- active | past_due | cancelled
    current_period_end       DATETIME NULL,
    raw_last_event           MEDIUMTEXT NULL,
    created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_provider_sub (provider, provider_subscription_id),
    KEY idx_ts_account (tools_account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS billing_webhook_events (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    provider     VARCHAR(32) NOT NULL,
    event_id     VARCHAR(128) NOT NULL,
    event_type   VARCHAR(64) NOT NULL,
    payload      MEDIUMTEXT NULL,
    processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_provider_event (provider, event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Procedimiento preparado para agregar columnas de activación en tools_accounts de forma idempotente
SET @db_name = DATABASE();

SET @preparedStatement = (SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db_name
        AND TABLE_NAME = 'tools_accounts'
        AND COLUMN_NAME = 'activation_token') > 0,
    'SELECT 1',
    'ALTER TABLE tools_accounts
        ADD COLUMN activation_token VARCHAR(96) NULL AFTER password_hash,
        ADD COLUMN activation_token_expires_at DATETIME NULL AFTER activation_token,
        ADD KEY idx_ta_activation (activation_token)'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
