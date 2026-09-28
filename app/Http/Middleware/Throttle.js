// `throttle:<max>,<minutes>[,<key>]` — key is ip (default), user, or phone (from body).
// In-memory fixed window; use Redis for multi-instance deployments. Hits become
// `rate_limited` security events, which can trigger auto-blocks.
const SecurityEventService = use('App/Services/SecurityEventService');

const hits = new Map();
setInterval(() => { const now = Date.now(); for (const [k, r] of hits) if (now > r.resetAt) hits.delete(k); }, 60000).unref();

class Throttle {
    async handle(context, next, max = '60', minutes = '1', keyBy = 'ip') {
        const { req, res } = context;
        const ctx = req.ctx;
        const subject = keyBy === 'user' ? ctx.user?.id || ctx.ip : keyBy === 'phone' ? String(req.body?.phone || '').replace(/\D/g, '').slice(-11) || ctx.ip : ctx.ip;
        const key = `${req.method}:${req.route?.path || req.path}:${keyBy}:${subject}`;
        const now = Date.now();
        const limit = Number(max);
        const rec = hits.get(key) || { count: 0, resetAt: now + Number(minutes) * 60000 };
        if (now > rec.resetAt) { rec.count = 0; rec.resetAt = now + Number(minutes) * 60000; }
        rec.count++;
        hits.set(key, rec);
        res.setHeader('X-RateLimit-Limit', limit);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - rec.count));
        if (rec.count > limit) {
            ctx.errorCode = 'rate_limited';
            res.setHeader('Retry-After', Math.ceil((rec.resetAt - now) / 1000));
            if (rec.count === limit + 1) SecurityEventService.record(ctx, 'rate_limited', { phone: keyBy === 'phone' ? req.body?.phone : null, details: { route: req.route?.path || req.path, limit } });
            return res.status(429).json({ error: { message: 'Too many attempts. Please wait a moment and try again.', code: 'rate_limited' } });
        }
        return next(context);
    }
}

module.exports = Throttle;
