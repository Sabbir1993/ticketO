// Typed key/value settings (platform rules, branding, UI behaviour), CMS-editable and cached.
const Db = use('App/Support/Db');
const DB = use('laranode/Support/Facades/DB');
const Setting = use('App/Models/Setting');
const { bad } = use('App/Support/HttpError');

const TTL_MS = 30000;
let cache = { at: 0, rows: null };

// mysql2 hands JSON columns back already decoded, so a JSON string arrives as a plain JS string
// ("Ticketo") that must not be JSON.parse'd again.
const TEXT_TYPES = ['string', 'color', 'text'];
function decode(r) {
    if (typeof r.value !== 'string' || !TEXT_TYPES.includes(r.value_type)) return Db.json(r.value);
    try { const v = JSON.parse(r.value); return typeof v === 'string' ? v : r.value; } catch { return r.value; }
}

async function all() {
    if (cache.rows && Date.now() - cache.at < TTL_MS) return cache.rows;
    const rows = await Db.outside(() => DB.table('settings').select('setting_group', 'setting_key', 'value', 'value_type', 'label', 'help', 'is_public')
        .orderBy('setting_group').orderBy('setting_key').get());
    cache = { at: Date.now(), rows: rows.map((r) => ({ ...r, value: decode(r) })) };
    return cache.rows;
}

function coerce(type, v) {
    switch (type) {
        case 'number': { const n = Number(v); if (!Number.isFinite(n)) bad('Must be a number'); return n; }
        case 'boolean': return v === true || v === 'true' || v === 1 || v === '1';
        case 'color': if (!/^#[0-9a-f]{6}$/i.test(String(v))) bad('Colour must be #RRGGBB'); return String(v).toUpperCase();
        case 'json': return typeof v === 'string' ? JSON.parse(v) : v;
        default: return v === null || v === undefined ? null : String(v);
    }
}

const SettingsService = {
    invalidate() { cache.at = 0; },

    /** { key: value } for one group. */
    async group(name) {
        const out = {};
        for (const r of await all()) if (r.setting_group === name) out[r.setting_key] = r.value;
        return out;
    },

    async get(group, key, def = null) {
        const r = (await all()).find((x) => x.setting_group === group && x.setting_key === key);
        return r ? r.value : def;
    },

    /** Public settings for the SPA bootstrap, grouped. */
    async publicGroups() {
        const out = {};
        for (const r of await all()) if (r.is_public) (out[r.setting_group] ||= {})[r.setting_key] = r.value;
        return out;
    },

    /** Full list for the CMS editor. */
    async list() { return all(); },

    /** Update many keys in one group; returns { before, after }. Unknown keys are rejected. */
    async update(group, values, userId) {
        const rows = (await all()).filter((r) => r.setting_group === group);
        if (!rows.length) bad('Unknown settings group');
        const before = {}; const after = {};
        for (const [k, v] of Object.entries(values || {})) {
            const r = rows.find((x) => x.setting_key === k) || bad(`Unknown setting ${group}.${k}`);
            before[k] = r.value;
            after[k] = coerce(r.value_type, v);
            await Setting.where('setting_group', group).where('setting_key', k).update({ value: Db.toJson(after[k]), updated_by: userId || null, updated_at: new Date() });
        }
        SettingsService.invalidate();
        return { before, after };
    },
};

module.exports = SettingsService;
