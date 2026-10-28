// Signed embed links for one merchant or one event. Token = base64url(JSON payload) + "." + HMAC-SHA256.
// The payload carries the parent sites the merchant chose for THIS link ("o"); only those sites may frame it.
// Stateless: rotate EMBED_SECRET to kill every link; a suspended merchant is filtered out by the catalogue.
const crypto = require('crypto');
const { bad } = use('App/Support/HttpError');

const MAX_ORIGINS = 10;
const sign = (body) => {
    const key = config('ticketo.embed').secret;
    if (!key || key.length < 32) throw new Error('EMBED_SECRET must be set (32+ characters)');
    return crypto.createHmac('sha256', key).update(`embed:${body}`).digest('base64url');
};

/** https://host[:port] only (http for localhost outside production). Returns the bare origin, or null. */
const originOf = (raw) => {
    let u;
    try { u = new URL(String(raw || '').trim()); } catch { return null; }
    const local = ['localhost', '127.0.0.1'].includes(u.hostname);
    const schemeOk = u.protocol === 'https:' || (local && u.protocol === 'http:' && env('APP_ENV') !== 'production');
    return schemeOk && u.pathname === '/' && !u.search && !u.hash && !u.username && !u.password ? u.origin : null;
};

const EmbedService = {
    /** Merchant input (array or comma-separated string) → unique origins. Anything malformed is rejected. */
    normalizeOrigins(input) {
        const items = (Array.isArray(input) ? input : String(input || '').split(',')).map((s) => String(s).trim()).filter(Boolean);
        if (!items.length) bad('Add at least one site, e.g. https://partner.example.com');
        if (items.length > MAX_ORIGINS) bad(`Up to ${MAX_ORIGINS} sites per link`);
        return [...new Set(items.map((item) => originOf(item) || bad(`Enter the site address only, starting with https://: ${item}`)))];
    },

    issue(scope, uuid, origins = []) {
        const body = Buffer.from(JSON.stringify({ s: scope, id: uuid, o: origins })).toString('base64url');
        return `${body}.${sign(body)}`;
    },

    /** @returns {{ scope: 'merchant'|'event', id: string, origins: string[] } | null} */
    verify(token) {
        const [body, sig] = String(token || '').split('.');
        if (!body || !sig || body.length > 2048) return null;
        let expected;
        try { expected = Buffer.from(sign(body)); } catch { return null; } // no secret configured: fail closed
        const given = Buffer.from(sig);
        if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
        let p;
        try { p = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
        if (!['merchant', 'event'].includes(p.s) || typeof p.id !== 'string') return null;
        const origins = Array.isArray(p.o) ? p.o.filter((o) => typeof o === 'string') : [];
        return { scope: p.s, id: p.id, origins };
    },

    /** Sites that may frame this link: the ones signed into it. Empty for a bad token, so the page is not framable. */
    frameOrigins(token) {
        const link = EmbedService.verify(token);
        return link ? link.origins.map(originOf).filter(Boolean) : [];
    },
};

module.exports = EmbedService;
