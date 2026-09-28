const { create, drop, unique, col } = use('App/Support/Migration');

// Customer payment methods and platform gateway / integration credentials.
// Secrets are only ever stored as envelope ciphertext (see app/Security/Envelope.js).
class CreatePaymentConfigTables {
    async up() {
        await create('payment_methods', [
            col.id,
            'code VARCHAR(40) NOT NULL',
            'name VARCHAR(120) NOT NULL',
            'subtitle VARCHAR(190) NULL',
            'icon VARCHAR(60) NULL',
            'color VARCHAR(9) NULL',
            "gateway ENUM('sslcommerz','bkash') NOT NULL",
            "multi_card_name VARCHAR(190) NULL COMMENT 'SSLCOMMERZ channel pre-selection'",
            "channel ENUM('online','pos') NOT NULL DEFAULT 'online'",
            col.sort, col.bool('is_enabled', 1),
            col.timestamps,
            unique('uq_payment_methods_code', 'code', 'channel'),
        ]);

        await create('gateway_settings', [
            col.id,
            "gateway ENUM('sslcommerz','bkash') NOT NULL",
            col.bool('is_enabled'),
            col.bool('sandbox', 1),
            "public_id VARCHAR(120) NULL COMMENT 'SSLCOMMERZ store id / bKash app key + username'",
            'public_config JSON NULL',
            "secret_ciphertext TEXT NULL COMMENT 'encrypted JSON of secret fields'",
            'key_version VARCHAR(16) NULL',
            'secret_last4 VARCHAR(8) NULL',
            'verified_at DATETIME(3) NULL',
            col.by('updated_by'),
            col.timestamps,
            unique('uq_gateway_settings', 'gateway'),
        ]);

        await create('integration_credentials', [
            col.id,
            "provider VARCHAR(40) NOT NULL COMMENT 'sms, smtp, maps ...'",
            'name VARCHAR(120) NOT NULL',
            col.bool('is_enabled'),
            'public_config JSON NULL',
            'secret_ciphertext TEXT NULL',
            'key_version VARCHAR(16) NULL',
            'secret_last4 VARCHAR(8) NULL',
            'verified_at DATETIME(3) NULL',
            col.by('updated_by'),
            col.timestamps,
            unique('uq_integration_credentials', 'provider'),
        ]);
    }

    async down() {
        await drop('integration_credentials', 'gateway_settings', 'payment_methods');
    }
}

module.exports = CreatePaymentConfigTables;
