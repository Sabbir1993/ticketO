// Removes secrets and card data from anything we persist or log: request logs, audit
// before/after snapshots, payment callback payloads, error reports.
const SECRET_KEY = /(pass(word|wd)?|secret|token|authorization|cookie|otp|^pin$|cvv|cvc|card_?no|card_?number|^pan$|store_passwd|app_?secret|api[_-]?key|private[_-]?key|ciphertext|_hash$|signature|val_id_hmac)/i;
const REDACTED = '[REDACTED]';
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const DIGITS = /\b(?:\d[ -]?){13,19}\b/g;
const DROP_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'proxy-authorization', 'x-xsrf-token', 'x-csrf-token', 'x-api-key']);

function luhn(num) {
    let sum = 0; let alt = false;
    for (let i = num.length - 1; i >= 0; i--) {
        let n = num.charCodeAt(i) - 48;
        if (alt) { n *= 2; if (n > 9) n -= 9; }
        sum += n; alt = !alt;
    }
    return sum % 10 === 0;
}

function scrubString(s) {
    return String(s)
        .replace(BEARER, '$1 ' + REDACTED)
        .replace(JWT, REDACTED)
        .replace(DIGITS, (m) => { const d = m.replace(/\D/g, ''); return d.length >= 13 && d.length <= 19 && luhn(d) ? '[PAN]' : m; });
}

function redact(value, depth = 0) {
    if (value === null || value === undefined) return value;
    if (depth > 8) return '[DEPTH]';
    if (typeof value === 'string') return scrubString(value);
    if (typeof value !== 'object') return value;
    if (Buffer.isBuffer(value)) return `[${value.length} bytes]`;
    if (Array.isArray(value)) return value.slice(0, 200).map((v) => redact(v, depth + 1));
    const out = {};
    for (const [k, v] of Object.entries(value)) {
        out[k] = SECRET_KEY.test(k) ? (v === null || v === '' ? v : REDACTED) : redact(v, depth + 1);
    }
    return out;
}

const Redactor = {
    REDACTED,
    redact,
    string: scrubString,
    isSecretKey: (k) => SECRET_KEY.test(k),

    headers(headers = {}) {
        const out = {};
        for (const [k, v] of Object.entries(headers)) {
            if (DROP_HEADERS.has(k.toLowerCase())) continue;
            out[k] = SECRET_KEY.test(k) ? REDACTED : scrubString(Array.isArray(v) ? v.join(', ') : v);
        }
        return out;
    },

    /** Redact and cap to `maxBytes` of JSON. Returns a JSON string or null. */
    toJson(value, maxBytes = 8192) {
        if (value === undefined || value === null) return null;
        if (typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length) return null;
        let s = JSON.stringify(redact(value));
        if (Buffer.byteLength(s) > maxBytes) s = JSON.stringify({ truncated: true, preview: s.slice(0, maxBytes - 64) });
        return s;
    },

    /** Strip SQL + bindings that the MySQL connector appends to error messages. */
    errorMessage(message = '') {
        return scrubString(String(message).split(/\s*\n\s*Query:/)[0]);
    },
};

module.exports = Redactor;
