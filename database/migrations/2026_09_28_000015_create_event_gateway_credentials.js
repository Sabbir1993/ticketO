const { create, drop, fk, unique, col, DB } = use('App/Support/Migration');

// Gateways are configured by the merchant: a default store per merchant (merchant_gateway_credentials)
// and an optional store per event (this table). There is no platform store any more, so every online
// payment settles to the merchant's own account (pg_mode 'direct').
class CreateEventGatewayCredentials {
    async up() {
        await create('event_gateway_credentials', [
            col.id,
            col.fk('event_id'),
            col.fk('merchant_id'),
            "gateway ENUM('sslcommerz','bkash') NOT NULL",
            'public_id VARCHAR(120) NULL',
            'public_config JSON NULL',
            'secret_ciphertext TEXT NULL',
            'key_version VARCHAR(16) NULL',
            'secret_last4 VARCHAR(8) NULL',
            // 0 = the event uses the merchant default again; the row is kept so in-flight payments still validate
            col.active,
            'verified_at DATETIME(3) NULL',
            col.by('updated_by'),
            col.timestamps,
            unique('uq_event_gateway', 'event_id', 'gateway'),
            fk('event_id', 'events', 'CASCADE'),
            fk('merchant_id', 'merchants', 'CASCADE'),
        ]);
        // Which account opened the session, so the IPN / validation uses the same store.
        await DB.statement("ALTER TABLE payments ADD COLUMN credential_source ENUM('event','merchant') NULL AFTER pg_mode");
        await DB.statement("ALTER TABLE merchants MODIFY pg_mode ENUM('platform','direct') NOT NULL DEFAULT 'direct'");
        await DB.statement("UPDATE merchants SET pg_mode = 'direct'");
        await DB.statement("DELETE FROM settings WHERE setting_group = 'platform' AND setting_key = 'allow_merchant_direct_pg'"); // no longer optional
        // The platform store is no longer used: drop its encrypted credentials rather than keep an idle secret.
        await DB.statement('UPDATE gateway_settings SET public_id = NULL, public_config = NULL, secret_ciphertext = NULL, key_version = NULL, secret_last4 = NULL, verified_at = NULL');
    }

    async down() {
        await DB.statement('ALTER TABLE payments DROP COLUMN credential_source');
        await DB.statement("ALTER TABLE merchants MODIFY pg_mode ENUM('platform','direct') NOT NULL DEFAULT 'platform'");
        await drop('event_gateway_credentials');
    }
}

module.exports = CreateEventGatewayCredentials;
