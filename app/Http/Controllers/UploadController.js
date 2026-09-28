const Controller = use('App/Http/Controllers/Controller');
const MediaService = use('App/Services/MediaService');
const MerchantKycDocument = use('App/Models/MerchantKycDocument');
const DataAccessLog = use('App/Models/DataAccessLog');
const IpResolver = use('App/Security/IpResolver');
const Db = use('App/Support/Db');
const { missing } = use('App/Support/HttpError');

class UploadController extends Controller {
    // POST /api/uploads { name, type, dataUrl } — private KYC upload (merchant sign-up / portal).
    async store(req, res) {
        res.header('Cache-Control', 'no-store');
        return res.status(201).json(await MediaService.upload(req.ctx, req.only(['name', 'type', 'dataUrl'])));
    }

    // GET /api/admin/kyc/:docId — CMS kyc.documents.view; every opening is logged (who, which file, from where).
    async kycDocument(docId, req, res) {
        const doc = await MerchantKycDocument.select('id', 'merchant_id', 'media_id').where('id', Number(docId) || 0).first() || missing('Document not found');
        const file = await MediaService.read(doc.media_id);
        const ctx = req.ctx;
        await Db.outside(() => DataAccessLog.create({
            occurred_at: new Date(), user_id: ctx.user.id, merchant_id: doc.merchant_id, resource: 'kyc_document', resource_id: String(doc.id),
            purpose: 'CMS KYC review', request_id: ctx.requestId, ip: ctx.ip ? IpResolver.toBinary(ctx.ip) : null,
        }));
        const raw = res.res;
        raw.set({
            'Content-Type': file.mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
            'Content-Disposition': `inline; filename="${file.name.replace(/"/g, '')}"`, 'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
        });
        return raw.send(file.buffer);
    }
}

module.exports = UploadController;
