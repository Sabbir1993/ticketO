const Seeder = use('laranode/Database/Seeder');
const DB = use('laranode/Support/Facades/DB');
const NavItem = use('App/Models/NavItem');
const CmsPage = use('App/Models/CmsPage');
const CmsPageVersion = use('App/Models/CmsPageVersion');
const Faq = use('App/Models/Faq');
const Banner = use('App/Models/Banner');
const HomeSection = use('App/Models/HomeSection');
const BlockRule = use('App/Models/BlockRule');
const R = require('./data/reference');

// Idempotent reference data (safe in production). Existing CMS edits are preserved:
// rows are inserted only when missing (unique keys + insertOrIgnore), never overwritten.
class ReferenceSeeder extends Seeder {
    async run() {
        const now = new Date();
        const ts = { created_at: now, updated_at: now };
        const ins = (table, row) => DB.table(table).insertOrIgnore(row);

        for (const [g, k, v, type, label, pub, help] of R.settings) {
            await ins('settings', { setting_group: g, setting_key: k, value: JSON.stringify(v), value_type: type, label, help: help || null, is_public: pub ? 1 : 0, ...ts });
        }
        for (const [slug, name, kind, icon, description, customer_label] of R.viewTypes) {
            await ins('view_types', { slug, name, kind, icon, description, customer_label, sort_order: R.viewTypes.findIndex((v) => v[0] === slug), ...ts });
        }
        for (const [group, items] of Object.entries(R.lookups)) {
            for (const [i, [code, label, meta]] of items.entries()) await ins('lookups', { lookup_group: group, code, label, meta: meta === undefined ? null : JSON.stringify(meta), sort_order: i, ...ts });
        }
        for (const [i, [name, short, kind]] of R.banks.entries()) await ins('banks', { name, short_name: short, kind: kind || 'bank', sort_order: i, ...ts });
        for (const [i, [code, name, required]] of R.kycDocs.entries()) {
            await ins('kyc_document_types', { code, name, is_required: required ? 1 : 0, accepted_mime: JSON.stringify(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']), max_bytes: 5 * 1024 * 1024, sort_order: i, ...ts });
        }
        for (const [i, [slug, name, popular, def, online]] of R.cities.entries()) {
            await ins('cities', { slug, name, icon: online ? 'Globe' : 'MapPin', is_popular: popular ? 1 : 0, is_default: def ? 1 : 0, is_online: online ? 1 : 0, sort_order: i, ...ts });
        }
        for (const [i, [code, name, subtitle, icon, color, gateway, mcn]] of R.paymentMethods.entries()) {
            await ins('payment_methods', { code, name, subtitle, icon, color, gateway, multi_card_name: mcn || null, channel: 'online', sort_order: i, is_enabled: 1, ...ts });
        }
        // Gateway flags only — secrets are entered in CMS → Payment gateways (stored encrypted).
        await ins('gateway_settings', { gateway: 'sslcommerz', is_enabled: 1, sandbox: 1, ...ts });
        await ins('gateway_settings', { gateway: 'bkash', is_enabled: 0, sandbox: 1, ...ts });
        await ins('integration_credentials', { provider: 'sms', name: 'SMS gateway', is_enabled: 0, ...ts });
        await ins('integration_credentials', { provider: 'smtp', name: 'Email (SMTP)', is_enabled: 0, ...ts });

        if (!(await NavItem.query().exists())) {
            for (const [i, [location, label, icon, href, audience, permission]] of R.nav.entries()) {
                await NavItem.create({ location, label, icon, href, audience, permission: permission || null, sort_order: i });
            }
        }
        for (const [slug, title, kind, body] of R.pages) {
            if (await CmsPage.withTrashed().where('slug', slug).exists()) continue;
            const page = await CmsPage.create({ slug, title, kind });
            const version = await CmsPageVersion.create({ page_id: page.id, version: 1, title, body, effective_at: now, published_at: now, created_at: now });
            await CmsPage.where('id', page.id).update({ current_version_id: version.id });
        }
        if (!(await Faq.withTrashed().exists())) {
            for (const [i, [question, answer]] of R.faqs.entries()) await Faq.create({ question, answer, sort_order: i });
        }
        for (const [block_key, title, body, cta_label, cta_href, icon, data] of R.contentBlocks) {
            await ins('content_blocks', { block_key, title, body, cta_label, cta_href, icon, data: data ? JSON.stringify(data) : null, ...ts });
        }
        if (!(await Banner.withTrashed().exists())) {
            for (const [i, [title, subtitle, badge, cta_label, href, palette]] of R.banners.entries()) await Banner.create({ title, subtitle, badge, cta_label, href, palette, sort_order: i });
        }
        if (!(await HomeSection.query().exists())) {
            for (const [i, [type, title, cfg]] of R.homeSections.entries()) await HomeSection.create({ type, title, config: cfg, sort_order: i });
        }
        for (const [i, [code, name, min_points, multiplier, color, perks]] of R.loyaltyTiers.entries()) {
            await ins('loyalty_tiers', { code, name, min_points, multiplier, color, perks: JSON.stringify(perks), sort_order: i, ...ts });
        }
        for (const [event, points, per_amount, daily_cap] of R.loyaltyRules) await ins('loyalty_rules', { event, points, per_amount, daily_cap, ...ts });
        if (!(await BlockRule.query().exists())) {
            for (const [name, event, subject_type, threshold, window_sec, duration_sec, scope] of R.blockRules) {
                await BlockRule.create({ name, event, subject_type, threshold, window_sec, duration_sec, scope });
            }
        }
        for (const [string_key, value] of R.uiStrings) await ins('ui_strings', { string_key, locale: 'en', value, ...ts });
    }
}

module.exports = ReferenceSeeder;
