const { create, drop, fk, unique, index, col } = use('App/Support/Migration');

// Sessions, OTP, password reset, MFA, API clients. Only hashes / ciphertext are stored.
class CreateAuthTables {
    async up() {
        await create('auth_sessions', [
            col.id,
            col.fk('user_id'),
            "guard ENUM('customer','merchant','cms') NOT NULL",
            "token_hash CHAR(64) NOT NULL COMMENT 'HMAC of the cookie token'",
            'csrf_hash CHAR(64) NOT NULL',
            col.bool('mfa_passed'),
            col.ip('ip'),
            'user_agent VARCHAR(512) NULL',
            'device_hash CHAR(64) NULL',
            'created_at DATETIME(3) NOT NULL',
            'last_seen_at DATETIME(3) NOT NULL',
            'idle_expires_at DATETIME(3) NOT NULL',
            'expires_at DATETIME(3) NOT NULL',
            'revoked_at DATETIME(3) NULL',
            'revoke_reason VARCHAR(120) NULL',
            unique('uq_auth_sessions_token', 'token_hash'),
            index('ix_auth_sessions_user', 'user_id', 'revoked_at'),
            fk('user_id', 'users', 'CASCADE'),
        ]);

        await create('otp_challenges', [
            col.id,
            'phone VARCHAR(20) NOT NULL',
            "purpose ENUM('login','transfer','verify') NOT NULL DEFAULT 'login'",
            'code_hash CHAR(64) NOT NULL',
            'attempts INT NOT NULL DEFAULT 0',
            col.ip('ip'),
            'created_at DATETIME(3) NOT NULL',
            'expires_at DATETIME(3) NOT NULL',
            'consumed_at DATETIME(3) NULL',
            index('ix_otp_phone', 'phone', 'purpose', 'created_at'),
        ]);

        await create('password_resets', [
            col.id,
            col.fk('user_id'),
            'token_hash CHAR(64) NOT NULL',
            col.ip('ip'),
            'created_at DATETIME(3) NOT NULL',
            'expires_at DATETIME(3) NOT NULL',
            'used_at DATETIME(3) NULL',
            unique('uq_password_resets_token', 'token_hash'),
            fk('user_id', 'users', 'CASCADE'),
        ]);

        await create('mfa_factors', [
            col.id,
            col.fk('user_id'),
            "type ENUM('totp') NOT NULL DEFAULT 'totp'",
            'secret_ciphertext TEXT NOT NULL',
            'key_version VARCHAR(16) NOT NULL',
            'confirmed_at DATETIME(3) NULL',
            "last_used_step BIGINT NULL COMMENT 'replay protection'",
            col.timestamps,
            unique('uq_mfa_user_type', 'user_id', 'type'),
            fk('user_id', 'users', 'CASCADE'),
        ]);

        await create('api_clients', [
            col.id, col.uuid,
            'name VARCHAR(120) NOT NULL',
            "key_prefix CHAR(8) NOT NULL COMMENT 'shown to identify the key'",
            'key_hash CHAR(64) NOT NULL',
            'scopes JSON NULL',
            'allowed_origins JSON NULL',
            'allowed_ips JSON NULL',
            col.fk('merchant_id', true),
            "status ENUM('active','revoked','blocked') NOT NULL DEFAULT 'active'",
            'last_used_at DATETIME(3) NULL',
            col.ip('last_used_ip'),
            col.by('created_by'),
            col.timestamps,
            unique('uq_api_clients_key', 'key_hash'),
            unique('uq_api_clients_uuid', 'uuid'),
        ]);
    }

    async down() {
        await drop('api_clients', 'mfa_factors', 'password_resets', 'otp_challenges', 'auth_sessions');
    }
}

module.exports = CreateAuthTables;
