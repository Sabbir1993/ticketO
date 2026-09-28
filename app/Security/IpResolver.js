// Resolves the real client IP. Forwarding headers are honoured ONLY when the TCP peer is a
// trusted proxy (TRUSTED_PROXIES), so clients cannot spoof their IP via X-Forwarded-For.
const net = require('net');

function normalize(ip) {
    if (!ip) return null;
    let s = String(ip).trim();
    if (s.startsWith('[')) s = s.slice(1, s.indexOf(']'));
    if (s.startsWith('::ffff:') && net.isIPv4(s.slice(7))) s = s.slice(7);
    if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(s)) s = s.split(':')[0];
    return net.isIP(s) ? s : null;
}

/** IPv4/IPv6 → 16-byte Buffer (IPv4 mapped), for VARBINARY(16) columns and range compare. */
function toBinary(ip) {
    const s = normalize(ip);
    if (!s) return null;
    if (net.isIPv4(s)) return Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, ...s.split('.').map(Number)]);
    const [head, tail = ''] = s.split('::');
    const h = head ? head.split(':') : [];
    let t = tail ? tail.split(':') : [];
    // embedded IPv4 at the end (e.g. ::ffff:1.2.3.4 already handled; ::1.2.3.4)
    if (t.length && net.isIPv4(t[t.length - 1])) {
        const v4 = t.pop().split('.').map(Number);
        t.push(((v4[0] << 8) | v4[1]).toString(16), ((v4[2] << 8) | v4[3]).toString(16));
    }
    const groups = s.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
    const buf = Buffer.alloc(16);
    groups.forEach((g, i) => buf.writeUInt16BE(parseInt(g || '0', 16), i * 2));
    return buf;
}

function fromBinary(buf) {
    if (!buf || buf.length !== 16) return null;
    const isV4 = buf.subarray(0, 10).every((b) => b === 0) && buf[10] === 0xff && buf[11] === 0xff;
    if (isV4) return [...buf.subarray(12)].join('.');
    const groups = [];
    for (let i = 0; i < 16; i += 2) groups.push(buf.readUInt16BE(i).toString(16));
    return groups.join(':').replace(/(^|:)0(:0)+(:|$)/, '::');
}

/** "10.0.0.0/8" → { start, end } Buffers (16 bytes). Single IP → start = end. */
function cidrRange(cidr) {
    const [ip, bitsRaw] = String(cidr).split('/');
    const base = toBinary(ip);
    if (!base) return null;
    const isV4 = net.isIPv4(normalize(ip));
    let bits = bitsRaw === undefined ? 128 : Number(bitsRaw) + (isV4 ? 96 : 0);
    if (!(bits >= 0 && bits <= 128)) return null;
    const start = Buffer.from(base); const end = Buffer.from(base);
    for (let i = 0; i < 16; i++) {
        const keep = Math.max(0, Math.min(8, bits - i * 8));
        const mask = keep === 0 ? 0 : (0xff << (8 - keep)) & 0xff;
        start[i] &= mask; end[i] = (end[i] & mask) | (~mask & 0xff);
    }
    return { start, end };
}

function inRange(ip, { start, end }) {
    const b = toBinary(ip);
    return !!b && Buffer.compare(b, start) >= 0 && Buffer.compare(b, end) <= 0;
}

let trusted = null;
function trustedRanges() {
    if (!trusted) {
        const list = String(process.env.TRUSTED_PROXIES || '127.0.0.1,::1').split(',').map((s) => s.trim()).filter(Boolean);
        trusted = list.map(cidrRange).filter(Boolean);
    }
    return trusted;
}
const isTrusted = (ip) => trustedRanges().some((r) => inRange(ip, r));

/**
 * @param {import('express').Request} req raw express request
 * @returns {{ ip, remoteAddr, remotePort, forwardedFor, cfConnectingIp, realIp, viaProxy }}
 */
function resolve(req) {
    const remoteAddr = normalize(req.socket?.remoteAddress);
    const remotePort = req.socket?.remotePort || null;
    const forwardedFor = req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).slice(0, 512) : null;
    const cfConnectingIp = normalize(req.headers['cf-connecting-ip']);
    const realIp = normalize(req.headers['x-real-ip']);
    let ip = remoteAddr; let viaProxy = false;

    if (remoteAddr && isTrusted(remoteAddr)) {
        // Walk X-Forwarded-For right→left, skipping trusted hops; first untrusted hop is the client.
        const hops = (forwardedFor || '').split(',').map(normalize).filter(Boolean);
        let candidate = null;
        for (let i = hops.length - 1; i >= 0; i--) {
            if (!isTrusted(hops[i])) { candidate = hops[i]; break; }
            candidate = hops[i];
        }
        const chosen = cfConnectingIp || candidate || realIp;
        if (chosen) { ip = chosen; viaProxy = true; }
    }
    return { ip, remoteAddr, remotePort, forwardedFor, cfConnectingIp, realIp, viaProxy };
}

module.exports = { resolve, normalize, toBinary, fromBinary, cidrRange, inRange, isTrusted, _reset: () => { trusted = null; } };
