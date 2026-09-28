// CMS configuration (GET /api/admin/config, PUT /api/admin/config/:section).
// Keeps the prototype's config shape for the UI, but every section is stored in its own table:
//   platform/branding → settings · categories → categories · methods → payment_methods
//   gateways → gateway_settings (secrets: Envelope ciphertext, write-only) · promos → promos · home → home_sections
// Each section has its own permission; every change is audited (secrets never appear in the audit trail).
const Db = use('App/Support/Db');
const DB = use('laranode/Support/Facades/DB');
const Category = use('App/Models/Category');
const ViewType = use('App/Models/ViewType');
const LayoutTemplate = use('App/Models/LayoutTemplate');
const Event = use('App/Models/Event');
const Promo = use('App/Models/Promo');
const PaymentMethod = use('App/Models/PaymentMethod');
const GatewaySetting = use('App/Models/GatewaySetting');
const HomeSection = use('App/Models/HomeSection');
const Banner = use('App/Models/Banner');
const Envelope = use('App/Security/Envelope');
const Sslcommerz = use('App/Gateways/SslcommerzGateway');
const GatewayCredentialService = use('App/Services/GatewayCredentialService');
const SettingsService = use('App/Services/SettingsService');
const BootstrapService = use('App/Services/BootstrapService');
const AuditService = use('App/Services/AuditService');
const SecurityEventService = use('App/Services/SecurityEventService');
const Access = use('App/Support/Access');
const { slugify } = use('App/Support/Ids');
const { bad } = use('App/Support/HttpError');

const MASK = '••••••••';
const SECTION_PERMISSION = {
    platform: 'settings.manage', branding: 'branding.manage', home: 'content.manage', categories: 'content.manage',
    methods: 'gateways.manage', gateways: 'gateways.manage', promos: 'promos.manage',
};
// Gateway fields: which are public (stored as-is) and which are secret (encrypted JSON).
const GATEWAY_FIELDS = {
    sslcommerz: { publicId: 'storeId', config: [], secret: ['storePassword'] },
    bkash: { publicId: 'appKey', config: ['username'], secret: ['appSecret', 'password'] },
};
const HOME_KEYS = ['categories', 'sort', 'limit', 'includeUpcoming', 'tag', 'sub', 'cta', 'href', 'icon', 'cityName'];
const ALIAS = { allowMerchantDirectPg: 'allowMerchantDirectPG' };
const camel = (s) => { const k = s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); return ALIAS[k] || k; };
const snake = (s) => (s === 'allowMerchantDirectPG' ? 'allow_merchant_direct_pg' : s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`));
const camelKeys = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [camel(k), v]));
const gwAad = (gateway) => `gateway_settings:${gateway}`;

async function categoriesTree() {
    const rows = await DB.table('categories as c').join('view_types as v', 'v.id', '=', 'c.view_type_id').leftJoin('layout_templates as t', 't.id', '=', 'c.default_template_id')
        .select('c.id', 'c.parent_id', 'c.slug', 'c.name', 'c.icon', 'c.color', 'c.people_label', 'v.slug as view_type', 't.slug as template')
        .whereNull('c.deleted_at').orderBy('c.sort_order').orderBy('c.id').get();
    const view = (c) => ({ id: c.slug, name: c.name, icon: c.icon, color: c.color, viewType: c.view_type, templateId: c.template, peopleLabel: c.people_label });
    return rows.filter((c) => !c.parent_id).map((c) => ({ ...view(c), subCategories: rows.filter((s) => s.parent_id === c.id).map(view) }));
}

async function gatewaysView() {
    const rows = await GatewaySetting.select('gateway', 'is_enabled', 'public_id', 'public_config', 'secret_ciphertext', 'verified_at').get();
    const out = {};
    for (const [g, f] of Object.entries(GATEWAY_FIELDS)) {
        const r = rows.find((x) => x.gateway === g) || {};
        const cfg = Db.json(r.public_config) || {};
        out[g] = {
            enabled: !!r.is_enabled, verifiedAt: r.verified_at || null,
            // Sandbox / live comes from SSLCZ_INIT_URL / SSLCZ_VALIDATION_URL; credentials from here or the env fallback.
            ...(g === 'sslcommerz' ? { ...Sslcommerz.endpoints(), sandbox: Sslcommerz.mode() === 'sandbox', credentialSource: await GatewayCredentialService.platformSource(g) } : {}),
            [f.publicId]: r.public_id || '', ...Object.fromEntries(f.config.map((k) => [k, cfg[k] || ''])),
            // Write-only: a mask when a secret is stored, empty otherwise. The value itself never leaves the server.
            ...Object.fromEntries(f.secret.map((k) => [k, r.secret_ciphertext ? MASK : ''])),
        };
    }
    // The simulator is controlled by PAYMENT_SIMULATOR in the environment and is always off in production.
    out.simulator = { enabled: !!config('ticketo')?.paymentSimulator && env('APP_ENV') !== 'production', envControlled: true };
    return out;
}

const ConfigAdminService = {
    async get() {
        const [platform, branding, categories, methods, gateways, promos, home, banners] = await Promise.all([
            SettingsService.group('platform'), SettingsService.group('branding'), categoriesTree(),
            PaymentMethod.select('code', 'name', 'subtitle', 'icon', 'color', 'gateway', 'multi_card_name', 'is_enabled').where('channel', 'online').orderBy('sort_order').orderBy('id').get(),
            gatewaysView(),
            DB.table('promos as p').leftJoin('categories as c', 'c.id', '=', 'p.category_id')
                .select('p.id', 'p.code', 'p.type', 'p.value', 'p.max_discount', 'p.min_order', 'p.description', 'p.is_active', 'p.used_count', 'p.usage_limit', 'p.per_customer_limit',
                    'p.starts_at', 'p.ends_at', 'c.slug as scope')
                .whereNull('p.event_id').whereNull('p.merchant_id').whereNull('p.deleted_at').orderBy('p.id', 'desc').get(),
            HomeSection.select('id', 'type', 'title', 'config', 'is_hidden').orderBy('sort_order').orderBy('id').get(),
            Banner.select('id', 'title', 'subtitle', 'badge', 'cta_label', 'href', 'palette', 'is_active', 'starts_at', 'ends_at').orderBy('sort_order').orderBy('id').get(),
        ]);
        const num = (v) => (v === null || v === undefined ? null : Number(v));
        return {
            platform: camelKeys(platform),
            branding: camelKeys(branding),
            categories,
            payment: {
                methods: methods.map((m) => ({ id: m.code, name: m.name, sub: m.subtitle, icon: m.icon, color: m.color, gateway: m.gateway, multiCardName: m.multi_card_name || '', enabled: !!m.is_enabled })),
                gateways,
            },
            promos: promos.map((p) => ({
                id: p.id, code: p.code, type: p.type, value: num(p.value), max: num(p.max_discount), minOrder: num(p.min_order), desc: p.description || '',
                scope: p.scope || 'all', active: !!p.is_active, used: p.used_count, limit: p.usage_limit, perCustomer: p.per_customer_limit, startsAt: p.starts_at, endsAt: p.ends_at,
            })),
            home: home.map((h) => ({ id: `h${h.id}`, type: h.type, title: h.title, hidden: !!h.is_hidden, ...(Db.json(h.config) || {}) })),
            banners: banners.map((b) => ({ id: b.id, title: b.title, sub: b.subtitle, badge: b.badge, cta: b.cta_label, href: b.href, palette: Db.json(b.palette) || [], active: !!b.is_active, startsAt: b.starts_at, endsAt: b.ends_at })),
        };
    },

    async update(ctx, section, value) {
        const perm = SECTION_PERMISSION[section] || bad('Unknown config section');
        Access.need(ctx, perm);
        const handler = ConfigAdminService[`_${section}`];
        const meta = await handler(ctx, value);
        await AuditService.record(ctx, 'CONFIG_UPDATED', { type: 'config', id: section, label: section }, meta || {});
        BootstrapService.invalidate();
        return ConfigAdminService.get();
    },

    // ------------------------------------------------------------------ sections
    async _settings(ctx, group, value) {
        if (!value || typeof value !== 'object') bad('Invalid settings');
        const known = new Set(Object.keys(await SettingsService.group(group)));
        const values = {};
        for (const [k, v] of Object.entries(value)) { const key = snake(k); if (known.has(key)) values[key] = v; }
        if (group === 'platform') {
            for (const k of ['convenience_fee_pct', 'vat_on_fee_pct', 'default_commission_pct']) if (k in values && !(Number(values[k]) >= 0 && Number(values[k]) <= 100)) bad(`${k} must be 0–100`);
            for (const k of ['hold_minutes', 'max_tickets_per_order']) if (k in values && !(Number(values[k]) >= 1 && Number(values[k]) <= 60)) bad(`${k} must be 1–60`);
        }
        if (group === 'branding') for (const k of ['primary', 'accent', 'dark']) if (k in values && !/^#[0-9a-f]{6}$/i.test(values[k])) bad(`${k} must be a #RRGGBB colour`);
        return SettingsService.update(group, values, ctx.user.id);
    },
    _platform: (ctx, v) => ConfigAdminService._settings(ctx, 'platform', v),
    _branding: (ctx, v) => ConfigAdminService._settings(ctx, 'branding', v),

    async _categories(ctx, list) {
        if (!Array.isArray(list) || !list.length) bad('Categories must be a non-empty list');
        const views = Object.fromEntries((await ViewType.select('id', 'slug').get()).map((v) => [v.slug, v.id]));
        const tpls = Object.fromEntries((await LayoutTemplate.select('id', 'slug').get()).map((t) => [t.slug, t.id]));
        const existing = (await Category.select('id', 'slug').get()).map((c) => ({ id: c.id, slug: c.slug }));
        const bySlug = Object.fromEntries(existing.map((c) => [c.slug, c.id]));
        const seen = new Set();
        const now = new Date();
        const save = async (c, parentId, sort) => {
            const name = String(c.name || '').trim().slice(0, 120) || bad('Every category needs a name');
            const viewTypeId = views[c.viewType] || bad(`Unknown view type ${c.viewType}`);
            const templateId = c.templateId ? (tpls[c.templateId] || bad(`Unknown layout ${c.templateId}`)) : null;
            let slug = bySlug[c.id] ? c.id : slugify(c.id && !/-[a-z0-9]{6,}$/.test(c.id) ? c.id : name, 60);
            if (!bySlug[slug] && seen.has(slug)) slug = `${slug}-${sort}`;
            seen.add(slug);
            const row = { parent_id: parentId, name, icon: c.icon ? String(c.icon).slice(0, 60) : null, view_type_id: viewTypeId, default_template_id: templateId, sort_order: sort, is_active: 1, updated_at: now };
            if (bySlug[slug]) { await Category.where('id', bySlug[slug]).update(row); return bySlug[slug]; }
            const { id } = await Category.create({ ...row, slug, color: c.color || null, people_label: c.peopleLabel || null });
            bySlug[slug] = id; return id;
        };
        await Db.independent(async () => {
            for (const [i, c] of list.entries()) {
                const pid = await save(c, null, i);
                for (const [j, s] of (c.subCategories || []).entries()) await save(s, pid, j);
            }
            // Removed categories are soft-deleted — refused while events or promos still use them.
            for (const c of existing) {
                if (seen.has(c.slug)) continue;
                const used = await Event.query().whereRaw('(category_id = ? OR subcategory_id = ?)', [c.id, c.id]).exists() || await Promo.where('category_id', c.id).exists();
                if (used) bad(`Category "${c.slug}" is used by events or promos — move them first`);
                await Category.where('id', c.id).update({ deleted_at: now, is_active: 0, updated_at: now });
            }
        });
        return { meta: { count: seen.size } };
    },

    async _methods(ctx, list) {
        if (!Array.isArray(list)) bad('Payment methods must be a list');
        const now = new Date();
        for (const [i, m] of list.entries()) {
            if (!['sslcommerz', 'bkash'].includes(m.gateway)) bad(`Unknown gateway for ${m.name || m.id}`);
            await PaymentMethod.where('code', String(m.id)).where('channel', 'online').update({
                is_enabled: m.enabled ? 1 : 0, gateway: m.gateway, multi_card_name: m.gateway === 'sslcommerz' ? String(m.multiCardName || '').slice(0, 190) || null : null, sort_order: i, updated_at: now,
            });
        }
        return { after: list.map((m) => ({ id: m.id, enabled: !!m.enabled, gateway: m.gateway })) };
    },

    async _gateways(ctx, value) {
        if (!value || typeof value !== 'object') bad('Invalid gateway settings');
        const now = new Date();
        const changedSecrets = [];
        for (const [g, f] of Object.entries(GATEWAY_FIELDS)) {
            const v = value[g];
            if (!v) continue;
            const cur = await GatewaySetting.select('id', 'secret_ciphertext', 'public_config').where('gateway', g).first();
            const publicId = String(v[f.publicId] || '').trim().slice(0, 120) || null;
            const patch = { is_enabled: v.enabled ? 1 : 0, public_id: publicId, updated_by: ctx.user.id, updated_at: now };
            if (g === 'sslcommerz') patch.sandbox = Sslcommerz.mode() === 'sandbox' ? 1 : 0; // informational; the env URLs decide
            patch.public_config = JSON.stringify({ ...(Db.json(cur?.public_config) || {}), ...Object.fromEntries(f.config.map((k) => [k, String(v[k] || '').trim().slice(0, 120)])) });
            // Secrets: only fields the admin actually typed are replaced; the mask / blank keeps the stored value.
            const typed = f.secret.filter((k) => typeof v[k] === 'string' && v[k] !== '' && v[k] !== MASK);
            if (typed.length) {
                const secrets = cur?.secret_ciphertext ? Envelope.decryptJson(cur.secret_ciphertext, gwAad(g)) : {};
                for (const k of typed) secrets[k] = String(v[k]).trim().slice(0, 500); // pasted values often carry spaces
                const { ciphertext, keyVersion } = Envelope.encryptJson(secrets, gwAad(g));
                Object.assign(patch, { secret_ciphertext: ciphertext, key_version: keyVersion, secret_last4: null, verified_at: null });
                changedSecrets.push(...typed.map((k) => `${g}.${k}`));
            }
            const curFull = cur ? await GatewaySetting.select('public_id').where('id', cur.id).first() : null;
            if (!typed.length && curFull && curFull.public_id !== publicId) patch.verified_at = null; // a new store id needs a new test
            if (cur) await GatewaySetting.where('id', cur.id).update(patch);
            else await GatewaySetting.create({ gateway: g, ...patch });
        }
        if (changedSecrets.length) SecurityEventService.record(ctx, 'secret_rotated', { details: { fields: changedSecrets, scope: 'platform_gateway' } });
        return { meta: { secretsChanged: changedSecrets, enabled: Object.fromEntries(Object.keys(GATEWAY_FIELDS).map((g) => [g, !!value[g]?.enabled])) } };
    },

    /** POST /api/admin/config/gateways/sslcommerz/test — opens a ৳10 session with the platform store (nothing is charged). */
    async testGateway(ctx, gateway) {
        Access.need(ctx, 'gateways.manage');
        if (gateway !== 'sslcommerz') bad('Only SSLCOMMERZ can be tested here');
        const resolved = await GatewayCredentialService.resolve(ctx, { gateway, pgMode: 'platform' });
        if (!resolved) return { ok: false, mode: Sslcommerz.mode(), message: 'No platform credentials: enter the Store ID and password here (or set SSLCZ_STORE_ID / SSLCZ_STORE_PASSWORD), and keep SSLCOMMERZ enabled.' };
        const r = await Sslcommerz.test(resolved.creds, { callbackBase: `${config('ticketo').publicUrl}/api/pg/sslcommerz` });
        if (r.ok && resolved.source === 'cms') await GatewaySetting.where('gateway', gateway).update({ verified_at: new Date(), updated_at: new Date() });
        await AuditService.record(ctx, r.ok ? 'PG_VERIFIED' : 'PG_VERIFY_FAILED', { type: 'gateway', id: gateway, label: gateway }, { meta: { mode: r.mode, source: resolved.source } });
        return { ...r, credentialSource: resolved.source };
    },

    async _promos(ctx, list) {
        if (!Array.isArray(list)) bad('Promos must be a list');
        const cats = Object.fromEntries((await Category.select('id', 'slug').get()).map((c) => [c.slug, c.id]));
        const now = new Date();
        const codes = new Set();
        const rows = list.map((p) => {
            const code = String(p.code || '').trim().toUpperCase();
            if (!/^[A-Z0-9_-]{3,40}$/.test(code)) bad(`Promo code "${code}" must be 3–40 letters, digits, - or _`);
            if (codes.has(code)) bad(`Duplicate promo code ${code}`); codes.add(code);
            if (!['pct', 'flat'].includes(p.type)) bad(`${code}: type must be % or ৳`);
            const value = Number(p.value);
            if (!(value > 0) || (p.type === 'pct' && value > 100)) bad(`${code}: invalid value`);
            const scope = !p.scope || p.scope === 'all' ? null : (cats[p.scope] || bad(`${code}: unknown category "${p.scope}"`));
            const int = (x) => (x === null || x === undefined || x === '' ? null : Math.max(0, Math.floor(Number(x))));
            return {
                id: p.id || null, code, type: p.type, value, max_discount: p.type === 'pct' ? int(p.max) : null, min_order: int(p.minOrder) || 0,
                description: String(p.desc || '').slice(0, 255) || null, category_id: scope, usage_limit: int(p.limit), per_customer_limit: int(p.perCustomer), is_active: p.active ? 1 : 0,
            };
        });
        await Db.independent(async () => {
            for (const r of rows) {
                const { id, ...data } = r;
                // Platform promos only (no event / merchant scope).
                const cur = await (id ? Promo.withTrashed().where('id', id) : Promo.where('code', data.code)).whereNull('event_id').whereNull('merchant_id').first();
                if (cur) await Promo.withTrashed().where('id', cur.id).update({ ...data, updated_at: now });
                else await Promo.create({ ...data, created_by: ctx.user.id });
            }
        });
        return { after: rows.map((r) => ({ code: r.code, active: !!r.is_active, value: r.value, type: r.type })) };
    },

    async _home(ctx, list) {
        if (!Array.isArray(list)) bad('Home sections must be a list');
        const TYPES = ['banners', 'row', 'categories', 'cta'];
        const rows = list.map((s, i) => {
            if (!TYPES.includes(s.type)) bad(`Unknown section type ${s.type}`);
            const cfg = Object.fromEntries(HOME_KEYS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]]));
            if (cfg.limit !== undefined) cfg.limit = Math.max(1, Math.min(50, Number(cfg.limit) || 12));
            if (cfg.href && !/^\/[^/]|^\/$|^https:\/\//.test(String(cfg.href))) bad('Links must be site paths (/…) or https:// URLs');
            return { type: s.type, title: s.title ? String(s.title).slice(0, 190) : null, config: JSON.stringify(cfg), is_hidden: s.hidden ? 1 : 0, sort_order: i };
        });
        const before = (await HomeSection.select('type', 'title').orderBy('sort_order').get()).map((h) => ({ type: h.type, title: h.title }));
        await Db.independent(async () => {
            await HomeSection.where('id', '>', 0).delete(); // replace the whole list
            for (const r of rows) await HomeSection.create(r);
        });
        return { before, after: rows.map((r) => ({ type: r.type, title: r.title, hidden: !!r.is_hidden })) };
    },
};

module.exports = ConfigAdminService;
