// Security-relevant events (failed logins/OTPs, denials, CSRF failures, rate limits, block hits,
// secret use). Also drives automatic blocking via block_rules.
const Db = use('App/Support/Db');
const SecurityEvent = use('App/Models/SecurityEvent');
const Redactor = use('App/Security/Redactor');
const IpResolver = use('App/Security/IpResolver');

const CRITICAL = new Set(['audit_chain_broken', 'secret_rotated', 'permission_escalation_attempt', 'gateway_misconfigured']);
const WARNING = new Set(['login_failed', 'otp_failed', 'mfa_failed', 'permission_denied', 'csrf_failed', 'rate_limited', 'block_hit', 'payment_validation_failed', 'invalid_ticket_scan', 'payment_high_risk']);

const SecurityEventService = {
    /**
     * @param {object} ctx req.ctx (may be partial)
     * @param {string} event
     * @param {{ phone?, email?, userId?, details? }} [data]
     */
    async record(ctx, event, data = {}) {
        try {
            // Outside any request transaction: the event is kept even when the request rolls back.
            await Db.outside(() => SecurityEvent.create({
                occurred_at: new Date(), event, severity: CRITICAL.has(event) ? 'critical' : WARNING.has(event) ? 'warning' : 'info',
                user_id: data.userId ?? ctx?.user?.id ?? null, phone: data.phone || null, email: data.email || null,
                ip: ctx?.ip ? IpResolver.toBinary(ctx.ip) : null, device_hash: ctx?.deviceHash || null, request_id: ctx?.requestId || null,
                path: ctx?.path ? String(ctx.path).slice(0, 255) : null, details: Redactor.toJson(data.details, 4096),
            }));
            // Lazy require avoids a load cycle (BlockService records block_hit events).
            await use('App/Services/BlockService').evaluateAutoRules(ctx, event, data);
        } catch (e) {
            console.error('[security_event] failed', event, Redactor.errorMessage(e.message));
        }
    },

    /** Count events for a subject inside a window (used by auto-block rules). */
    async count(event, subjectType, value, windowSec) {
        const col = { ip: 'ip', phone: 'phone', email: 'email', user: 'user_id', device: 'device_hash' }[subjectType];
        if (!col || value === null || value === undefined) return 0;
        const v = subjectType === 'ip' ? IpResolver.toBinary(value) : value;
        return Number(await Db.outside(() => SecurityEvent.where('event', event).where(col, v).where('occurred_at', '>=', new Date(Date.now() - windowSec * 1000)).count()));
    },
};

module.exports = SecurityEventService;
