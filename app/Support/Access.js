// In-service permission checks, for actions whose permission depends on the payload
// (e.g. one endpoint that approves OR suspends). Route middleware still guards every route.
const SecurityEventService = use('App/Services/SecurityEventService');
const { forbid } = use('App/Support/HttpError');

const can = (ctx, perm) => !!ctx?.isSuperAdmin || !!ctx?.permissions?.has(perm);

function need(ctx, ...anyOf) {
    if (anyOf.some((p) => can(ctx, p))) return;
    SecurityEventService.record(ctx, 'permission_denied', { details: { need: anyOf, roles: ctx?.roles } });
    forbid('Your role does not allow this action', 'forbidden');
}

module.exports = { can, need };
