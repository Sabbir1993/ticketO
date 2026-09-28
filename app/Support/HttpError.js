// Error with an HTTP status and a stable machine code. Messages are shown to end users,
// so keep them plain and never include internals.
class HttpError extends Error {
    constructor(status, message, code = 'error', details = undefined) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

const bad = (message, code = 'invalid', details) => { throw new HttpError(400, message, code, details); };
const unauthorized = (message = 'Please sign in to continue', code = 'auth') => { throw new HttpError(401, message, code); };
const forbid = (message = 'Your account cannot do this', code = 'forbidden') => { throw new HttpError(403, message, code); };
const missing = (message = 'Not found', code = 'not_found') => { throw new HttpError(404, message, code); };
const conflict = (message, code = 'conflict', details) => { throw new HttpError(409, message, code, details); };
const tooMany = (message = 'Too many attempts. Please wait and try again.', code = 'rate_limited') => { throw new HttpError(429, message, code); };

module.exports = { HttpError, bad, unauthorized, forbid, missing, conflict, tooMany };
