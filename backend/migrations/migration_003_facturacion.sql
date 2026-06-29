-- =====================================================================
--  PIZZALOG · Migración 003
--  Facturación electrónica (ARCA). Módulo OPCIONAL e interno: un negocio
--  factura solo si tiene emisores cargados. Soporta múltiples emisores
--  (p. ej. varias cuentas de monotributo) y registra con cuál se emitió
--  cada comprobante.
--
--  Correr después de migration_002.
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
--  1) Emisores fiscales (cuentas de facturación)
--     Cada uno es una identidad ante ARCA: su CUIT, condición, punto de
--     venta y certificado. El contenido del certificado/clave vive en
--     disco fuera del repo y del docroot; acá se guarda solo la ruta.
-- ---------------------------------------------------------------------
CREATE TABLE fiscal_issuers (
    id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id          BIGINT UNSIGNED NOT NULL,
    name                 VARCHAR(120)    NOT NULL,           -- etiqueta legible
    cuit                 VARCHAR(13)     NOT NULL,
    tax_condition        ENUM('monotributo','responsable_inscripto','exento')
                                         NOT NULL DEFAULT 'monotributo',
    default_invoice_type ENUM('A','B','C') NOT NULL DEFAULT 'C',
    point_of_sale        INT UNSIGNED    NOT NULL,
    cert_path            VARCHAR(255)    NULL,               -- ruta al .pem (fuera del docroot)
    key_path             VARCHAR(255)    NULL,
    environment          ENUM('homologation','production') NOT NULL DEFAULT 'homologation',
    is_active            TINYINT(1)      NOT NULL DEFAULT 1,
    is_default           TINYINT(1)      NOT NULL DEFAULT 0,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_issuer_cuit_pv (business_id, cuit, point_of_sale),
    KEY idx_issuers_business (business_id),
    CONSTRAINT fk_issuers_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
--  2) Comprobantes emitidos
--     Vinculados (opcionalmente) a una venta. Guardan el CAE y su
--     vencimiento, los importes, el receptor y con qué emisor se emitió.
--     'environment' distingue comprobantes de homologación (prueba) de
--     los de producción (con validez fiscal).
-- ---------------------------------------------------------------------
CREATE TABLE invoices (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    business_id         BIGINT UNSIGNED NOT NULL,
    fiscal_issuer_id    BIGINT UNSIGNED NOT NULL,
    sale_id             BIGINT UNSIGNED NULL,
    invoice_type        ENUM('A','B','C') NOT NULL,
    point_of_sale       INT UNSIGNED    NOT NULL,
    number              BIGINT UNSIGNED NULL,                -- lo asigna ARCA
    receptor_doc_type   ENUM('CUIT','CUIL','DNI','CF') NOT NULL DEFAULT 'CF',
    receptor_doc_number VARCHAR(20)     NULL,
    net_amount          DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    iva_amount          DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    total               DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    cae                 VARCHAR(20)     NULL,
    cae_expiration      DATE            NULL,
    issued_at           DATETIME        NULL,
    environment         ENUM('homologation','production') NOT NULL DEFAULT 'homologation',
    status              ENUM('pending','issued','error','cancelled') NOT NULL DEFAULT 'pending',
    error_message       VARCHAR(500)    NULL,
    created_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_invoices_business_date (business_id, created_at),
    KEY idx_invoices_issuer (fiscal_issuer_id),
    KEY idx_invoices_sale (sale_id),
    CONSTRAINT fk_invoices_business FOREIGN KEY (business_id)
        REFERENCES businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_invoices_issuer FOREIGN KEY (fiscal_issuer_id)
        REFERENCES fiscal_issuers (id),
    CONSTRAINT fk_invoices_sale FOREIGN KEY (sale_id)
        REFERENCES sales (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
