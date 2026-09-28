// Ticket QR codes are derived, never stored:  T1.<ticketUuid>.<version>.<mac>
// mac = HMAC-SHA256(TICKET_SIGNING_KEY, "<uuid>.<version>") truncated to 16 bytes, base64url.
// Transferring a booking bumps `version`, so previously printed codes stop verifying.
const crypto = require('crypto');

function key() {
    const k = process.env.TICKET_SIGNING_KEY;
    if (!k) throw new Error('TICKET_SIGNING_KEY is not configured');
    return k;
}
const mac = (uuid, version) => crypto.createHmac('sha256', key()).update(`${uuid}.${version}`).digest().subarray(0, 16).toString('base64url');

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

    /** Short human code shown under the QR (not a credential). */
    shortCode(uuid) { return `TKT-${uuid.replace(/-/g, '').slice(0, 8).toUpperCase()}`; },
};

module.exports = TicketSigner;
