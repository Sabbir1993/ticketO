// RFC 6238 TOTP (SHA-1, 6 digits, 30 s) — compatible with Google Authenticator, Microsoft Authenticator, Authy.
// Seeds are stored only as Envelope ciphertext (mfa_factors.secret_ciphertext); this module never persists anything.
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SEC = 30;
const DIGITS = 6;

function base32Encode(buf) {
    let bits = 0; let value = 0; let out = '';
    for (const byte of buf) {
        value = (value << 8) | byte; bits += 8;
        while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
    return out;
}

function base32Decode(str) {
    const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
    let bits = 0; let value = 0; const out = [];
    for (const ch of clean) {
        const i = ALPHABET.indexOf(ch);
        if (i < 0) throw new Error('Invalid base32');
        value = (value << 5) | i; bits += 5;
        if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
    }
    return Buffer.from(out);
}

function codeAt(secretB32, step) {
    const msg = Buffer.alloc(8);
    msg.writeBigUInt64BE(BigInt(step));
    const h = crypto.createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
    const off = h[h.length - 1] & 0xf;
    const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
    return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

const Totp = {
    /** New random 160-bit seed, base32. */
    generateSecret() { return base32Encode(crypto.randomBytes(20)); },

    /** otpauth:// URI for the authenticator app QR code. */
    uri(secret, account, issuer) {
        const label = encodeURIComponent(`${issuer}:${account}`);
        return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SEC}`;
    },

    /**
     * Verify a code within ±1 step of clock drift. Returns the matched step, or null.
     * Callers must reject steps <= the last used step (replay protection).
     */
    verify(code, secret, { lastStep = null, window = 1, now = Date.now() } = {}) {
        const c = String(code || '').replace(/\s/g, '');
        if (!/^\d{6}$/.test(c)) return null;
        const current = Math.floor(now / 1000 / STEP_SEC);
        for (let s = current - window; s <= current + window; s++) {
            if (lastStep !== null && s <= Number(lastStep)) continue;
            const expected = codeAt(secret, s);
            if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return s;
        }
        return null;
    },

    _codeAt: codeAt, // tests only
};

module.exports = Totp;
