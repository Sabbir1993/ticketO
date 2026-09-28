// Seat-plan layout library: templates with immutable published versions.
// Specs use the prototype's JSON format (viewBox, field, tiers, blocks[shape, rows, seatsPerRow,
// rowSeats, aisles, removed, capacity, sell, rotate, front], facilities) and are validated with
// the same geometry code the browser uses.
const crypto = require('crypto');
const Db = use('App/Support/Db');
const DB = use('laranode/Support/Facades/DB');
const ViewType = use('App/Models/ViewType');
const LayoutTemplate = use('App/Models/LayoutTemplate');
const LayoutVersion = use('App/Models/LayoutVersion');
const LayoutSeatAttribute = use('App/Models/LayoutSeatAttribute');
const Geometry = use('App/Support/Geometry');
const { uuid, slugify } = use('App/Support/Ids');
const { bad, forbid, missing } = use('App/Support/HttpError');

const SHAPES = ['rect', 'arc', 'polygon', 'circle'];
const SELL = ['seated', 'ga', 'none'];
const SEAT_ATTRS = ['accessible', 'companion', 'restricted_view', 'house_hold', 'kill'];

// Stable JSON so the checksum does not depend on key order.
function stable(v) {
    if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
    if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
    return JSON.stringify(v ?? null);
}
const checksum = (spec) => crypto.createHash('sha256').update(stable(spec)).digest('hex');

function luminance(hex) {
    const m = String(hex || '').replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return null;
    const [r, g, b] = m.slice(1).map((h) => { const c = parseInt(h, 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const LayoutService = {
    checksum,
    SEAT_ATTRS,

    /** Validates a spec; returns { spec, warnings, stats }. Throws 400 with a plain message. */
    async validateSpec(spec) {
        const G = await Geometry.load();
        if (!spec || typeof spec !== 'object') bad('Layout is empty');
        if (!Array.isArray(spec.tiers) || !spec.tiers.length || !Array.isArray(spec.blocks) || !spec.blocks.length) bad('Layout needs at least one price tier and one block');
        if (spec.blocks.length > 2000) bad('Layout has too many blocks (max 2000)');
        const warnings = [];
        const tiers = new Set();
        for (const t of spec.tiers) {
            if (!t.id || !/^[a-z0-9_-]{1,40}$/i.test(t.id)) bad(`Tier id "${t.id}" must be 1–40 letters, digits, - or _`);
            if (tiers.has(t.id)) bad(`Tier ids must be unique (${t.id})`);
            tiers.add(t.id);
            if (!t.name) bad(`Tier ${t.id} needs a name`);
            const L = luminance(t.color);
            if (L === null) bad(`Tier ${t.id} colour must be #RRGGBB`);
            if (L > 0.85) warnings.push(`Tier ${t.name} colour is very light — seats may be hard to see`);
        }
        const [vw, vh] = Array.isArray(spec.viewBox) ? spec.viewBox : [1000, 760];
        const ids = new Set();
        let seatCount = 0; let gaCapacity = 0;
        for (const b of spec.blocks) {
            if (!b.id || !b.name) bad('Every block needs an id and a name');
            if (!/^[A-Za-z0-9_-]{1,40}$/.test(b.id)) bad(`Block id "${b.id}" must be 1–40 letters, digits, - or _`);
            if (ids.has(b.id)) bad(`Duplicate block id ${b.id}`);
            ids.add(b.id);
            if (!SELL.includes(b.sell)) bad(`Block ${b.id}: sell must be seated, ga or none`);
            if (b.sell !== 'none' && !tiers.has(b.tier)) bad(`Block ${b.id} uses unknown tier ${b.tier}`);
            if (b.sell === 'seated') {
                const seats = G.blockSeatIds(b);
                if (!seats.length) bad(`Block ${b.id} has no seats`);
                if (new Set(seats).size !== seats.length) bad(`Block ${b.id} has duplicate seat numbers`);
                if (seats.some((s) => String(s).length > 20)) bad(`Block ${b.id} seat labels must be 20 characters or less`);
                seatCount += seats.length;
            }
            if (b.sell === 'ga') {
                if (!(Number(b.capacity) > 0)) bad(`Block ${b.id} needs a capacity`);
                gaCapacity += Number(b.capacity);
            }
            if (b.shape) {
                if (!SHAPES.includes(b.shape.type)) bad(`Block ${b.id} has an unknown shape`);
                if (b.shape.type === 'polygon' && (b.shape.points?.length || 0) < 3) bad(`Block ${b.id} polygon needs 3+ points`);
                const bb = G.shapeBBox(b.shape);
                if (bb && (bb.x < -1 || bb.y < -1 || bb.x + bb.w > vw + 1 || bb.y + bb.h > vh + 1)) warnings.push(`Block ${b.name} extends outside the canvas`);
            }
        }
        if (seatCount > 100000) bad('Layout has more than 100,000 seats');
        return { spec, warnings, stats: { seat_count: seatCount, ga_capacity: gaCapacity, block_count: spec.blocks.length, checksum: checksum(spec) } };
    },

    // ------------------------------------------------------------------ queries
    async list({ viewType, ownerMerchantId, includePlatform = true, status } = {}) {
        const q = DB.table('layout_templates as t').join('view_types as vt', 'vt.id', '=', 't.view_type_id')
            .leftJoin('layout_versions as v', 'v.id', '=', 't.current_version_id')
            .select('t.id', 't.uuid', 't.slug', 't.name', 't.status', 't.is_sample', 't.owner_merchant_id', 't.updated_at', 'vt.slug as view_type',
                'v.version', 'v.seat_count', 'v.ga_capacity', 'v.block_count', 'v.published_at')
            .whereNull('t.deleted_at');
        if (viewType) q.where('vt.slug', viewType);
        if (status) q.where('t.status', status);
        if (ownerMerchantId !== undefined) {
            if (includePlatform) q.whereRaw('(t.owner_merchant_id IS NULL OR t.owner_merchant_id = ?)', [ownerMerchantId]);
            else q.where('t.owner_merchant_id', ownerMerchantId);
        }
        return q.orderBy('t.is_sample', 'desc').orderBy('t.name').get();
    },

    async find(idOrUuid) {
        const key = String(idOrUuid);
        const t = await LayoutTemplate.with('currentVersion')
            .whereRaw('(id = ? OR uuid = ? OR slug = ?)', [Number(idOrUuid) || 0, key, key]).first();
        if (!t) missing('Layout not found');
        const [vt, versions] = await Promise.all([
            ViewType.select('slug').where('id', t.view_type_id).first(),
            LayoutVersion.select('id', 'version', 'seat_count', 'ga_capacity', 'block_count', 'checksum', 'notes', 'created_by', 'created_at', 'published_at')
                .where('template_id', t.id).orderBy('version', 'desc').get(),
        ]);
        const current = t.currentVersion || null;
        const attrs = current ? await LayoutSeatAttribute.select('block_key', 'seat_code', 'attr', 'note').where('version_id', current.id).get() : [];
        return {
            ...t.toArray(), view_type: vt?.slug, is_sample: !!t.is_sample, draft_spec: Db.json(t.draft_spec),
            current: current ? { ...current.toArray(), spec: Db.json(current.spec) } : null,
            versions: versions.map((v) => v.toArray()), seatAttributes: attrs.map((a) => a.toArray()),
        };
    },

    /** Ownership: platform layouts need layouts.manage; merchant layouts only by that merchant. */
    assertCanEdit(ctx, t) {
        if (ctx.guard === 'cms') return;
        if (!t.owner_merchant_id || t.owner_merchant_id !== ctx.merchantId) forbid('Merchants can only edit their own layouts — duplicate a platform layout to customise it');
    },

    // ------------------------------------------------------------------ writes
    async create({ name, viewType, spec, venueId = null, ownerMerchantId = null, isSample = false, userId = null, publish = false, notes = null, seatAttributes = [] }) {
        if (!name || String(name).trim().length < 3) bad('Give the layout a name');
        const vt = await ViewType.select('id').where('slug', viewType).first() || bad('Unknown view type');
        const { stats } = await LayoutService.validateSpec(spec);
        let slug = slugify(`${ownerMerchantId ? 'm-' : ''}${name}`, 100);
        if (await LayoutTemplate.withTrashed().where('slug', slug).exists()) slug = `${slug}-${uuid().slice(0, 6)}`;
        const t = await LayoutTemplate.create({
            uuid: uuid(), slug, name: String(name).trim(), view_type_id: vt.id, venue_id: venueId, owner_merchant_id: ownerMerchantId,
            status: 'draft', draft_spec: spec, is_sample: isSample ? 1 : 0, created_by: userId, updated_by: userId,
        });
        if (publish) await LayoutService.publish(t.id, { spec, notes, userId, seatAttributes, stats });
        return t.id;
    },

    /** Autosave work in progress (not validated strictly, never used for sales). */
    async saveDraft(id, spec, userId) {
        if (!spec || !Array.isArray(spec.blocks)) bad('Invalid layout');
        await LayoutTemplate.where('id', id).update({ draft_spec: Db.toJson(spec), updated_by: userId, updated_at: new Date() });
    },

    /** Publish the given spec as the next immutable version. */
    async publish(templateId, { spec, notes = null, userId = null, seatAttributes = [], stats = null }) {
        const s = stats || (await LayoutService.validateSpec(spec)).stats;
        const now = new Date();
        // Row lock on the template (held to commit) so concurrent publishes get distinct version numbers.
        await LayoutTemplate.withTrashed().where('id', templateId).update({ updated_at: now });
        const version = Number(await LayoutVersion.where('template_id', templateId).max('version') || 0) + 1;
        const v = await LayoutVersion.create({
            template_id: templateId, version, spec, seat_count: s.seat_count, ga_capacity: s.ga_capacity, block_count: s.block_count,
            checksum: s.checksum, notes, created_by: userId, created_at: now, published_at: now,
        });
        const versionId = v.id;
        const attrs = (seatAttributes || []).filter((a) => SEAT_ATTRS.includes(a.attr) && a.block_key && a.seat_code);
        if (attrs.length) {
            await Db.insertMany('layout_seat_attributes', attrs.map((a) => ({ version_id: versionId, block_key: a.block_key, seat_code: a.seat_code, attr: a.attr, note: a.note || null })));
        }
        await LayoutTemplate.where('id', templateId).update({ status: 'published', current_version_id: versionId, draft_spec: null, updated_by: userId, updated_at: now });
        return { versionId, version, stats: s };
    },

    /** Copy a template's current version into a new draft (e.g. a merchant customising a sample). */
    async duplicate(ctx, idOrUuid, name) {
        const src = await LayoutService.find(idOrUuid);
        const spec = src.current?.spec || src.draft_spec || bad('Nothing to duplicate yet');
        return LayoutService.create({ name: name || `${src.name} (copy)`, viewType: src.view_type, spec, venueId: src.venue_id, ownerMerchantId: ctx.guard === 'cms' ? null : ctx.merchantId, userId: ctx.user?.id });
    },
};

module.exports = LayoutService;
