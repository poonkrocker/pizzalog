-- Pizzalog · Migración 034
-- Vinculación idempotente de artículos/variantes externos (Loyverse) con catálogo App.
-- No altera productos ni ventas existentes.

CREATE TABLE IF NOT EXISTS loyverse_product_links (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id BIGINT UNSIGNED NOT NULL,
    external_key CHAR(64) NOT NULL,
    external_ref VARCHAR(64) NULL,
    external_name VARCHAR(180) NOT NULL,
    external_category VARCHAR(120) NULL,
    external_variant VARCHAR(180) NULL,
    product_id BIGINT UNSIGNED NULL,
    variant_id BIGINT UNSIGNED NULL,
    match_status ENUM('matched','created','review') NOT NULL DEFAULT 'review',
    match_confidence DECIMAL(5,4) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_loyverse_link_business_key (business_id, external_key),
    KEY idx_loyverse_link_product (business_id, product_id),
    CONSTRAINT fk_loyverse_link_business FOREIGN KEY (business_id)
        REFERENCES businesses(id) ON DELETE CASCADE,
    CONSTRAINT fk_loyverse_link_product FOREIGN KEY (product_id)
        REFERENCES products(id) ON DELETE SET NULL,
    CONSTRAINT fk_loyverse_link_variant FOREIGN KEY (variant_id)
        REFERENCES product_variants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
