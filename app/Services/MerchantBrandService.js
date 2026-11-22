// Merchant brand: public page content (tagline, about), two theme colours, logo and banner.
//   · the only public media in the system are these two images (MediaService purposes merchant_logo / merchant_banner);
//     they are validated by magic bytes, size-capped (2 MB), encrypted at rest and served with nosniff + a sandbox CSP
//   · colours must be readable under white text (WCAG contrast ≥ 3:1), otherwise buttons become unreadable
//   · text is stored as plain text; the SPA renders it escaped (no HTML is ever interpreted)
//   · only active merchants have a public page
const Merchant = use('App/Models/Merchant');
const Media = use('App/Models/Media');
const MediaService = use('App/Services/MediaService');
const AuditService = use('App/Services/AuditService');
const { bad, missing } = use('App/Support/HttpError');

const KINDS = { logo: { col: 'logo_media_id', purpose: 'merchant_logo' }, banner: { col: 'banner_media_id', purpose: 'merchant_banner' } };
const MAX_IMAGE = 2 * 1024 * 1024;
const HEX = /^#[0-9a-f]{6}$/i;

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max);

function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast ratio of a colour against white. */
const contrastOnWhite = (hex) => 1.05 / (luminance(hex) + 0.05);

function colour(v, label) {
    if (v === undefined || v === null || v === '') return null;
    const s = String(v).trim();
    if (!HEX.test(s)) bad(`${label} must be a hex colour like #2D499A`);
    // Any colour is accepted: the SPA darkens light colours where white text sits on them (lib/theme.js readableOnWhite).
    return s.toUpperCase();
}

const url = (uuid) => (uuid ? `/api/media/${uuid}` : null);

async function imageUuid(id) {
    if (!id) return null;
    return (await Media.select('uuid').where('id', id).first())?.uuid || null;
}

async function viewOf(m) {
    const [logo, banner] = await Promise.all([imageUuid(m.logo_media_id), imageUuid(m.banner_media_id)]);
    return {
        slug: m.slug, tagline: m.tagline || '', about: m.about || '', primary: m.brand_primary || null, accent: m.brand_accent || null,
        logoUrl: url(logo), bannerUrl: url(banner), pageUrl: `/m/${m.slug}`, live: m.status === 'active',
    };
}

const MerchantBrandService = {
    contrastOnWhite,

    async get(ctx) {
        const m = await Merchant.where('id', ctx.merchantId).first() || missing('Merchant not found');
        return viewOf(m);
    },

    async save(ctx, { tagline, about, primary, accent } = {}) {
        const m = await Merchant.where('id', ctx.merchantId).first() || missing('Merchant not found');
        const patch = { tagline: clean(tagline, 160) || null, about: clean(about, 1200) || null, brand_primary: colour(primary, 'Primary colour'), brand_accent: colour(accent, 'Accent colour'), updated_at: new Date() };
        await Merchant.where('id', m.id).update(patch);
        await AuditService.record(ctx, 'MERCHANT_BRAND_UPDATED', { type: 'merchant', id: m.id, label: m.name }, { meta: { primary: patch.brand_primary, accent: patch.brand_accent, hasTagline: !!patch.tagline, hasAbout: !!patch.about }, merchantId: m.id });
        return MerchantBrandService.get(ctx);
    },

    /** kind = logo | banner. Replaces the previous image (which stops being served). */
    async setImage(ctx, kind, { name, type, dataUrl } = {}) {
        const k = KINDS[kind] || bad('Choose logo or banner');
        const m = await Merchant.where('id', ctx.merchantId).first() || missing('Merchant not found');
        const up = await MediaService.upload(ctx, { name, type, dataUrl }, { purpose: k.purpose, visibility: 'public', images: true, maxBytes: MAX_IMAGE });
        const media = await Media.select('id').where('uuid', up.fileId).first();
        await Merchant.where('id', m.id).update({ [k.col]: media.id, updated_at: new Date() });
        await MediaService.discard(m[k.col]);
        await AuditService.record(ctx, 'MERCHANT_BRAND_IMAGE_SET', { type: 'merchant', id: m.id, label: m.name }, { meta: { kind }, merchantId: m.id });
        return MerchantBrandService.get(ctx);
    },

    async clearImage(ctx, kind, { byAdmin = false } = {}) {
        const k = KINDS[kind] || bad('Choose logo or banner');
        const m = await Merchant.where('id', ctx.merchantId).first() || missing('Merchant not found');
        if (m[k.col]) {
            await Merchant.where('id', m.id).update({ [k.col]: null, updated_at: new Date() });
            await MediaService.discard(m[k.col]);
            await AuditService.record(ctx, byAdmin ? 'MERCHANT_BRAND_IMAGE_REMOVED_BY_ADMIN' : 'MERCHANT_BRAND_IMAGE_CLEARED', { type: 'merchant', id: m.id, label: m.name }, { meta: { kind }, merchantId: m.id });
        }
        return MerchantBrandService.get(ctx);
    },

    /** GET /api/merchants/:slug — public. Nothing private (no contact, KYC, gateway or settlement data). */
    async publicPage(slug) {
        const m = await Merchant.where('slug', String(slug || '').toLowerCase().slice(0, 120)).where('status', 'active').first() || missing('Organiser not found');
        const v = await viewOf(m);
        return { id: m.uuid, name: m.name, slug: m.slug, tagline: v.tagline, about: v.about, theme: { primary: v.primary, accent: v.accent }, logoUrl: v.logoUrl, bannerUrl: v.bannerUrl };
    },
};

module.exports = MerchantBrandService;
