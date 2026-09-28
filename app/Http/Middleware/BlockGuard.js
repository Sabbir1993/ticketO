// Rejects requests from blocked IPs/CIDRs, devices, users, API clients and merchants.
// Route variant `block:login` / `block:checkout` also checks scope-specific blocks and the
// phone/email in the request body.
const BlockService = use('App/Services/BlockService');
const SecurityEventService = use('App/Services/SecurityEventService');
const SessionService = use('App/Services/SessionService');

async function deny(req, res, block, ctx) {
    ctx.blocked = true;
    ctx.errorCode = 'blocked';
    await BlockService.hit(block, ctx).catch(() => {});
    SecurityEventService.record(ctx, 'block_hit', { details: { block_id: block.id, subject_type: block.subject_type, scope: block.scope } });
    // A blocked account loses its sessions immediately.
    if (block.subject_type === 'user' && ctx.user) { await SessionService.revokeAll(ctx.user.id, 'blocked'); SessionService.clearCookies(res); }
    const message = 'Access from your account, device or network has been restricted. Contact support with the reference below.';
    if (req.path.startsWith('/api')) return res.status(403).json({ error: { message, code: 'blocked', reference: ctx.requestId } });
    return res.status(403).type('html').send(`<!doctype html><meta charset="utf-8"><title>Access restricted</title><body style="font-family:system-ui;padding:40px;max-width:560px;margin:auto"><h1>Access restricted</h1><p>${message}</p><p>Reference: <code>${ctx.requestId}</code></p></body>`);
}

class BlockGuard {
    async handle(context, next, scope = 'all') {
        const { req, res } = context;
        const ctx = req.ctx;
        let block = null;
        try {
            // ctx.merchantId covers suspended merchants' staff
            block = await BlockService.find(ctx, scope === 'all' ? {} : { scope, phone: req.body?.phone, email: req.body?.email });
        } catch (e) {
            ctx.errorMessage = `blockguard: ${String(e.message).split('\n')[0]}`; // fail open on DB outage; logged
        }
        if (block) return deny(req, res, block, ctx);
        return next(context);
    }
}

module.exports = BlockGuard;
