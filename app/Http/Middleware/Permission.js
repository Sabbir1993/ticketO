// `permission:events.approve` or `permission:orders.view,orders.pii.view` (any of).
// Every CMS / merchant route declares its permission; denials become security events.
const SecurityEventService = use('App/Services/SecurityEventService');
const Deny = use('App/Support/Deny');

class Permission {
    async handle(context, next, ...needed) {
        const { req, res } = context;
        const ctx = req.ctx;
        if (ctx?.isSuperAdmin || needed.some((p) => ctx?.permissions?.has(p))) return next(context);
        ctx.errorCode = 'permission_denied';
        SecurityEventService.record(ctx, 'permission_denied', { details: { need: needed, roles: ctx?.roles } });
        return Deny.forbidden(req, res, { error: { message: 'Your role does not allow this action.', code: 'forbidden', permission: needed[0] } });
    }
}

module.exports = Permission;
