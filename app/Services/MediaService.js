// Private file uploads (KYC documents). POST /api/uploads takes a base64 data URL (≤ 5 MB).
//   · type is checked three ways: declared MIME, data-URL MIME and the file's magic bytes
//   · files live under storage/app/private (never web-served), AES-256-GCM encrypted per file with the
//     media uuid as AAD; only a SHA-256 checksum of the plaintext is kept in the DB
//   · an upload is only usable for 24 h and only by its uploader (or, during sign-up, anonymously once)
//   · reading a file back is permission-gated and written to data_access_logs by the caller
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const Media = use('App/Models/Media');
const Envelope = use('App/Security/Envelope');
const { uuid } = use('App/Support/Ids');
const { bad, missing } = use('App/Support/HttpError');

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = {
    'application/pdf': { ext: 'pdf', magic: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
    'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    'image/png': { ext: 'png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    'image/webp': { ext: 'webp', magic: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
};
const CLAIM_WINDOW_MS = 24 * 3600000;
const root = () => base_path('storage/app/private');
const aad = (id) => `media:${id}`;
const cleanName = (n) => path.basename(String(n || 'document')).replace(/[^\w.\- ()]/g, '_').slice(0, 120) || 'document';

const MediaService = {
    async upload(ctx, { name, type, dataUrl } = {}, { purpose = 'kyc' } = {}) {
        const t = TYPES[type] || bad('Only PDF, JPG, PNG or WEBP files');
        const m = String(dataUrl || '').match(/^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
        if (!m || m[1] !== type) bad('The file could not be read — please choose it again');
        if (m[2].length > Math.ceil((MAX_BYTES * 4) / 3) + 8) bad('Max 5 MB per file');
        const buf = Buffer.from(m[2], 'base64');
        if (!buf.length || buf.length > MAX_BYTES) bad('Max 5 MB per file');
        if (!t.magic(buf)) bad('The file content does not match its type');

        const id = uuid();
        const rel = path.join(new Date().toISOString().slice(0, 7), `${id}.bin`);
        await fs.mkdir(path.join(root(), path.dirname(rel)), { recursive: true });
        const { ciphertext, keyVersion } = Envelope.encrypt(buf.toString('base64'), aad(id));
        await fs.writeFile(path.join(root(), rel), JSON.stringify({ v: 1, kv: keyVersion, c: ciphertext }), { mode: 0o600 });
        await Media.create({
            uuid: id, disk: 'private', path: rel.replace(/\\/g, '/'), visibility: 'private', original_name: cleanName(name), mime: type, bytes: buf.length,
            checksum: crypto.createHash('sha256').update(buf).digest('hex'), purpose, uploaded_by: ctx.user?.id || null, merchant_id: ctx.merchantId || null,
        });
        return { fileId: id, name: cleanName(name), type, size: buf.length };
    },

    /** Resolve uploads the current actor may attach (fresh, unattached, same uploader). */
    async claimable(ctx, fileIds, { purpose = 'kyc' } = {}) {
        const ids = [...new Set((fileIds || []).map(String).filter(Boolean))].slice(0, 20);
        if (!ids.length) return [];
        const rows = await Media.query().whereIn('uuid', ids).where('purpose', purpose).where('created_at', '>', new Date(Date.now() - CLAIM_WINDOW_MS)).get();
        const owner = ctx.user?.id || null;
        const ok = rows.filter((r) => (r.uploaded_by || null) === owner || (r.uploaded_by === null && !r.merchant_id));
        const attached = new Set((await use('laranode/Support/Facades/DB').table('merchant_kyc_documents').select('media_id').whereIn('media_id', ok.map((r) => r.id)).get()).map((r) => r.media_id));
        const usable = ok.filter((r) => !attached.has(r.id));
        if (usable.length !== ids.length) bad('A document upload has expired — please upload it again');
        return usable;
    },

    /** Decrypted file for an authorised viewer: { buffer, mime, name }. */
    async read(mediaId) {
        const m = await Media.where('id', mediaId).first() || missing('File not found');
        let blob;
        try { blob = JSON.parse(await fs.readFile(path.join(root(), m.path), 'utf8')); } catch { missing('File not found'); }
        const buffer = Buffer.from(Envelope.decrypt(blob.c, aad(m.uuid)), 'base64');
        if (crypto.createHash('sha256').update(buffer).digest('hex') !== m.checksum) throw new Error('Stored file failed its integrity check');
        return { buffer, mime: m.mime, name: m.original_name };
    },
};

module.exports = MediaService;
