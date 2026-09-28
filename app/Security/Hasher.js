// One-way hashing for secrets we only need to verify: session tokens, CSRF tokens, reset
// tokens, API keys, OTP codes, guest booking links. Raw values never touch the DB.
const crypto = require('crypto');

function pepper() {
    const p = process.env.SESSION_PEPPER;
    if (!p) throw new Error('SESSION_PEPPER is not configured');
    return p;
}

const Hasher = {
    /** Random URL-safe secret (default 32 bytes ≈ 43 chars). */
    token(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); },

    /** Keyed hash (HMAC-SHA256 with the pepper) — hex, 64 chars. `purpose` separates domains. */
    hash(value, purpose = 'token') {
        return crypto.createHmac('sha256', pepper()).update(`${purpose}:${value}`).digest('hex');
    },

    /** Constant-time compare of a raw value with a stored hash. */
    verify(value, storedHash, purpose = 'token') {
        if (!value || !storedHash) return false;
        const a = Buffer.from(Hasher.hash(value, purpose), 'hex');
        const b = Buffer.from(String(storedHash), 'hex');
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    },

    /** Numeric OTP of `digits` length, from a CSPRNG. */
    otp(digits = 6) { return String(crypto.randomInt(0, 10 ** digits)).padStart(digits, '0'); },

    /** Non-secret fingerprint (e.g. device, log correlation) — plain SHA-256. */
    fingerprint(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex'); },

    /** Last N visible characters for masked display. */
    last(value, n = 4) { const s = String(value || ''); return s ? s.slice(-n) : null; },
};

module.exports = Hasher;
