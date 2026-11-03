-- Pizzalog Tools: cuentas comerciales y espacio de trabajo independiente de App.
-- Ejecutar una sola vez antes de desplegar Tools con autenticación obligatoria.

CREATE TABLE IF NOT EXISTS tools_accounts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(190) NOT NULL,
    name VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    expires_at DATETIME NULL,
    last_login_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_tools_accounts_email (email),
    KEY idx_tools_accounts_active_expiry (is_active, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tools_workspaces (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    account_id BIGINT UNSIGNED NOT NULL,
    workspace_json LONGTEXT NOT NULL,
    schema_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_tools_workspace_account (account_id),
    CONSTRAINT fk_tools_workspace_account FOREIGN KEY (account_id)
        REFERENCES tools_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tools_ai_usage (
    account_id BIGINT UNSIGNED NOT NULL,
    usage_date DATE NOT NULL,
    request_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, usage_date),
    CONSTRAINT fk_tools_ai_usage_account FOREIGN KEY (account_id)
        REFERENCES tools_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
