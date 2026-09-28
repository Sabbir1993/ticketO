// Tamper-evident audit trail. Every state change is recorded with actor, subject, redacted
// before/after, request id and IP. Rows are hash-chained: row_hash = sha256(prev_hash | row).
// Writes use an independent transaction so they persist even if the caller's work rolls back.
const crypto = require('crypto');
const Db = use('App/Support/Db');
const DB = use('laranode/Support/Facades/DB');
const AuditLog = use('App/Models/AuditLog');
const AuditChainHead = use('App/Models/AuditChainHead');
const Redactor = use('App/Security/Redactor');
const IpResolver = use('App/Security/IpResolver');

const iso = (d) => (d instanceof Date ? d.toISOString() : d);
// MySQL normalises JSON key order, so hash a key-sorted form of the parsed value.
const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v ?? null);
function stable(v) {
    if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
    if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
    return JSON.stringify(v ?? null);
}
function canonical(row) {
    return stable([
        iso(row.occurred_at), row.actor_user_id === null ? null : Number(row.actor_user_id), row.actor_type,
        row.merchant_id === null ? null : Number(row.merchant_id), row.action, row.subject_type, row.subject_id,
        parse(row.before_state), parse(row.after_state), parse(row.meta), row.request_id,
    ]);
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function actorOf(ctx) {
    const u = ctx?.user;
    if (ctx?.actorType) return { actor_user_id: u?.id || null, actor_type: ctx.actorType, actor_label: ctx.actorLabel || null };
    if (!u) return { actor_user_id: null, actor_type: ctx?.apiClient ? 'api_client' : 'system', actor_label: ctx?.apiClient?.name || null };
    return { actor_user_id: u.id, actor_type: u.type, actor_label: u.email || u.phone || u.name };
}

// Serialize writes inside this process; the chain-head row lock serializes across instances.
let queue = Promise.resolve();

const AuditService = {
    /**
     * @param {object} ctx request context (req.ctx) or { actorType:'system' }
     * @param {string} action e.g. EVENT_PUBLISHED
     * @param {{ type?: string, id?: any, label?: string }} subject
     * @param {{ before?: any, after?: any, meta?: any, merchantId?: number }} [data]
     */
    record(ctx, action, subject = {}, data = {}) {
        const job = queue.then(() => AuditService._write(ctx, action, subject, data)).catch((e) => {
            console.error('[audit] failed to record', action, Redactor.errorMessage(e.message));
        });
        queue = job;
        return job;
    },

    async _write(ctx, action, subject, data) {
        const row = {
            occurred_at: new Date(),
            ...actorOf(ctx),
            actor_roles: ctx?.roles ? JSON.stringify(ctx.roles) : null,
            merchant_id: data.merchantId ?? ctx?.merchantId ?? null,
            action,
            subject_type: subject.type || null,
            subject_id: subject.id !== undefined && subject.id !== null ? String(subject.id) : null,
            subject_label: subject.label ? String(subject.label).slice(0, 190) : null,
            before_state: Redactor.toJson(data.before, 32768),
            after_state: Redactor.toJson(data.after, 32768),
            meta: Redactor.toJson(data.meta, 8192),
            request_id: ctx?.requestId || null,
            ip: ctx?.ip ? IpResolver.toBinary(ctx.ip) : null,
            user_agent: ctx?.userAgent ? String(ctx.userAgent).slice(0, 512) : null,
        };
        await Db.independent(async () => {
            // No-op update first: takes the chain-head row lock, so writers on every instance chain in order.
            await AuditChainHead.where('id', 1).increment('last_id', 0);
            const head = await AuditChainHead.find(1);
            row.prev_hash = head?.last_hash || null;
            row.row_hash = sha(`${row.prev_hash || ''}|${canonical(row)}`);
            const id = await DB.table('audit_logs').insertGetId(row);
            await AuditChainHead.where('id', 1).update({ last_id: id, last_hash: row.row_hash });
        });
    },

    /** Verify the chain from the start (or `fromId`). Returns { ok, checked, brokenAt }. */
    async verify({ fromId = 0, limit = 50000 } = {}) {
        const rows = await Db.outside(() => DB.table('audit_logs').where('id', '>', fromId).orderBy('id').limit(Db.int(limit, 50000, 500000)).get());
        let prev = fromId ? (await Db.outside(() => AuditLog.select('row_hash').where('id', fromId).first()))?.row_hash || null : null;
        for (const r of rows) {
            const expected = sha(`${prev || ''}|${canonical(r)}`);
            if ((r.prev_hash || null) !== (prev || null) || r.row_hash !== expected) return { ok: false, checked: rows.indexOf(r), brokenAt: r.id };
            prev = r.row_hash;
        }
        return { ok: true, checked: rows.length, brokenAt: null };
    },

    flush() { return queue; },
};

module.exports = AuditService;
