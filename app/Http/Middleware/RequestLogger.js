// Logs every request (after the response is sent) into request_logs with the resolved IP,
// proxy chain, user/session/merchant, sizes, timing and a redacted copy of query + body.
const IpResolver = use('App/Security/IpResolver');
const Redactor = use('App/Security/Redactor');
const RequestLogService = use('App/Services/RequestLogService');

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SKIP_BODY = [/^\/api\/uploads/, /^\/api\/cms\/media/]; // file payloads: log metadata only

class RequestLogger {
    async handle(context, next) {
        const { req, res } = context;
        res.on('finish', () => {
            const c = req.ctx || {};
            const ms = c.startedAt ? Number((process.hrtime.bigint() - c.startedAt) / 1000000n) : null;
            const path = c.path || req.path;
            const skipBody = SKIP_BODY.some((r) => r.test(path));
            RequestLogService.push({
                occurred_at: c.at || new Date(),
                request_id: c.requestId || 'UNKNOWN0000000000000000000',
                method: req.method,
                route: req.route?.path ? String(req.baseUrl || '') + req.route.path : null,
                path: String(path).slice(0, 512),
                query: Redactor.toJson(req.query, 2048),
                status: res.statusCode,
                duration_ms: ms,
                ip: IpResolver.toBinary(c.ip),
                remote_addr: IpResolver.toBinary(c.remoteAddr),
                remote_port: c.remotePort || null,
                x_forwarded_for: c.forwardedFor || null,
                cf_connecting_ip: IpResolver.toBinary(c.cfConnectingIp),
                x_real_ip: IpResolver.toBinary(c.realIp),
                via_proxy: c.viaProxy ? 1 : 0,
                host: req.headers.host ? String(req.headers.host).slice(0, 190) : null,
                user_agent: c.userAgent,
                referer: req.headers.referer ? Redactor.string(String(req.headers.referer).slice(0, 512)) : null,
                origin: req.headers.origin ? String(req.headers.origin).slice(0, 190) : null,
                accept_language: req.headers['accept-language'] ? String(req.headers['accept-language']).slice(0, 120) : null,
                device_hash: c.deviceHash,
                user_id: c.user?.id || null,
                user_type: c.user?.type || null,
                auth_session_id: c.session?.id || null,
                api_client_id: c.apiClient?.id || null,
                merchant_id: c.merchantId || null,
                req_bytes: Number(req.headers['content-length']) || null,
                res_bytes: Number(res.getHeader('content-length')) || null,
                headers: Redactor.toJson(Redactor.headers(req.headers), 4096),
                body: MUTATING.has(req.method) && !skipBody ? Redactor.toJson(req.body, config('ticketo.logging.bodyMaxBytes', 8192)) : null,
                error_code: c.errorCode || null,
                error_message: c.errorMessage ? Redactor.string(String(c.errorMessage)).slice(0, 255) : null,
                blocked: c.blocked ? 1 : 0,
            });
        });
        return next(context);
    }
}

module.exports = RequestLogger;
