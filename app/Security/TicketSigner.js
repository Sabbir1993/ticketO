// Ticket QR codes are derived, never stored:  T1.<ticketUuid>.<version>.<mac>
// mac = HMAC-SHA256(TICKET_SIGNING_KEY, "<uuid>.<version>") truncated to 16 bytes, base64url.
// Transferring a booking bumps `version`, so previously printed codes stop verifying.
const crypto = require('crypto');
const Hasher = use('App/Security/Hasher');

function key() {
    const k = process.env.TICKET_SIGNING_KEY;
    if (!k) throw new Error('TICKET_SIGNING_KEY is not configured');
    return k;
}
const mac = (uuid, version) => crypto.createHmac('sha256', key()).update(`${uuid}.${version}`).digest().subarray(0, 16).toString('base64url');

// Manual entry code (gate fallback when a QR will not scan): 10 chars of Crockford base32, derived
// like the QR by HMAC so nothing readable is stored — only Hasher.hash(code) goes in tickets.entry_code_hash.
// It changes with the ticket version, so a transfer kills the old code together with the old QR.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function entryCodeRaw(uuid, version) {
    const d = crypto.createHmac('sha256', key()).update(`entry:${uuid}.${version}`).digest();
    let bits = 0n; for (let i = 0; i < 7; i++) bits = (bits << 8n) | BigInt(d[i]); // 56 bits → use the top 50
    bits >>= 6n;
    let out = ''; for (let i = 0; i < 10; i++) { out = ALPHABET[Number(bits & 31n)] + out; bits >>= 5n; }
    return out;
}

const TicketSigner = {
    sign(uuid, version = 1) { return `T1.${uuid}.${version}.${mac(uuid, version)}`; },

    /** @returns {{ uuid, version } | null} */
    verify(code) {
        const parts = String(code || '').trim().split('.');
        if (parts.length !== 4 || parts[0] !== 'T1') return null;
        const [, uuid, v, given] = parts;
        const version = Number(v);
        if (!/^[0-9a-f-]{36}$/i.test(uuid) || !Number.isInteger(version)) return null;
        const expected = Buffer.from(mac(uuid, version));
        const actual = Buffer.from(given);
        if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
        return { uuid, version };
    },

    /** 10-char manual entry code, formatted XXXX-XXXX-XX for display. */
    entryCode(uuid, version = 1) { const c = entryCodeRaw(uuid, version); return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`; },

    /** What the database stores for lookups (keyed hash of the normalised code). */
    entryHash(uuid, version = 1) { return Hasher.hash(entryCodeRaw(uuid, version), 'entry_code'); },

    /** Typed text → normalised code ('k7m2 9qxa-4t' → 'K7M29QXA4T'); null unless it is 10 valid characters. */
    normalizeEntry(text) {
        const s = String(text || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
        return /^[0-9A-HJKMNP-TV-Z]{10}$/.test(s) ? s : null;
    },
    hashTyped(normalised) { return Hasher.hash(normalised, 'entry_code'); },

    /** Short human code shown under the QR (not a credential). */
    shortCode(uuid) { return `TKT-${uuid.replace(/-/g, '').slice(0, 8).toUpperCase()}`; },
};

module.exports = TicketSigner;
