// Public SPA bootstrap (GET /api/config): everything the UI renders that is CMS-managed —
// platform rules, branding, categories, view types, cities, banners, home sections, payment
// methods, promos, lookups, nav, UI strings. Only is_public settings are exposed. Cached briefly;
// CMS writes call invalidate().
const Db = use('App/Support/Db');
const DB = use('laranode/Support/Facades/DB');
const ViewType = use('App/Models/ViewType');
const City = use('App/Models/City');
const HomeSection = use('App/Models/HomeSection');
const PaymentMethod = use('App/Models/PaymentMethod');
const Lookup = use('App/Models/Lookup');
const NavItem = use('App/Models/NavItem');
const UiString = use('App/Models/UiString');
const SettingsService = use('App/Services/SettingsService');

const TTL_MS = 30000;
let cache = { at: 0, value: null };

const ALIAS = { allowMerchantDirectPg: 'allowMerchantDirectPG' }; // names the UI already reads
const camel = (s) => { const k = s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); return ALIAS[k] || k; };
const camelKeys = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [camel(k), v]));
const num = (v) => (v === null || v === undefined ? null : Number(v));

async function build() {
    const now = new Date();
    const [pub, viewTypes, cats, cities, banners, home, methods, promos, lookups, nav, strings] = await Promise.all([
        SettingsService.publicGroups(),
        ViewType.select('id', 'slug', 'name', 'kind', 'icon', 'description', 'customer_label').where('is_active', 1).orderBy('sort_order').orderBy('id').get(),
        // Joins go through DB.table with aliases so the soft-delete filter is table-qualified.
        DB.table('categories as c').join('view_types as v', 'v.id', '=', 'c.view_type_id').leftJoin('layout_templates as t', 't.id', '=', 'c.default_template_id')
            .select('c.id', 'c.parent_id', 'c.slug', 'c.name', 'c.icon', 'c.color', 'c.people_label', 'v.slug as view_type', 't.slug as template_slug')
            .where('c.is_active', 1).whereNull('c.deleted_at').orderBy('c.sort_order').orderBy('c.id').get(),
        City.select('slug', 'name', 'icon', 'is_popular', 'is_default', 'is_online').where('is_active', 1).orderBy('sort_order').orderBy('id').get(),
        DB.table('banners as b').leftJoin('cities as c', 'c.id', '=', 'b.city_id')
            .select('b.id', 'b.title', 'b.subtitle', 'b.badge', 'b.cta_label', 'b.href', 'b.palette', 'c.slug as city')
            .where('b.is_active', 1).whereNull('b.deleted_at')
            .whereRaw('(b.starts_at IS NULL OR b.starts_at <= ?)', [now]).whereRaw('(b.ends_at IS NULL OR b.ends_at > ?)', [now])
            .orderBy('b.sort_order').orderBy('b.id').get(),
        HomeSection.select('id', 'type', 'title', 'config').where('is_hidden', 0).orderBy('sort_order').orderBy('id').get(),
        PaymentMethod.select('code', 'name', 'subtitle', 'icon', 'color').where('is_enabled', 1).where('channel', 'online').orderBy('sort_order').orderBy('id').get(),
        DB.table('promos as p').leftJoin('categories as c', 'c.id', '=', 'p.category_id')
            .select('p.code', 'p.type', 'p.value', 'p.max_discount', 'p.min_order', 'p.description', 'c.slug as scope')
            .where('p.is_active', 1).whereNull('p.event_id').whereNull('p.merchant_id').whereNull('p.deleted_at')
            .whereRaw('(p.starts_at IS NULL OR p.starts_at <= ?)', [now]).whereRaw('(p.ends_at IS NULL OR p.ends_at > ?)', [now])
            .whereRaw('(p.usage_limit IS NULL OR p.used_count < p.usage_limit)')
            .orderBy('p.id').get(),
        Lookup.select('lookup_group', 'code', 'label', 'meta').where('is_active', 1).orderBy('lookup_group').orderBy('sort_order').orderBy('id').get(),
        NavItem.select('id', 'parent_id', 'location', 'label', 'icon', 'href', 'audience', 'permission', 'open_new_tab').where('is_active', 1)
            .orderBy('location').orderBy('sort_order').orderBy('id').get(),
        UiString.select('string_key', 'value').where('locale', 'en').get(),
    ]);

    const catView = (c) => ({ id: c.slug, name: c.name, icon: c.icon, color: c.color, viewType: c.view_type, templateId: c.template_slug, peopleLabel: c.people_label });
    const categories = cats.filter((c) => !c.parent_id).map((c) => ({
        ...catView(c), subCategories: cats.filter((s) => s.parent_id === c.id).map(catView),
    }));

    const lookupMap = {};
    for (const l of lookups) (lookupMap[l.lookup_group] ||= []).push({ code: l.code, label: l.label, meta: Db.json(l.meta) });

    const navMap = {};
    for (const n of nav) (navMap[n.location] ||= []).push({ id: n.id, parentId: n.parent_id, label: n.label, icon: n.icon, href: n.href, audience: n.audience, permission: n.permission, newTab: !!n.open_new_tab });

    const cfg = config('ticketo');
    return {
        platform: camelKeys(pub.platform),
        branding: camelKeys(pub.branding),
        ui: camelKeys(pub.ui),
        pos: camelKeys(pub.pos),
        categories,
        viewTypes: viewTypes.map((v) => ({ id: v.slug, name: v.name, kind: v.kind, icon: v.icon, description: v.description, customerLabel: v.customer_label })),
        cities: cities.map((c) => ({ id: c.slug, name: c.name, icon: c.icon, popular: !!c.is_popular, isDefault: !!c.is_default, online: !!c.is_online })),
        banners: banners.map((b) => ({ id: b.id, title: b.title, sub: b.subtitle, badge: b.badge, cta: b.cta_label, href: b.href, palette: Db.json(b.palette) || [], city: b.city })),
        home: home.map((h) => ({ id: `h${h.id}`, type: h.type, title: h.title, ...(Db.json(h.config) || {}) })),
        paymentMethods: methods.map((m) => ({ id: m.code, name: m.name, sub: m.subtitle, icon: m.icon, color: m.color })),
        promos: promos.map((p) => ({ code: p.code, type: p.type, value: num(p.value), max: num(p.max_discount), minOrder: num(p.min_order), desc: p.description, scope: p.scope || 'all' })),
        lookups: lookupMap,
        nav: navMap,
        strings: Object.fromEntries(strings.map((s) => [s.string_key, s.value])),
        simulator: !!cfg?.paymentSimulator && env('APP_ENV') !== 'production',
        payments: { sslcommerzMode: use('App/Gateways/SslcommerzGateway').mode() }, // sandbox | live (from env URLs; not secret)
    };
}

const BootstrapService = {
    async get() {
        if (cache.value && Date.now() - cache.at < TTL_MS) return cache.value;
        cache = { at: Date.now(), value: await build() };
        return cache.value;
    },
    invalidate() { cache.at = 0; SettingsService.invalidate(); },
};

module.exports = BootstrapService;
