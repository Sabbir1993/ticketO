const { create, drop, fk, index, col } = use('App/Support/Migration');

// Blocklist for users, phones, emails, IPs/CIDRs, devices, API clients and merchants,
// plus automatic block rules driven by security events.
class CreateBlockingTables {
    async up() {
        await create('block_rules', [
            col.id,
            'name VARCHAR(120) NOT NULL',
            "event VARCHAR(60) NOT NULL COMMENT 'security_events.event to count'",
            "subject_type ENUM('ip','phone','email','user','device') NOT NULL",
            'threshold INT NOT NULL',
            'window_sec INT NOT NULL',
            "duration_sec INT NULL COMMENT 'NULL = permanent'",
            "scope ENUM('all','login','checkout','api') NOT NULL DEFAULT 'all'",
            col.active,
            col.timestamps,
        ]);

        await create('blocks', [
            col.id,
            "subject_type ENUM('user','phone','email','ip','cidr','device','api_client','merchant') NOT NULL",
            "subject_value VARCHAR(190) NOT NULL COMMENT 'normalised value (lowercase email, +88 phone, IP/CIDR text, id)'",
            'ip_start VARBINARY(16) NULL', 'ip_end VARBINARY(16) NULL',
            "scope ENUM('all','login','checkout','api') NOT NULL DEFAULT 'all'",
            'reason VARCHAR(255) NOT NULL',
            "source ENUM('manual','auto') NOT NULL DEFAULT 'manual'",
            col.fk('rule_id', true),
            col.by('created_by'),
            'starts_at DATETIME(3) NOT NULL',
            'expires_at DATETIME(3) NULL',
            'revoked_at DATETIME(3) NULL',
            col.by('revoked_by'),
            'revoke_reason VARCHAR(255) NULL',
            'hits INT NOT NULL DEFAULT 0',
            'last_hit_at DATETIME(3) NULL',
            col.timestamps,
            index('ix_blocks_subject', 'subject_type', 'subject_value', 'revoked_at'),
            index('ix_blocks_range', 'ip_start', 'ip_end'),
            fk('rule_id', 'block_rules', 'SET NULL'),
        ]);

        await create('block_hits', [
            col.id,
            col.fk('block_id'),
            'request_id CHAR(26) NULL',
            col.ip('ip'),
            'path VARCHAR(255) NULL',
            'at DATETIME(3) NOT NULL',
            index('ix_block_hits_block', 'block_id', 'at'),
            fk('block_id', 'blocks', 'CASCADE'),
        ]);
    }

    async down() {
        await drop('block_hits', 'blocks', 'block_rules');
    }
}

module.exports = CreateBlockingTables;
