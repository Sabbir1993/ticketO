const Controller = use('App/Http/Controllers/Controller');
const MediaService = use('App/Services/MediaService');
const MerchantBrandService = use('App/Services/MerchantBrandService');

// Public: merchant brand images and the merchant page data. Only logo / banner media can be read here;
// KYC and every other upload stays private (MediaService.readPublic refuses them).
class MediaController extends Controller {
    // GET /api/media/:id
    async show(id, req, res) {
        const file = await MediaService.readPublic(id);
        const raw = res.res;
        raw.set({
            'Content-Type': file.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'same-site',
        });
        return raw.send(file.buffer);
    }

    // GET /api/merchants/:slug
    async merchantPage(slug, req, res) {
        res.header('Cache-Control', 'public, max-age=30');
        return res.json(await MerchantBrandService.publicPage(slug));
    }
}

module.exports = MediaController;
