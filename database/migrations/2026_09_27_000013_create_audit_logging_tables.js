const { create, drop, index, optional, col, DB } = use('App/Support/Migration');

// Forensics: tamper-evident audit trail, per-request logs (monthly partitions), security
// events and PII access log. All payloads are redacted before insert (app/Security/Redactor).
function monthlyPartitions(monthsAhead = 12) {
    const parts = [];
    const d = new Date(); d.setUTCDate(1);
    for (let i = 0; i <= monthsAhead; i++) {
        const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1));
        const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i + 1, 1));
        const name = `p${from.getUTCFullYear()}${String(from.getUTCMonth() + 1).padStart(2, '0')}`;
        parts.push(`PARTITION ${name} VALUES LESS THAN ('${next.toISOString().slice(0, 10)}')`);
    }
    parts.push('PARTITION pmax VALUES LESS THAN (MAXVALUE)');
    return `PARTITION BY RANGE COLUMNS (occurred_at) (\n  ${parts.join(',\n  ')}\n)`;
}

class CreateAuditLoggingTables {
    async up() {
        await create('audit_logs', [
            col.id,
            'occurred_at DATETIME(3) NOT NULL',
            col.by('actor_user_id'),
            "actor_type ENUM('customer','merchant_staff','cms','system','gateway','api_client') NOT NULL",
            'actor_label VARCHAR(190) NULL',
            "actor_roles JSON NULL COMMENT 'role slugs at the time of the action'",
            col.fk('merchant_id', true),
            'action VARCHAR(80) NOT NULL',
            'subject_type VARCHAR(60) NULL',
            'subject_id VARCHAR(60) NULL',
            'subject_label VARCHAR(190) NULL',
            "before_state JSON NULL COMMENT 'redacted'",
            "after_state JSON NULL COMMENT 'redacted'",
            'meta JSON NULL',
            'request_id CHAR(26) NULL',
            col.ip('ip'),
            'user_agent VARCHAR(512) NULL',
            'prev_hash CHAR(64) NULL',
            "row_hash CHAR(64) NOT NULL COMMENT 'sha256(prev_hash + canonical row)'",
            index('ix_audit_occurred', 'occurred_at'),
            index('ix_audit_actor', 'actor_user_id', 'occurred_at'),
            index('ix_audit_subject', 'subject_type', 'subject_id'),
            index('ix_audit_action', 'action', 'occurred_at'),
            index('ix_audit_merchant', 'merchant_id', 'occurred_at'),
            index('ix_audit_request', 'request_id'),
        ]);

        // Single-row chain head, locked FOR UPDATE so concurrent writers (any instance) chain in order.
        await create('audit_chain_head', [
            'id TINYINT UNSIGNED NOT NULL PRIMARY KEY',
            'last_id BIGINT UNSIGNED NULL',
            'last_hash CHAR(64) NULL',
        ]);
        await DB.statement('INSERT IGNORE INTO audit_chain_head (id, last_id, last_hash) VALUES (1, NULL, NULL)');

        // Append-only guard. Needs TRIGGER privilege (and log_bin_trust_function_creators when binlog is on).
        await optional(`CREATE TRIGGER trg_audit_logs_no_update BEFORE UPDATE ON audit_logs FOR EACH ROW
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only'`, 'audit_logs update trigger not created');
        await optional(`CREATE TRIGGER trg_audit_logs_no_delete BEFORE DELETE ON audit_logs FOR EACH ROW
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only'`, 'audit_logs delete trigger not created');

        await create('request_logs', [
            'id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
            'occurred_at DATETIME(3) NOT NULL',
            'request_id CHAR(26) NOT NULL',
            'method VARCHAR(8) NOT NULL',
            'route VARCHAR(190) NULL',
            'path VARCHAR(512) NOT NULL',
            "query JSON NULL COMMENT 'redacted'",
            'status SMALLINT NULL',
            'duration_ms INT NULL',
            col.ip('ip'),
            col.ip('remote_addr'),
            'remote_port INT NULL',
            'x_forwarded_for VARCHAR(512) NULL',
            col.ip('cf_connecting_ip'),
            col.ip('x_real_ip'),
            col.bool('via_proxy'),
            'host VARCHAR(190) NULL',
            'user_agent VARCHAR(512) NULL',
            'referer VARCHAR(512) NULL',
            'origin VARCHAR(190) NULL',
            'accept_language VARCHAR(120) NULL',
            'device_hash CHAR(64) NULL',
            col.by('user_id'),
            "user_type VARCHAR(20) NULL",
            col.by('auth_session_id'),
            col.by('api_client_id'),
            col.by('merchant_id'),
            'req_bytes INT NULL',
            'res_bytes INT NULL',
            "headers JSON NULL COMMENT 'redacted, auth/cookie headers dropped'",
            "body JSON NULL COMMENT 'redacted, mutating requests only, capped'",
            'error_code VARCHAR(60) NULL',
            'error_message VARCHAR(255) NULL',
            col.bool('blocked'),
            'PRIMARY KEY (id, occurred_at)',
            index('ix_request_logs_request', 'request_id'),
            index('ix_request_logs_ip', 'ip', 'occurred_at'),
            index('ix_request_logs_user', 'user_id', 'occurred_at'),
            index('ix_request_logs_status', 'status', 'occurred_at'),
            index('ix_request_logs_occurred', 'occurred_at'),
        ], monthlyPartitions());

        await create('security_events', [
            col.id,
            'occurred_at DATETIME(3) NOT NULL',
            "event VARCHAR(60) NOT NULL COMMENT 'login_failed, otp_failed, permission_denied, csrf_failed, rate_limited, block_hit, secret_used ...'",
            "severity ENUM('info','warning','critical') NOT NULL DEFAULT 'info'",
            col.by('user_id'),
            'phone VARCHAR(20) NULL',
            'email VARCHAR(190) NULL',
            col.ip('ip'),
            'device_hash CHAR(64) NULL',
            'request_id CHAR(26) NULL',
            'path VARCHAR(255) NULL',
            'details JSON NULL',
            index('ix_security_events', 'event', 'occurred_at'),
            index('ix_security_events_ip', 'ip', 'event', 'occurred_at'),
            index('ix_security_events_phone', 'phone', 'event', 'occurred_at'),
            index('ix_security_events_user', 'user_id', 'occurred_at'),
        ]);

        await create('data_access_logs', [
            col.id,
            'occurred_at DATETIME(3) NOT NULL',
            col.by('user_id'),
            "resource VARCHAR(60) NOT NULL COMMENT 'kyc_document, customer_contact, settlement_account, gateway_secret'",
            'resource_id VARCHAR(60) NOT NULL',
            col.fk('merchant_id', true),
            'purpose VARCHAR(190) NULL',
            'request_id CHAR(26) NULL',
            col.ip('ip'),
            index('ix_data_access_resource', 'resource', 'resource_id'),
            index('ix_data_access_user', 'user_id', 'occurred_at'),
        ]);
    }

    async down() {
        try { await DB.statement('DROP TRIGGER IF EXISTS trg_audit_logs_no_update'); } catch { /* ignore */ }
        try { await DB.statement('DROP TRIGGER IF EXISTS trg_audit_logs_no_delete'); } catch { /* ignore */ }
        await drop('data_access_logs', 'security_events', 'request_logs', 'audit_chain_head', 'audit_logs');
    }
}

module.exports = CreateAuditLoggingTables;
