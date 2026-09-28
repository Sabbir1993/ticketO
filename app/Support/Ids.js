// Identifier helpers. UUIDs for anything exposed in URLs (non-guessable), ULIDs for request ids
// (time-sortable, 26 chars), short booking references for humans.
const crypto = require('crypto');

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32

function ulid(time = Date.now()) {
    let t = time; let ts = '';
    for (let i = 0; i < 10; i++) { ts = ALPHABET[t % 32] + ts; t = Math.floor(t / 32); }
    const rnd = crypto.randomBytes(16);
    let r = '';
    for (let i = 0; i < 16; i++) r += ALPHABET[rnd[i] % 32];
    return ts + r;
}

const uuid = () => crypto.randomUUID();

/** e.g. TK-7Q4M9XZ2 — random, unambiguous characters. */
function bookingRef(prefix = 'TK') {
    const rnd = crypto.randomBytes(8);
    let s = '';
    for (let i = 0; i < 8; i++) s += ALPHABET[rnd[i] % 32];
    return `${prefix}-${s}`;
}

const slugify = (s, max = 100) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, max) || 'item';

module.exports = { ulid, uuid, bookingRef, slugify };
