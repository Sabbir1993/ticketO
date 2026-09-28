// CMS catalogue: event review queue, seat-plan layouts (templates) and venues.
// Layout saves publish a new immutable version; events keep their own snapshot (event_layouts),
// so editing a template never changes seats already on sale.
const Db = use('App/Support/Db');
const DB = use('laranode/Support/Facades/DB');
const Event = use('App/Models/Event');
const EventLayout = use('App/Models/EventLayout');
const EventShow = use('App/Models/EventShow');
const LayoutTemplate = use('App/Models/LayoutTemplate');
const ViewType = use('App/Models/ViewType');
const Category = use('App/Models/Category');
const City = use('App/Models/City');
const Lookup = use('App/Models/Lookup');
const Venue = use('App/Models/Venue');
const VenueFacility = use('App/Models/VenueFacility');
const VenueTemplate = use('App/Models/VenueTemplate');
const LayoutService = use('App/Services/LayoutService');
const SeatMapService = use('App/Services/SeatMapService');
const CatalogService = use('App/Services/CatalogService');
const BootstrapService = use('App/Services/BootstrapService');
const AuditService = use('App/Services/AuditService');
const Access = use('App/Support/Access');
const { uuid, slugify } = use('App/Support/Ids');
const { bad, missing, forbid } = use('App/Support/HttpError');

const { related, summary, labels, tierInfo, eventQuery, iso } = CatalogService._internals;
const isCms = (ctx) => ctx?.guard === 'cms';

function templateView(t, ctx) {
    const spec = Db.json(t.spec) || Db.json(t.draft_spec) || { blocks: [], tiers: [] };
    return {
        id: t.slug, uuid: t.uuid, name: t.name, viewType: t.view_type, spec, status: t.status, isSample: !!t.is_sample,
        version: t.version || null, seatCount: t.seat_count || 0, gaCapacity: t.ga_capacity || 0,
        ownerId: t.owner_uuid || null, mine: !!t.owner_merchant_id && t.owner_merchant_id === ctx?.merchantId, updatedAt: t.updated_at,
    };
}

async function templatesQuery(ctx, { viewType, slug } = {}) {
    const q = DB.table('layout_templates as t').join('view_types as vt', 'vt.id', '=', 't.view_type_id')
        .leftJoin('layout_versions as v', 'v.id', '=', 't.current_version_id')
        .leftJoin('merchants as m', 'm.id', '=', 't.owner_merchant_id')
        .select('t.id', 't.uuid', 't.slug', 't.name', 't.status', 't.is_sample', 't.owner_merchant_id', 't.draft_spec', 't.updated_at', 'vt.slug as view_type',
            'v.spec', 'v.version', 'v.seat_count', 'v.ga_capacity', 'm.uuid as owner_uuid')
        .whereNull('t.deleted_at');
    if (viewType) q.where('vt.slug', String(viewType));
    if (slug) q.whereRaw('(t.slug = ? OR t.uuid = ?)', [String(slug), String(slug)]);
    // CMS: everything · merchant staff: platform + own · public: published platform layouts only.
    if (!isCms(ctx)) {
        if (ctx?.merchantId) q.whereRaw('(t.owner_merchant_id IS NULL OR t.owner_merchant_id = ?)', [ctx.merchantId]);
        else q.whereNull('t.owner_merchant_id').where('t.status', 'published');
    }
    return q.orderBy('t.is_sample', 'desc').orderBy('t.name').get();
}

const CatalogAdminService = {
    // --------------------------------------------------------------- events
    async events({ status } = {}) {
        const STATUSES = ['draft', 'pending_review', 'published', 'paused', 'rejected', 'cancelled'];
        const q = eventQuery('e.review_note', 'e.updated_at').whereNull('e.deleted_at');
        if (status) { if (!STATUSES.includes(status)) bad('Unknown status'); q.where('e.status', status); }
        const rows = await q.orderBy('e.updated_at', 'desc').limit(500).get();
        const R = await related(rows);
        if (!R) return [];
        const label = await labels();
        return rows.map((e) => ({
            ...summary(e, R, label), reviewNote: e.review_note, description: e.description, updatedAt: e.updated_at,
            tiers: (R.tiers.get(e.id) || []).map((t) => tierInfo(t, R.now)),
            shows: (R.shows.get(e.id) || []).map((s) => ({ id: s.uuid, venueId: s.venue, date: iso(s.starts_at), label: s.label })),
        }));
    },

    async reviewEvent(ctx, eventUuid, { action, note } = {}) {
        Access.need(ctx, 'events.approve');
        const e = await DB.table('events as e').join('merchants as m', 'm.id', '=', 'e.merchant_id').select('e.*', 'm.status as merchant_status')
            .where('e.uuid', String(eventUuid)).whereNull('e.deleted_at').first() || missing('Event not found');
        const now = new Date();
        const clean = note ? String(note).trim().slice(0, 255) : null;
        let next;
        if (action === 'approve') {
            if (!['pending_review', 'paused', 'rejected'].includes(e.status)) bad(`A ${e.status} event cannot be approved`);
            if (e.merchant_status !== 'active') bad('The merchant is not active — approve or reactivate the merchant first');
            next = 'published';
        } else if (action === 'reject') {
            if (e.status !== 'pending_review') bad('Only events in review can be rejected');
            next = 'rejected';
        } else if (action === 'suspend') {
            if (e.status !== 'published') bad('Only live events can be suspended');
            next = 'paused';
        } else bad('Unknown action');

        let materialised = 0;
        await Db.independent(async () => {
            await Event.where('id', e.id).update({ status: next, review_note: clean, updated_by: ctx.user.id, updated_at: now, ...(next === 'published' && !e.published_at ? { published_at: now } : {}) });
            if (next === 'published') {
                // Going live needs a seat map: snapshot the layout (if not yet) and build seats for every upcoming show.
                if (!await EventLayout.where('event_id', e.id).exists()) {
                    const t = e.template_id && await LayoutTemplate.withTrashed().select('current_version_id').where('id', e.template_id).first();
                    if (!t?.current_version_id) bad('The event has no published seat layout');
                    await SeatMapService.snapshot(e.id, { versionId: t.current_version_id, userId: ctx.user.id });
                }
                for (const s of await EventShow.select('id').where('event_id', e.id).where('status', 'scheduled').whereNull('seat_map_generated_at').get()) {
                    await SeatMapService.materialize(s.id, {}); materialised++;
                }
            }
        });
        await AuditService.record(ctx, `EVENT_${action.toUpperCase()}`, { type: 'event', id: e.id, label: e.title }, { before: { status: e.status }, after: { status: next }, meta: { note: clean, showsMaterialised: materialised }, merchantId: e.merchant_id });
        BootstrapService.invalidate();
        return { id: e.uuid, slug: e.slug, title: e.title, status: next };
    },

    // -------------------------------------------------------------- layouts
    async templates(ctx, { viewType } = {}) { return (await templatesQuery(ctx, { viewType })).map((t) => templateView(t, ctx)); },

    async template(ctx, slug) {
        const [t] = await templatesQuery(ctx, { slug });
        if (!t) missing('Template not found');
        return templateView(t, ctx);
    },

    async saveTemplate(ctx, input = {}) {
        const name = String(input.name || '').trim();
        if (name.length < 3) bad('Give the layout a name');
        if (!input.spec) bad('Layout spec is required');
        const existing = input.id ? await LayoutTemplate.query().whereRaw('(slug = ? OR uuid = ?)', [String(input.id), String(input.id)]).first() : null;
        // Merchants never overwrite platform (or other merchants') layouts — they get their own copy instead.
        const editable = existing && (isCms(ctx) || (existing.owner_merchant_id && existing.owner_merchant_id === ctx.merchantId));
        let templateId; let action;
        if (editable) {
            const vt = await ViewType.select('id').where('slug', String(input.viewType || '')).first() || bad('Unknown view type');
            const { stats } = await LayoutService.validateSpec(input.spec);
            await Db.independent(async () => {
                await LayoutTemplate.where('id', existing.id).update({ name, view_type_id: vt.id, updated_by: ctx.user.id, updated_at: new Date() });
                await LayoutService.publish(existing.id, { spec: input.spec, userId: ctx.user.id, stats });
            });
            templateId = existing.id; action = 'LAYOUT_VERSION_PUBLISHED';
        } else {
            templateId = await Db.independent(() => LayoutService.create({
                name, viewType: input.viewType, spec: input.spec, ownerMerchantId: isCms(ctx) ? null : ctx.merchantId, userId: ctx.user.id, publish: true,
            }));
            action = 'LAYOUT_CREATED';
        }
        const t = await LayoutTemplate.select('slug', 'name').where('id', templateId).first();
        await AuditService.record(ctx, action, { type: 'layout', id: templateId, label: t.name }, { meta: { slug: t.slug, blocks: input.spec.blocks?.length || 0 } });
        return CatalogAdminService.template(ctx, t.slug);
    },

    async deleteTemplate(ctx, slug) {
        const t = await LayoutTemplate.query().whereRaw('(slug = ? OR uuid = ?)', [String(slug), String(slug)]).first() || missing('Template not found');
        if (!isCms(ctx) && t.owner_merchant_id !== ctx.merchantId) forbid('You can only delete your own layouts');
        if (t.is_sample) bad('Sample layouts cannot be deleted — duplicate and edit a copy instead');
        if (await Event.where('template_id', t.id).exists() || await Category.where('default_template_id', t.id).exists()) bad('Template is used by events or as a category default');
        const now = new Date();
        await LayoutTemplate.where('id', t.id).update({ deleted_at: now, status: 'archived', updated_by: ctx.user.id, updated_at: now });
        await VenueTemplate.where('template_id', t.id).delete();
        await AuditService.record(ctx, 'LAYOUT_DELETED', { type: 'layout', id: t.id, label: t.name });
        return { ok: true };
    },

    // --------------------------------------------------------------- venues
    async venues() {
        const [rows, fac, tpl, gates] = await Promise.all([
            DB.table('venues as v').join('cities as c', 'c.id', '=', 'v.city_id')
                .select('v.id', 'v.uuid', 'v.slug', 'v.name', 'v.address', 'v.type', 'v.latitude', 'v.longitude', 'v.is_active', 'c.slug as city')
                .whereNull('v.deleted_at').orderBy('v.name').get(),
            DB.table('venue_facilities').select('venue_id', 'code').orderBy('id').get(),
            DB.table('venue_templates as vt').join('layout_templates as t', 't.id', '=', 'vt.template_id').select('vt.venue_id', 't.slug').whereNull('t.deleted_at').get(),
            DB.table('venue_gates').select('venue_id', 'id', 'name').where('is_active', 1).orderBy('sort_order').orderBy('id').get(),
        ]);
        const pick = (list, id, f) => list.filter((x) => x.venue_id === id).map(f);
        return rows.map((v) => ({
            id: v.slug, uuid: v.uuid, name: v.name, city: v.city, address: v.address || '', type: v.type, active: !!v.is_active,
            lat: v.latitude === null ? null : Number(v.latitude), lng: v.longitude === null ? null : Number(v.longitude),
            facilities: pick(fac, v.id, (f) => f.code), templateIds: pick(tpl, v.id, (t) => t.slug), gates: pick(gates, v.id, (g) => g.name),
        }));
    },

    async saveVenue(ctx, v = {}) {
        const name = String(v.name || '').trim().slice(0, 190);
        if (!name || !v.city) bad('Venue name and city are required');
        const city = await City.select('id').where('slug', String(v.city)).first() || bad('Unknown city');
        const types = new Set((await Lookup.select('code').where('lookup_group', 'venue_types').get()).map((r) => r.code));
        const type = String(v.type || 'hall');
        if (types.size && !types.has(type)) bad(`Unknown venue type ${type}`);
        const facilityCodes = new Set((await Lookup.select('code').where('lookup_group', 'facilities').get()).map((r) => r.code));
        const facilities = [...new Set((v.facilities || []).map(String))].filter((f) => facilityCodes.has(f));
        const tplRows = (v.templateIds || []).length ? await LayoutTemplate.select('id').whereIn('slug', v.templateIds.map(String)).get() : [];
        const now = new Date();
        const row = { name, city_id: city.id, address: String(v.address || '').slice(0, 255) || null, type, updated_at: now };
        const existing = v.id ? await Venue.select('id', 'name').where('slug', String(v.id)).first() : null;
        if (v.id && !existing) missing('Venue not found');
        let id;
        await Db.independent(async () => {
            if (existing) { id = existing.id; await Venue.where('id', id).update(row); }
            else {
                let slug = slugify(name, 110);
                if (await Venue.withTrashed().where('slug', slug).exists()) slug = `${slug}-${uuid().slice(0, 6)}`;
                ({ id } = await Venue.create({ ...row, uuid: uuid(), slug }));
            }
            await VenueFacility.where('venue_id', id).delete();
            if (facilities.length) await DB.table('venue_facilities').insert(facilities.map((code) => ({ venue_id: id, code })));
            await VenueTemplate.where('venue_id', id).delete();
            if (tplRows.length) await DB.table('venue_templates').insert(tplRows.map((t) => ({ venue_id: id, template_id: t.id })));
        });
        await AuditService.record(ctx, existing ? 'VENUE_UPDATED' : 'VENUE_CREATED', { type: 'venue', id, label: name }, { after: { ...row, facilities, templates: v.templateIds || [] } });
        return (await CatalogAdminService.venues()).find((x) => x.name === name && x.city === v.city) || { ok: true };
    },
};

module.exports = CatalogAdminService;
