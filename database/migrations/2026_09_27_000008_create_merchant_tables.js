const { create, drop, fk, unique, index, col, DB } = use('App/Support/Migration');

// Merchants, KYC, settlement accounts, direct-mode gateway credentials, agreement acceptance.
class CreateMerchantTables {
    async up() {
        await create('merchants', [
            col.id, col.uuid,
            'name VARCHAR(190) NOT NULL',
            'slug VARCHAR(120) NOT NULL',
            "business_type VARCHAR(80) NULL COMMENT 'lookup business_types'",
            "status ENUM('pending','active','rejected','suspended') NOT NULL DEFAULT 'pending'",
            'status_note VARCHAR(255) NULL',
            'commission_pct DECIMAL(5,2) NOT NULL DEFAULT 8.00',
            'legal_name VARCHAR(190) NULL',
            'trade_license VARCHAR(80) NULL',
            'tin VARCHAR(40) NULL', 'bin VARCHAR(40) NULL',
            'address VARCHAR(255) NULL',
            'website VARCHAR(190) NULL',
            'contact_name VARCHAR(150) NULL',
            'contact_email VARCHAR(190) NULL',
            'contact_phone VARCHAR(20) NULL',
            col.fk('logo_media_id', true),
            "pg_mode ENUM('platform','direct') NOT NULL DEFAULT 'platform'",
            "kyc_status ENUM('draft','submitted','verified','rejected') NOT NULL DEFAULT 'draft'",
            'kyc_submitted_at DATETIME(3) NULL',
            'kyc_reviewed_at DATETIME(3) NULL',
            col.by('kyc_reviewed_by'),
            'kyc_note VARCHAR(255) NULL',
            "settlement_cycle ENUM('daily','weekly','monthly') NOT NULL DEFAULT 'weekly'",
            col.timestamps, col.softDeletes,
            unique('uq_merchants_uuid', 'uuid'),
            unique('uq_merchants_slug', 'slug'),
            index('ix_merchants_status', 'status'),
        ]);

        await create('merchant_kyc_documents', [
            col.id,
            col.fk('merchant_id'),
            col.fk('document_type_id'),
            col.fk('media_id'),
            "status ENUM('submitted','accepted','rejected') NOT NULL DEFAULT 'submitted'",
            col.by('reviewed_by'),
            'reviewed_at DATETIME(3) NULL',
            'note VARCHAR(255) NULL',
            col.timestamps,
            index('ix_kyc_docs_merchant', 'merchant_id'),
            fk('merchant_id', 'merchants', 'CASCADE'),
            fk('document_type_id', 'kyc_document_types'),
            fk('media_id', 'media'),
        ]);

        await create('merchant_settlement_accounts', [
            col.id,
            col.fk('merchant_id'),
            "type ENUM('bank','mfs') NOT NULL DEFAULT 'bank'",
            col.fk('bank_id', true),
            'account_name VARCHAR(150) NULL',
            "account_no_ciphertext TEXT NULL COMMENT 'encrypted; show last4 only'",
            'account_no_last4 VARCHAR(8) NULL',
            'key_version VARCHAR(16) NULL',
            'branch VARCHAR(150) NULL',
            'routing VARCHAR(20) NULL',
            col.bool('is_primary', 1),
            col.timestamps,
            index('ix_settlement_accounts_merchant', 'merchant_id'),
            fk('merchant_id', 'merchants', 'CASCADE'),
            fk('bank_id', 'banks', 'SET NULL'),
        ]);

        await create('merchant_gateway_credentials', [
            col.id,
            col.fk('merchant_id'),
            "gateway ENUM('sslcommerz','bkash') NOT NULL",
            'public_id VARCHAR(120) NULL',
            'public_config JSON NULL',
            'secret_ciphertext TEXT NULL',
            'key_version VARCHAR(16) NULL',
            'secret_last4 VARCHAR(8) NULL',
            col.bool('sandbox', 1),
            'verified_at DATETIME(3) NULL',
            col.by('updated_by'),
            col.timestamps,
            unique('uq_merchant_gateway', 'merchant_id', 'gateway'),
            fk('merchant_id', 'merchants', 'CASCADE'),
        ]);

        await create('merchant_agreement_acceptances', [
            col.id,
            col.fk('merchant_id'),
            col.fk('user_id'),
            col.fk('page_version_id'),
            'accepted_at DATETIME(3) NOT NULL',
            col.ip('ip'),
            'user_agent VARCHAR(512) NULL',
            fk('merchant_id', 'merchants', 'CASCADE'),
            fk('user_id', 'users', 'CASCADE'),
            fk('page_version_id', 'cms_page_versions'),
        ]);

        // Late foreign keys to merchants from earlier tables
        await DB.statement('ALTER TABLE users ADD CONSTRAINT fk_users_merchant_id FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE SET NULL');
        await DB.statement('ALTER TABLE user_roles ADD CONSTRAINT fk_user_roles_merchant_id FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE');
        await DB.statement('ALTER TABLE roles ADD CONSTRAINT fk_roles_merchant_id FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE');
        await DB.statement('ALTER TABLE venues ADD CONSTRAINT fk_venues_merchant_id FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE SET NULL');
        await DB.statement('ALTER TABLE layout_templates ADD CONSTRAINT fk_layout_templates_owner FOREIGN KEY (owner_merchant_id) REFERENCES merchants (id) ON DELETE CASCADE');
    }

    async down() {
        for (const [t, c] of [['users', 'fk_users_merchant_id'], ['user_roles', 'fk_user_roles_merchant_id'], ['roles', 'fk_roles_merchant_id'], ['venues', 'fk_venues_merchant_id'], ['layout_templates', 'fk_layout_templates_owner']]) {
            try { await DB.statement(`ALTER TABLE ${t} DROP FOREIGN KEY ${c}`); } catch { /* table already gone */ }
        }
        await drop('merchant_agreement_acceptances', 'merchant_gateway_credentials', 'merchant_settlement_accounts', 'merchant_kyc_documents', 'merchants');
    }
}

module.exports = CreateMerchantTables;
