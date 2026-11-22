const { DB } = use('App/Support/Migration');
const TicketSigner = use('App/Security/TicketSigner');

// Manual gate entry code: only a keyed hash is stored (tickets.entry_code_hash); the code itself is
// recomputed from uuid + version when the ticket is shown. ticket_scans.method records qr vs typed code.
class AddTicketEntryCodes {
    async up() {
        await DB.statement('ALTER TABLE tickets ADD COLUMN entry_code_hash CHAR(64) NULL AFTER version');
        await DB.statement('CREATE INDEX ix_tickets_entry_code ON tickets (entry_code_hash)');
        await DB.statement("ALTER TABLE ticket_scans ADD COLUMN method ENUM('qr','code') NOT NULL DEFAULT 'qr' AFTER result");
        // Backfill existing tickets.
        let last = 0;
        for (;;) {
            const rows = await DB.table('tickets').select('id', 'uuid', 'version').where('id', '>', last).orderBy('id').limit(500).get();
            if (!rows.length) break;
            for (const t of rows) await DB.table('tickets').where('id', t.id).update({ entry_code_hash: TicketSigner.entryHash(t.uuid, t.version) });
            last = rows[rows.length - 1].id;
        }
    }

    async down() {
        await DB.statement('ALTER TABLE ticket_scans DROP COLUMN method');
        await DB.statement('DROP INDEX ix_tickets_entry_code ON tickets');
        await DB.statement('ALTER TABLE tickets DROP COLUMN entry_code_hash');
    }
}

module.exports = AddTicketEntryCodes;
