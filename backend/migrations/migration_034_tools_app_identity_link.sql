-- Vincula cuentas de Tools con identidades de Pizzalog App y separa espacios de trabajo.
-- Ejecutar una sola vez en la base de datos de Pizzalog API.

ALTER TABLE tools_accounts
    MODIFY COLUMN password_hash VARCHAR(255) NULL,
    DROP INDEX uq_tools_accounts_email,
    ADD COLUMN environment VARCHAR(16) NOT NULL DEFAULT 'production' AFTER email,
    ADD COLUMN app_user_id BIGINT UNSIGNED NULL AFTER password_hash,
    ADD COLUMN business_id BIGINT UNSIGNED NULL AFTER app_user_id,
    ADD UNIQUE KEY uq_tools_accounts_email_environment (email, environment),
    ADD UNIQUE KEY uq_tools_accounts_app_user_environment (app_user_id, environment),
    ADD KEY idx_tools_accounts_business (business_id),
    ADD CONSTRAINT fk_tools_accounts_app_user
        FOREIGN KEY (app_user_id) REFERENCES users (id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_tools_accounts_business
        FOREIGN KEY (business_id) REFERENCES businesses (id) ON DELETE SET NULL;
