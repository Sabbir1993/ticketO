// `auth:customer`, `auth:merchant`, `auth:cms`, `auth:merchant,cms` — requires a signed-in user
// on one of the given guards. CMS users with MFA enabled must have passed MFA this session.
const SecurityEventService = use('App/Services/SecurityEventService');
const StaffAuthService = use('App/Services/StaffAuthService');

class Authenticate {
    async handle(context, next, ...guards) {
        const { req, res } = context;
        const ctx = req.ctx;
        if (!ctx?.user) {
            ctx.errorCode = 'auth';
            return res.status(401).json({ error: { message: 'Please sign in to continue', code: 'auth' } });
        }
        if (guards.length && !guards.includes(ctx.guard)) {
            ctx.errorCode = 'wrong_guard';
            SecurityEventService.record(ctx, 'permission_denied', { details: { need: guards, have: ctx.guard } });
            return res.status(403).json({ error: { message: 'This area needs a different account type', code: 'forbidden' } });
        }
        // MFA is enforced for CMS users even before they enrol (platform.cms_mfa_required) and for anyone who enabled it.
        if (!ctx.session.mfaPassed && await StaffAuthService.needsMfa(ctx.user)) {
            ctx.errorCode = 'mfa_required';
            return res.status(401).json({ error: { message: 'Enter your authenticator code to continue', code: 'mfa_required' } });
        }
        return next(context);
    }
}

module.exports = Authenticate;
