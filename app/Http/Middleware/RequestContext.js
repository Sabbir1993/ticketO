// Builds req.ctx for every request: request id, resolved client IP (proxy-aware, spoof-safe),
// device fingerprint, and the signed-in user with roles/permissions. Echoes X-Request-Id so
// support staff can find any request in the logs from a customer's screenshot.
const IpResolver = use('App/Security/IpResolver');
const Hasher = use('App/Security/Hasher');
const { ulid } = use('App/Support/Ids');
const SessionService = use('App/Services/SessionService');
const RbacService = use('App/Services/RbacService');

class RequestContext {
    async handle(context, next) {
        const { req, res } = context;
        const net = IpResolver.resolve(req);
        const incoming = String(req.headers['x-request-id'] || '');
        const requestId = /^[0-9A-HJKMNP-TV-Z]{26}$/.test(incoming) && net.viaProxy ? incoming : ulid();
        const userAgent = req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 512) : null;
        // Client may send a stable device id (random, stored in localStorage); we only keep its hash.
        const deviceRaw = req.headers['x-device-id'] ? String(req.headers['x-device-id']).slice(0, 128) : null;

        req.ctx = {
            requestId, startedAt: process.hrtime.bigint(), at: new Date(),
            ...net, userAgent, path: req.originalUrl?.split('?')[0] || req.path,
            deviceHash: deviceRaw ? Hasher.fingerprint(`device:${deviceRaw}`) : null,
            user: null, session: null, guard: null, roles: [], permissions: new Set(), merchantId: null, isSuperAdmin: false,
        };
        res.setHeader('X-Request-Id', requestId);

        try {
            const auth = await SessionService.resolve(req);
            if (auth && auth.user.status === 'active') {
                const { roles, permissions } = await RbacService.forUser(auth.user);
                Object.assign(req.ctx, {
                    user: auth.user, session: auth.session, guard: auth.session.guard, roles, permissions,
                    merchantId: auth.user.type === 'merchant_staff' ? auth.user.merchant_id : null,
                    isSuperAdmin: auth.user.type === 'cms' && roles.includes('super-admin'),
                });
            }
        } catch (e) {
            // A DB outage must not hide the request from logs; continue unauthenticated.
            req.ctx.authError = String(e.message).split('\n')[0];
        }

        if (req.method === 'GET') SessionService.ensureCsrfCookie(req, res);
        return next(context);
    }
}

module.exports = RequestContext;
