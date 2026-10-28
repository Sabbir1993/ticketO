// Global: a session issued to the mobile app is re-checked on every request, so a role change
// (e.g. box-office → manager) cuts the app off immediately instead of at session expiry.
const SessionService = use('App/Services/SessionService');
const MobileAccessService = use('App/Services/MobileAccessService');

class MobileGuard {
    async handle(context, next) {
        const { ctx } = context.req;
        if (ctx?.session?.client === 'mobile' && !MobileAccessService.allowed(ctx.user, ctx)) {
            await SessionService.revoke(ctx.session.id, 'mobile_forbidden');
            Object.assign(ctx, { user: null, session: null, guard: null, roles: [], permissions: new Set(), merchantId: null, isSuperAdmin: false });
        }
        return next(context);
    }
}

module.exports = MobileGuard;
