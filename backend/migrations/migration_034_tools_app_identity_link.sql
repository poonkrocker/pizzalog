-- Vincula una cuenta comercial de Tools con un usuario administrador de Pizzalog App.
-- Ejecutar una sola vez en la misma base de datos donde ya se ejecutó migration_031.

ALTER TABLE tools_accounts
    MODIFY COLUMN password_hash VARCHAR(255) NULL,
    ADD COLUMN app_user_id BIGINT UNSIGNED NULL AFTER password_hash,
    ADD COLUMN business_id BIGINT UNSIGNED NULL AFTER app_user_id,
    ADD UNIQUE KEY uq_tools_accounts_app_user (app_user_id),
    ADD KEY idx_tools_accounts_business (business_id),
    ADD CONSTRAINT fk_tools_accounts_app_user
        FOREIGN KEY (app_user_id) REFERENCES users (id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_tools_accounts_business
        FOREIGN KEY (business_id) REFERENCES businesses (id) ON DELETE SET NULL;
