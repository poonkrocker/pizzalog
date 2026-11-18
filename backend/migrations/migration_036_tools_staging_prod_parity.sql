-- Migración 036: Paridad de esquema staging/producción para Pizzalog Tools
-- Idempotente y segura sobre instalaciones con migration_031 + migration_034 previas.

ALTER TABLE tools_accounts
    ADD COLUMN IF NOT EXISTS activation_token VARCHAR(128) NULL,
    ADD COLUMN IF NOT EXISTS activation_token_expires_at DATETIME NULL,
    ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(32) NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(64) NULL;

ALTER TABLE tools_workspaces
    ADD COLUMN IF NOT EXISTS version INT UNSIGNED NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS tools_workspace_backups (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    account_id BIGINT UNSIGNED NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    workspace_json LONGTEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tools_ws_backups_account (account_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
