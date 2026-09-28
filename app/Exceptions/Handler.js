const BaseHandler = use('laranode/Foundation/Exceptions/Handler');
const Redactor = use('App/Security/Redactor');

/**
 * Errors never leak internals: 5xx responses carry a generic message plus the request id,
 * and logged messages are stripped of SQL and bindings (which could contain hashes or
 * ciphertext) by Redactor.errorMessage.
 */
class Handler extends BaseHandler {
    register() {}

    report(error, req) {
        const status = error.status || this.getStatusCode(error);
        if (req?.ctx) {
            req.ctx.errorCode = req.ctx.errorCode || error.code || (status >= 500 ? 'server' : 'client');
            req.ctx.errorMessage = Redactor.errorMessage(error.message);
        }
        if (status < 500) return;
        try {
            const Log = use('laranode/Support/Facades/Log');
            Log.error(Redactor.errorMessage(error.message), {
                request_id: req?.ctx?.requestId,
                path: req?.ctx?.path,
                stack: Redactor.string(String(error.stack || '').split('\n').filter((l) => !/Query:|Bindings:/.test(l)).slice(0, 12).join('\n')),
            });
        } catch {
            console.error('[error]', req?.ctx?.requestId, Redactor.errorMessage(error.message));
        }
    }

    render(error, req, res) {
        if (res.headersSent) return;
        const requestId = req?.ctx?.requestId;
        const status = error.status || this.getStatusCode(error);
        const wantsJson = req.path.startsWith('/api') || String(req.headers.accept || '').includes('application/json');

        if (error.name === 'ValidationException') {
            return res.status(422).json({ error: { message: error.message || 'Please check the highlighted fields', code: 'validation', fields: error.errors }, requestId });
        }
        if (error.name === 'HttpError' || (status >= 400 && status < 500)) {
            const body = { error: { message: error.message || 'Request failed', code: error.code || 'error', ...(error.details ? { details: error.details } : {}) }, requestId };
            if (status === 404 && !wantsJson) return res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><title>Not found</title><p style="font-family:system-ui;padding:40px">Page not found.</p>');
            return res.status(status).json(body);
        }
        const message = 'Something went wrong on our side. Please try again.';
        if (wantsJson) return res.status(500).json({ error: { message, code: 'server' }, requestId });
        return res.status(500).type('html').send(`<!doctype html><meta charset="utf-8"><title>Error</title><body style="font-family:system-ui;padding:40px"><h1>Something went wrong</h1><p>${message}</p><p>Reference: <code>${requestId || ''}</code></p></body>`);
    }
}

module.exports = Handler;
