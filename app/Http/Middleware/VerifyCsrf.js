// Double-submit CSRF for every mutating request: header X-XSRF-TOKEN must equal the XSRF-TOKEN
// cookie, and for signed-in users it must also match the hash bound to the session.
// Gateway callbacks (form posts from SSLCOMMERZ/bKash) are mounted without this middleware.
const SessionService = use('App/Services/SessionService');
const SecurityEventService = use('App/Services/SecurityEventService');

class VerifyCsrf {
    async handle(context, next) {
        const { req, res } = context;
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next(context);
        if (req.ctx?.apiClient) return next(context); // API-key clients are not browser sessions
        if (SessionService.verifyCsrf(req, req.ctx?.session)) return next(context);
        req.ctx.errorCode = 'csrf';
        SecurityEventService.record(req.ctx, 'csrf_failed', {});
        return res.status(419).json({ error: { message: 'Your session expired. Refresh the page and try again.', code: 'csrf' } });
    }
}

module.exports = VerifyCsrf;
