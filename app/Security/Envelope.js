// Envelope encryption for secrets that must be used again (gateway passwords, TOTP seeds,
// SMS/SMTP keys, settlement account numbers). Never store these in plain text.
//
// Each value gets its own random data key (DEK). The DEK encrypts the value (AES-256-GCM)
// and is itself wrapped by a key-encryption key (KEK) from env ENCRYPTION_KEKS.
// `aad` binds a ciphertext to where it lives (e.g. "merchant_gateway_credentials:12:secret"),
// so a ciphertext copied into another row fails to decrypt.
//
// Format: env1.<kekVersion>.<wrappedDek>.<dekIv>.<dekTag>.<iv>.<tag>.<ciphertext>  (base64url parts)
const crypto = require('crypto');

const b64 = (buf) => buf.toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url');

let keks = null;
function loadKeks() {
    if (keks) return keks;
    const raw = String(process.env.ENCRYPTION_KEKS || '');
    keks = new Map();
    for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
        const i = part.indexOf(':');
        if (i < 1) continue;
        const key = Buffer.from(part.slice(i + 1), 'base64');
        if (key.length !== 32) throw new Error(`ENCRYPTION_KEKS version ${part.slice(0, i)} must be 32 bytes`);
        keks.set(part.slice(0, i), key);
    }
    return keks;
}

function currentVersion() {
    const versions = [...loadKeks().keys()];
    if (!versions.length) throw new Error('ENCRYPTION_KEKS is not configured — cannot encrypt secrets');
    return versions[versions.length - 1];
}

function gcm(key, plaintext, aad) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', key, iv);
    c.setAAD(Buffer.from(aad));
    const ct = Buffer.concat([c.update(plaintext), c.final()]);
    return { iv, tag: c.getAuthTag(), ct };
}
function ungcm(key, iv, tag, ct, aad) {
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAAD(Buffer.from(aad));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]);
}

const Envelope = {
    /** @returns {{ ciphertext: string, keyVersion: string }} */
    encrypt(plaintext, aad) {
        if (plaintext === null || plaintext === undefined || plaintext === '') return { ciphertext: null, keyVersion: null };
        if (!aad) throw new Error('Envelope.encrypt requires an AAD context');
        const version = currentVersion();
        const dek = crypto.randomBytes(32);
        const wrapped = gcm(loadKeks().get(version), dek, `dek:${aad}`);
        const data = gcm(dek, Buffer.from(String(plaintext), 'utf8'), aad);
        dek.fill(0);
        const ciphertext = ['env1', version, b64(wrapped.ct), b64(wrapped.iv), b64(wrapped.tag), b64(data.iv), b64(data.tag), b64(data.ct)].join('.');
        return { ciphertext, keyVersion: version };
    },

    decrypt(ciphertext, aad) {
        if (!ciphertext) return null;
        const [tag0, version, wDek, wIv, wTag, iv, tag, ct] = String(ciphertext).split('.');
        if (tag0 !== 'env1') throw new Error('Unknown ciphertext format');
        const kek = loadKeks().get(version);
        if (!kek) throw new Error(`Encryption key version ${version} is not available`);
        const dek = ungcm(kek, unb64(wIv), unb64(wTag), unb64(wDek), `dek:${aad}`);
        try { return ungcm(dek, unb64(iv), unb64(tag), unb64(ct), aad).toString('utf8'); } finally { dek.fill(0); }
    },

    /** JSON helpers for multi-field secrets (e.g. bKash appSecret + password). */
    encryptJson(obj, aad) { return Envelope.encrypt(JSON.stringify(obj || {}), aad); },
    decryptJson(ciphertext, aad) { const s = Envelope.decrypt(ciphertext, aad); return s ? JSON.parse(s) : {}; },

    /** Re-encrypt under the current KEK version (used by ticketo:keys:rotate). */
    rotate(ciphertext, aad) { return Envelope.encrypt(Envelope.decrypt(ciphertext, aad), aad); },

    versionOf(ciphertext) { return ciphertext ? String(ciphertext).split('.')[1] : null; },
    currentVersion,
    isConfigured() { try { return loadKeks().size > 0; } catch { return false; } },
    _reset() { keks = null; }, // tests
};

module.exports = Envelope;
