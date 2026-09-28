// Blocklist enforcement and management. Active blocks are cached for a few seconds so the
// per-request check stays cheap; any CMS change invalidates the cache immediately.
const Db = use('App/Support/Db');
const Block = use('App/Models/Block');
const BlockHit = use('App/Models/BlockHit');
const BlockRule = use('App/Models/BlockRule');
const IpResolver = use('App/Security/IpResolver');
const { bad } = use('App/Support/HttpError');

const TTL_MS = 10000;
let cache = { at: 0, rows: [] };
let rulesCache = { at: 0, rows: [] };

const normEmail = (e) => String(e || '').trim().toLowerCase();
const normPhone = (p) => { const m = String(p || '').replace(/[\s-]/g, '').match(/^(?:\+?88)?(01[3-9]\d{8})$/); return m ? `+88${m[1]}` : null; };

async function active() {
    if (Date.now() - cache.at < TTL_MS) return cache.rows;
    const now = new Date();
    const rows = await Db.outside(() => Block.select('id', 'subject_type', 'subject_value', 'ip_start', 'ip_end', 'scope', 'reason', 'expires_at')
        .whereNull('revoked_at').where('starts_at', '<=', now).whereRaw('(expires_at IS NULL OR expires_at > ?)', [now]).get());
    cache = { at: Date.now(), rows };
    return rows;
}

const scopeMatches = (blockScope, scope) => blockScope === 'all' || blockScope === scope;

const BlockService = {
    normPhone, normEmail,
    invalidate() { cache.at = 0; rulesCache.at = 0; },

    /**
     * Find an active block for any identifier in the request context.
     * @param {object} ctx req.ctx
     * @param {{ scope?: 'all'|'login'|'checkout'|'api', phone?, email?, userId?, merchantId? }} [extra]
     * @returns {Promise<object|null>} matching block
     */
    async find(ctx, extra = {}) {
        const scope = extra.scope || 'all';
        const rows = await active();
        if (!rows.length) return null;
        const ipBin = ctx?.ip ? IpResolver.toBinary(ctx.ip) : null;
        const ids = {
            user: String(extra.userId ?? ctx?.user?.id ?? ''),
            phone: normPhone(extra.phone ?? ctx?.user?.phone) || '',
            email: normEmail(extra.email ?? ctx?.user?.email),
            device: ctx?.deviceHash || '',
            api_client: String(ctx?.apiClient?.id ?? ''),
            merchant: String(extra.merchantId ?? ctx?.merchantId ?? ''),
        };
        for (const b of rows) {
            if (scope !== 'all' && !scopeMatches(b.scope, scope)) continue;
            if (scope === 'all' && b.scope !== 'all') continue;
            if (b.subject_type === 'ip' || b.subject_type === 'cidr') {
                if (ipBin && b.ip_start && Buffer.compare(ipBin, b.ip_start) >= 0 && Buffer.compare(ipBin, b.ip_end) <= 0) return b;
            } else if (ids[b.subject_type] && ids[b.subject_type] === b.subject_value) return b;
        }
        return null;
    },

    /** Record that a block was enforced. */
    async hit(block, ctx) {
        await Db.outside(async () => {
            await Block.where('id', block.id).increment('hits', 1, { last_hit_at: new Date() });
            await BlockHit.create({ block_id: block.id, request_id: ctx?.requestId || null, ip: ctx?.ip ? IpResolver.toBinary(ctx.ip) : null, path: ctx?.path ? String(ctx.path).slice(0, 255) : null, at: new Date() });
        });
    },

    /** Normalise + validate a subject for storage. */
    subject(type, value) {
        const v = String(value ?? '').trim();
        switch (type) {
            case 'ip': { const ip = IpResolver.normalize(v) || bad('Enter a valid IPv4 or IPv6 address'); const r = IpResolver.cidrRange(ip); return { value: ip, start: r.start, end: r.end }; }
            case 'cidr': { const r = IpResolver.cidrRange(v) || bad('Enter a valid CIDR range, e.g. 203.0.113.0/24'); return { value: v, start: r.start, end: r.end }; }
            case 'phone': return { value: normPhone(v) || bad('Enter a valid Bangladeshi mobile number') };
            case 'email': return { value: /\S+@\S+\.\S+/.test(v) ? normEmail(v) : bad('Enter a valid email address') };
            case 'user': case 'api_client': case 'merchant': return { value: /^\d+$/.test(v) ? v : bad('Enter a numeric id') };
            case 'device': return { value: /^[a-f0-9]{64}$/.test(v) ? v : bad('Device id must be a 64-character fingerprint') };
            default: return bad('Unknown block type');
        }
    },

    /** Create a block. `durationSec` null = permanent. Returns the new id. */
    async create({ type, value, scope = 'all', reason, durationSec = null, source = 'manual', ruleId = null, createdBy = null }) {
        if (!reason || String(reason).trim().length < 3) bad('Give a reason for the block');
        const s = BlockService.subject(type, value);
        const now = new Date();
        const block = await Db.outside(() => Block.create({
            subject_type: type, subject_value: s.value, ip_start: s.start || null, ip_end: s.end || null, scope, reason: String(reason).slice(0, 255),
            source, rule_id: ruleId, created_by: createdBy, starts_at: now, expires_at: durationSec ? new Date(now.getTime() + durationSec * 1000) : null,
        }));
        BlockService.invalidate();
        return block.id;
    },

    async revoke(id, { by = null, reason = null } = {}) {
        const n = await Block.where('id', id).whereNull('revoked_at').update({ revoked_at: new Date(), revoked_by: by, revoke_reason: reason, updated_at: new Date() });
        BlockService.invalidate();
        return n;
    },

    /** Apply block_rules after a security event (e.g. 5 otp_failed in 10 min → block IP 1 h). */
    async evaluateAutoRules(ctx, event, data = {}) {
        if (Date.now() - rulesCache.at > 60000) rulesCache = { at: Date.now(), rows: await Db.outside(() => BlockRule.where('is_active', 1).get()) };
        const SecurityEventService = use('App/Services/SecurityEventService');
        for (const rule of rulesCache.rows.filter((r) => r.event === event)) {
            const value = { ip: ctx?.ip, phone: normPhone(data.phone), email: data.email ? normEmail(data.email) : null, user: data.userId ?? ctx?.user?.id, device: ctx?.deviceHash }[rule.subject_type];
            if (!value) continue;
            const n = await SecurityEventService.count(event, rule.subject_type, value, rule.window_sec);
            if (n < rule.threshold) continue;
            const existing = await BlockService.find({ ip: rule.subject_type === 'ip' ? value : null, deviceHash: rule.subject_type === 'device' ? value : null },
                { scope: rule.scope, phone: rule.subject_type === 'phone' ? value : undefined, email: rule.subject_type === 'email' ? value : undefined, userId: rule.subject_type === 'user' ? value : undefined });
            if (existing) continue;
            await BlockService.create({ type: rule.subject_type, value: String(value), scope: rule.scope, reason: `Auto: ${rule.name} (${n}× ${event})`, durationSec: rule.duration_sec, source: 'auto', ruleId: rule.id });
            await use('App/Services/AuditService').record({ ...ctx, actorType: 'system', actorLabel: 'auto-block' }, 'BLOCK_AUTO_CREATED', { type: 'block_rule', id: rule.id, label: rule.name }, { meta: { subject_type: rule.subject_type, event, count: n } });
        }
    },
};

module.exports = BlockService;
