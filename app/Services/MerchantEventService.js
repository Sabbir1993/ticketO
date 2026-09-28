// Merchant portal events: editor load/save, publish, pause/resume, delete, list with sales stats.
// The editor keeps the prototype's event shape (slugs for category / template / venues, tiers, shows,
// blockOverrides, policy, promos, customSpec). Inventory safety:
//   · the event's seat plan is a snapshot (event_layouts); changing it re-materialises unsold shows only —
//     SeatMapService refuses when a show already has held or sold seats
//   · a show with bookings cannot be removed from the schedule
// Payment store: the merchant default, or the event's own (savePayment). Publishing needs a verified one.
const Db = use('App/Support/Db');
const DB = use('laranode/Support/Facades/DB');
const Event = use('App/Models/Event');
const EventTier = use('App/Models/EventTier');
const EventShow = use('App/Models/EventShow');
const EventLayout = use('App/Models/EventLayout');
const EventVenue = use('App/Models/EventVenue');
const EventTaxonomy = use('App/Models/EventTaxonomy');
const EventPerson = use('App/Models/EventPerson');
const EventBlockOverride = use('App/Models/EventBlockOverride');
const Category = use('App/Models/Category');
const LayoutTemplate = use('App/Models/LayoutTemplate');
const LayoutVersion = use('App/Models/LayoutVersion');
const Venue = use('App/Models/Venue');
const Lookup = use('App/Models/Lookup');
const Promo = use('App/Models/Promo');
const Order = use('App/Models/Order');
const Merchant = use('App/Models/Merchant');
const EventGatewayCredential = use('App/Models/EventGatewayCredential');
const Creds = use('App/Services/GatewayCredentialService');
const Sslcommerz = use('App/Gateways/SslcommerzGateway');
const Access = use('App/Support/Access');
const ShowSeat = use('App/Models/ShowSeat');
const ShowZone = use('App/Models/ShowZone');
const LayoutService = use('App/Services/LayoutService');
const SeatMapService = use('App/Services/SeatMapService');
const SettingsService = use('App/Services/SettingsService');
const CatalogService = use('App/Services/CatalogService');
const BootstrapService = use('App/Services/BootstrapService');
const AuditService = use('App/Services/AuditService');
const { uuid, slugify } = use('App/Support/Ids');
const { bad, missing, conflict } = use('App/Support/HttpError');

const { related, summary, labels, eventQuery } = CatalogService._internals;
const PAID = ['paid', 'refund_requested'];
const iso = (d) => (d ? new Date(d).toISOString() : null);
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const date = (v, label) => { if (v === null || v === undefined || v === '') return null; const d = new Date(v); if (Number.isNaN(d.getTime())) bad(`${label} is not a valid date`); return d; };
const HEX = /^#[0-9a-f]{6}$/i;

/** Which store the event uses. Masked values only. */
async function paymentView(e) {
    const [own, def] = await Promise.all([
        EventGatewayCredential.select('public_id', 'secret_ciphertext', 'is_active', 'verified_at').where('event_id', e.id).where('gateway', 'sslcommerz').first(),
        Creds.viewOf('merchant', e.merchant_id, 'sslcommerz'),
    ]);
    const useDefault = !own?.is_active;
    const event = own ? Creds.view(own, 'sslcommerz') : { storeId: '', storePassword: '', verifiedAt: null };
    return { useDefault, mode: Sslcommerz.mode(), sslcommerz: event, merchantDefault: def, active: useDefault ? def : event };
}

async function ownEvent(ctx, eventUuid) {
    const e = await Event.where('uuid', String(eventUuid || '')).where('merchant_id', ctx.merchantId || 0).first();
    return e || missing('Event not found');
}

/** Lookup code for a label (case-insensitive), or null. */
async function codeFor(group, label) {
    const l = str(label, 120);
    if (!l) return null;
    return (await Lookup.select('code').where('lookup_group', group).whereRaw('(LOWER(label) = ? OR code = ?)', [l.toLowerCase(), l]).first())?.code || null;
}

async function templateSpec(tplRow) {
    const v = tplRow.current_version_id ? await LayoutVersion.select('id', 'spec').where('id', tplRow.current_version_id).first() : null;
    if (!v) bad('This layout has no published version yet');
    return { versionId: v.id, spec: v.spec };
}

/** Shows that have any inventory in play or orders — they cannot be removed or re-drawn. */
async function showsWithBookings(showIds) {
    if (!showIds.length) return new Set();
    const [seats, zones, orders] = await Promise.all([
        DB.table('show_seats').select('show_id').whereIn('show_id', showIds).whereIn('status', ['held', 'sold']).groupBy('show_id').get(),
        DB.table('show_zones').select('show_id').whereIn('show_id', showIds).where('sold', '>', 0).groupBy('show_id').get(),
        DB.table('orders').select('show_id').whereIn('show_id', showIds).groupBy('show_id').get(),
    ]);
    return new Set([...seats, ...zones, ...orders].map((r) => r.show_id));
}

/** Sales stats per event id: capacity / sold on upcoming shows + paid order money. */
async function stats(eventIds) {
    const out = new Map(eventIds.map((id) => [id, { capacity: 0, sold: 0, liveTickets: 0, revenue: 0, onlineRevenue: 0, orders: 0 }]));
    if (!eventIds.length) return out;
    const upcoming = new Date(Date.now() - 6 * 3600000);
    const [seats, zones, money, tickets] = await Promise.all([
        DB.table('show_seats as ss').join('event_shows as s', 's.id', '=', 'ss.show_id').select('s.event_id').selectRaw("COUNT(*) as capacity, SUM(ss.status = 'sold') as sold")
            .whereIn('s.event_id', eventIds).where('s.status', 'scheduled').where('s.starts_at', '>', upcoming).groupBy('s.event_id').get(),
        DB.table('show_zones as z').join('event_shows as s', 's.id', '=', 'z.show_id').select('s.event_id').selectRaw('SUM(z.capacity) as capacity, SUM(z.sold) as sold')
            .whereIn('s.event_id', eventIds).where('s.status', 'scheduled').where('s.starts_at', '>', upcoming).groupBy('s.event_id').get(),
        DB.table('orders').select('event_id').selectRaw("COUNT(*) as orders, SUM(subtotal - discount) as revenue, SUM(CASE WHEN channel = 'web' THEN subtotal - discount ELSE 0 END) as online")
            .whereIn('event_id', eventIds).whereIn('status', PAID).groupBy('event_id').get(),
        DB.table('tickets as t').join('orders as o', 'o.id', '=', 't.order_id').select('o.event_id').selectRaw('COUNT(*) as n')
            .whereIn('o.event_id', eventIds).whereIn('o.status', PAID).groupBy('o.event_id').get(),
    ]);
    for (const r of [...seats, ...zones]) { const s = out.get(r.event_id); s.capacity += Number(r.capacity || 0); s.sold += Number(r.sold || 0); }
    for (const r of money) Object.assign(out.get(r.event_id), { orders: Number(r.orders), revenue: Number(r.revenue || 0), onlineRevenue: Number(r.online || 0) });
    for (const r of tickets) out.get(r.event_id).liveTickets = Number(r.n);
    return out;
}

const MerchantEventService = {
    stats,

    /** List for the portal / POS / gate: catalogue summary + review note + stats. */
    async list(ctx) {
        const rows = await eventQuery('e.review_note', 'e.updated_at').where('e.merchant_id', ctx.merchantId || 0).whereNull('e.deleted_at')
            .orderBy('e.updated_at', 'desc').limit(500).get();
        const R = await related(rows);
        if (!R) return [];
        const [label, S] = await Promise.all([labels(), stats(rows.map((e) => e.id))]);
        return rows.map((e) => ({ ...summary(e, R, label), reviewNote: e.review_note || null, updatedAt: e.updated_at, stats: S.get(e.id) }));
    },

    /** Editor shape. */
    async get(ctx, eventUuid) {
        const e = await ownEvent(ctx, eventUuid);
        const [cat, tpl, vt, venues, tax, people, tiers, shows, overrides, layout, promos, label] = await Promise.all([
            Category.withTrashed().select('id', 'slug', 'parent_id').whereIn('id', [e.category_id, e.subcategory_id].filter(Boolean)).get(),
            e.template_id ? LayoutTemplate.withTrashed().select('slug').where('id', e.template_id).first() : null,
            DB.table('view_types').select('slug').where('id', e.view_type_id).first(),
            DB.table('event_venues as ev').join('venues as v', 'v.id', '=', 'ev.venue_id').select('v.slug').where('ev.event_id', e.id).orderBy('ev.sort_order').get(),
            EventTaxonomy.query().where('event_id', e.id).get(),
            EventPerson.query().where('event_id', e.id).orderBy('sort_order').get(),
            EventTier.query().where('event_id', e.id).orderBy('sort_order').get(),
            EventShow.select('uuid', 'starts_at', 'label').where('event_id', e.id).where('status', 'scheduled').orderBy('starts_at').get(),
            EventBlockOverride.query().where('event_id', e.id).get(),
            EventLayout.select('spec', 'is_custom').where('event_id', e.id).first(),
            Promo.select('code', 'type', 'value').where('event_id', e.id).get(),
            labels(),
        ]);
        const c = cat.find((x) => x.id === e.category_id); const sub = cat.find((x) => x.id === e.subcategory_id);
        return {
            id: e.uuid, slug: e.slug, title: e.title, status: e.status, reviewNote: e.review_note || null,
            category: c?.slug || null, subCategory: sub?.slug || null, viewType: vt?.slug, templateId: tpl?.slug || null,
            venueIds: venues.map((v) => v.slug),
            genres: [...tax.filter((t) => t.taxonomy === 'genre').map((t) => label('genres', t.code)), ...tax.filter((t) => t.taxonomy === 'tag').map((t) => t.code)],
            language: label('languages', e.language_code) || '', duration: e.duration || '', certificate: label('certificates', e.certificate_code) || '',
            description: e.description || '',
            cast: people.filter((p) => p.kind === 'cast').map((p) => ({ name: p.name, role: p.role })),
            sponsors: people.filter((p) => p.kind === 'sponsor').map((p) => p.name),
            palette: e.palette || ['#1E3A8A', '#2D499A'],
            tiers: tiers.map((t) => ({
                id: t.tier_key, name: t.name, color: t.color, price: Number(t.price), limit: t.per_order_limit || null,
                earlyBird: t.early_bird_price !== null && t.early_bird_until ? { price: Number(t.early_bird_price), until: iso(t.early_bird_until) } : null,
            })),
            shows: shows.map((s) => ({ id: s.uuid, date: iso(s.starts_at), label: s.label || '' })),
            blockOverrides: Object.fromEntries(overrides.map((o) => [o.block_key, { enabled: !!o.is_enabled, ...(o.capacity ? { capacity: o.capacity } : {}) }])),
            policy: {
                cancellable: !!e.is_cancellable, refundable: !!e.is_refundable, transferable: !!e.is_transferable,
                refundWindowHrs: e.refund_window_hrs ?? 24, cancellationFeePct: Number(e.cancellation_fee_pct ?? 0),
            },
            bookingLimit: e.booking_limit, saleStart: iso(e.sale_start), saleEnd: iso(e.sale_end),
            customSpec: layout?.is_custom ? layout.spec : null,
            promos: promos.map((p) => ({ code: p.code, type: p.type, value: Number(p.value) })),
            payment: await paymentView(e),
        };
    },

    /**
     * PUT /api/merchant/events/{id}/payment — { useDefault: true } or { useDefault: false, sslcommerz: { storeId, storePassword } }.
     * The password is write-only: send the mask (or nothing) to keep the stored one.
     */
    async savePayment(ctx, eventUuid, { useDefault = true, sslcommerz = {} } = {}) {
        Access.need(ctx, 'merchant.gateway.manage');
        const e = await ownEvent(ctx, eventUuid);
        const cur = await EventGatewayCredential.select('is_active', 'secret_ciphertext').where('event_id', e.id).where('gateway', 'sslcommerz').first();
        let changed = [];
        if (useDefault) await Creds.useDefault(e.id, 'sslcommerz');
        else {
            if (!str(sslcommerz.storeId, 120)) bad('Enter the Store ID for this event');
            const hasPassword = (typeof sslcommerz.storePassword === 'string' && sslcommerz.storePassword.trim() && sslcommerz.storePassword !== Creds.MASK) || cur?.secret_ciphertext;
            if (!hasPassword) bad('Enter the Store password for this event');
            changed = await Creds.save(ctx, { scope: 'event', ownerId: e.id, merchantId: e.merchant_id, gateway: 'sslcommerz', values: sslcommerz });
        }
        await AuditService.record(ctx, 'EVENT_PG_UPDATED', { type: 'event', id: e.id, label: e.title }, {
            before: { store: cur?.is_active ? 'event' : 'merchant_default' }, after: { store: useDefault ? 'merchant_default' : 'event' }, meta: { secretsChanged: changed }, merchantId: e.merchant_id,
        });
        return paymentView(e);
    },

    /** POST /api/merchant/events/{id}/payment/test — a ৳10 session on the store this event will use (never charged). */
    async testPayment(ctx, eventUuid) {
        Access.need(ctx, 'merchant.gateway.manage');
        const e = await ownEvent(ctx, eventUuid);
        const resolved = await Creds.resolve(ctx, { gateway: 'sslcommerz', merchantId: e.merchant_id, eventId: e.id, checkEnabled: false });
        if (!resolved) bad('No payment store yet — enter this event’s store, or set your default store in Settings → Payment gateway');
        const r = await Sslcommerz.test(resolved.creds, { callbackBase: `${config('ticketo').publicUrl}/api/pg/sslcommerz`, merchantRef: e.uuid });
        if (r.ok) await Creds.markVerified(resolved.source, resolved.ownerId, 'sslcommerz');
        await AuditService.record(ctx, r.ok ? 'PG_VERIFIED' : 'PG_VERIFY_FAILED', { type: 'event', id: e.id, label: e.title }, { meta: { gateway: 'sslcommerz', scope: resolved.source, mode: r.mode }, merchantId: e.merchant_id });
        return { ...r, source: resolved.source, payment: await paymentView(e) };
    },

    async save(ctx, input = {}) {
        // ---- validate everything before touching the database
        const title = str(input.title, 190);
        if (title.length < 3) bad('Event name is required (at least 3 characters)');
        const description = str(input.description, 5000);
        const cat = await Category.select('id', 'slug', 'view_type_id').where('slug', str(input.category, 60)).whereNull('parent_id').where('is_active', 1).first() || bad('Choose a category');
        const sub = input.subCategory ? await Category.select('id').where('slug', str(input.subCategory, 60)).where('parent_id', cat.id).first() || bad('Choose a valid sub-category') : null;
        const tplRow = await LayoutTemplate.select('id', 'view_type_id', 'current_version_id', 'owner_merchant_id').where('slug', str(input.templateId, 120)).where('status', 'published').first();
        if (!tplRow || (tplRow.owner_merchant_id && tplRow.owner_merchant_id !== ctx.merchantId)) bad('Choose a venue layout');
        const venueSlugs = [...new Set((input.venueIds || []).map((v) => str(v, 120)).filter(Boolean))].slice(0, 20);
        const venueRows = venueSlugs.length ? await Venue.select('id', 'slug', 'merchant_id').whereIn('slug', venueSlugs).where('is_active', 1).get() : [];
        const venueIds = venueSlugs.map((s) => venueRows.find((v) => v.slug === s)).filter((v) => v && (!v.merchant_id || v.merchant_id === ctx.merchantId)).map((v) => v.id);
        if (!venueIds.length) bad('Choose a venue');

        const base = await templateSpec(tplRow);
        const customSpec = input.customSpec ? (await LayoutService.validateSpec(input.customSpec)).spec : null;
        const spec = customSpec || base.spec;
        const specTiers = new Map((spec.tiers || []).map((t) => [t.id, t]));
        const tiers = (Array.isArray(input.tiers) ? input.tiers : []).filter((t) => specTiers.has(t.id)).map((t, i) => {
            const price = Number(t.price);
            if (!(price >= 0) || price > 1000000) bad(`Enter a valid price for ${t.name || t.id}`);
            const eb = t.earlyBird?.price && t.earlyBird?.until ? { price: Number(t.earlyBird.price), until: date(t.earlyBird.until, 'Early-bird end') } : null;
            if (eb && !(eb.price >= 0 && eb.price < price)) bad(`Early-bird price for ${t.name || t.id} must be below the normal price`);
            return {
                tier_key: t.id, name: str(t.name, 120) || specTiers.get(t.id).name, color: HEX.test(t.color || '') ? t.color : specTiers.get(t.id).color, price,
                per_order_limit: t.limit ? Math.max(1, Math.min(100, Math.floor(Number(t.limit)))) : null, early_bird_price: eb?.price ?? null, early_bird_until: eb?.until ?? null, sort_order: i,
            };
        });
        const shows = (Array.isArray(input.shows) ? input.shows : []).slice(0, 200).map((s, i) => ({ id: s.id ? str(s.id, 64) : null, when: date(s.date, 'Show date'), label: str(s.label, 60) || `Show ${i + 1}` }))
            .filter((s) => s.when);
        const palette = Array.isArray(input.palette) && input.palette.length === 2 && input.palette.every((c) => HEX.test(c)) ? input.palette : ['#1E3A8A', '#2D499A'];
        const policy = input.policy || {};
        const maxTickets = Number(await SettingsService.get('platform', 'max_tickets_per_order', 10)) || 10;
        const saleStart = date(input.saleStart, 'Sales open'); const saleEnd = date(input.saleEnd, 'Sales close');
        if (saleStart && saleEnd && saleEnd <= saleStart) bad('Sales must close after they open');
        const promos = (Array.isArray(input.promos) ? input.promos : []).filter((p) => p.code).slice(0, 20).map((p) => {
            const code = String(p.code).toUpperCase().replace(/\s/g, '');
            if (!/^[A-Z0-9_-]{3,40}$/.test(code)) bad(`Promo code "${code}" must be 3–40 letters, digits, - or _`);
            const value = Number(p.value);
            const type = p.type === 'flat' ? 'flat' : 'pct';
            if (!(value > 0) || (type === 'pct' && value > 100)) bad(`${code}: invalid discount`);
            return { code, type, value };
        });
        if (new Set(promos.map((p) => p.code)).size !== promos.length) bad('Promo codes must be unique');
        const overrides = Object.entries(input.blockOverrides || {}).slice(0, 2000).filter(([k]) => /^[A-Za-z0-9_-]{1,40}$/.test(k))
            .map(([block_key, o]) => ({ block_key, is_enabled: o?.enabled === false ? 0 : 1, capacity: o?.capacity ? Math.max(1, Math.min(200000, Math.floor(Number(o.capacity)))) : null }));
        const genreLabels = (Array.isArray(input.genres) ? input.genres : []).map((g) => str(g, 60)).filter(Boolean).slice(0, 12);
        const taxonomy = [];
        for (const g of genreLabels) { const code = await codeFor('genres', g); taxonomy.push(code ? ['genre', code] : ['tag', slugify(g, 60)]); }
        const people = [
            ...(Array.isArray(input.cast) ? input.cast : []).slice(0, 50).map((c, i) => ({ kind: 'cast', name: str(c.name, 150), role: str(c.role, 80) || null, sort_order: i })),
            ...(Array.isArray(input.sponsors) ? input.sponsors : []).slice(0, 30).map((s, i) => ({ kind: 'sponsor', name: str(s, 150), role: null, sort_order: i })),
        ].filter((p) => p.name);
        const row = {
            title, description, category_id: cat.id, subcategory_id: sub?.id || null, view_type_id: tplRow.view_type_id, template_id: tplRow.id,
            language_code: (await codeFor('languages', input.language)) || str(input.language, 40) || null,
            certificate_code: (await codeFor('certificates', input.certificate)) || str(input.certificate, 40) || null,
            duration: str(input.duration, 60) || null, palette,
            booking_limit: Math.max(1, Math.min(Math.floor(Number(input.bookingLimit) || 8), maxTickets)), sale_start: saleStart, sale_end: saleEnd,
            is_refundable: policy.refundable === false ? 0 : 1, is_cancellable: policy.cancellable === false ? 0 : 1, is_transferable: policy.transferable === false ? 0 : 1,
            refund_window_hrs: Math.max(0, Math.min(720, Math.floor(Number(policy.refundWindowHrs ?? 24)))),
            cancellation_fee_pct: Math.max(0, Math.min(100, Number(policy.cancellationFeePct ?? 10))),
            updated_by: ctx.user.id,
        };

        // ---- write
        const existing = input.id ? await ownEvent(ctx, input.id) : null;
        const eventId = await Db.transaction(async () => {
            let id;
            if (existing) {
                id = existing.id;
                await Event.where('id', id).update({ ...row, palette: Db.toJson(palette), ...(existing.status === 'rejected' ? { status: 'draft', review_note: null } : {}), updated_at: new Date() });
            } else {
                let slug = slugify(title, 150);
                if (await Event.withTrashed().where('slug', slug).exists()) slug = `${slug}-${uuid().slice(0, 6)}`;
                ({ id } = await Event.create({ ...row, uuid: uuid(), slug, merchant_id: ctx.merchantId, status: 'draft', created_by: ctx.user.id, interested_count: 0, votes_count: 0, rating_avg: 0, schedule_type: 'fixed' }));
            }
            await EventVenue.where('event_id', id).delete();
            await DB.table('event_venues').insert(venueIds.map((v, i) => ({ event_id: id, venue_id: v, sort_order: i })));
            await EventTaxonomy.where('event_id', id).whereIn('taxonomy', ['genre', 'tag']).delete();
            if (taxonomy.length) await DB.table('event_taxonomies').insertOrIgnore(taxonomy.map(([t, code]) => ({ event_id: id, taxonomy: t, code })));
            await EventPerson.where('event_id', id).delete();
            if (people.length) await DB.table('event_people').insert(people.map((p) => ({ event_id: id, ...p })));
            await EventTier.where('event_id', id).delete();
            for (const t of tiers) await EventTier.create({ event_id: id, ...t });
            await EventBlockOverride.where('event_id', id).delete();
            if (overrides.length) await DB.table('event_block_overrides').insert(overrides.map((o) => ({ event_id: id, ...o })));

            // Event promo codes: upsert by code, retire the rest.
            const current = await Promo.withTrashed().where('event_id', id).get();
            for (const p of promos) {
                const hit = current.find((c) => c.code === p.code);
                if (hit) await Promo.withTrashed().where('id', hit.id).update({ type: p.type, value: p.value, is_active: 1, deleted_at: null, updated_at: new Date() });
                else await Promo.create({ ...p, event_id: id, merchant_id: ctx.merchantId, min_order: 0, is_active: 1, created_by: ctx.user.id });
            }
            const keep = new Set(promos.map((p) => p.code));
            const retire = current.filter((c) => !keep.has(c.code) && !c.deleted_at).map((c) => c.id);
            if (retire.length) await Promo.query().whereIn('id', retire).update({ deleted_at: new Date(), is_active: 0 });

            // Seat plan snapshot (only when it changed).
            const layout = await EventLayout.select('id', 'source_version_id', 'checksum', 'is_custom').where('event_id', id).first();
            const layoutChanged = !layout || (customSpec ? layout.checksum !== LayoutService.checksum(customSpec) : (layout.is_custom || layout.source_version_id !== base.versionId));
            if (layoutChanged) await SeatMapService.snapshot(id, customSpec ? { spec: customSpec, versionId: base.versionId, userId: ctx.user.id } : { versionId: base.versionId, userId: ctx.user.id });

            // Schedule.
            const have = await EventShow.select('id', 'uuid', 'starts_at', 'label', 'seat_map_generated_at').where('event_id', id).where('status', 'scheduled').get();
            const keepIds = new Set(shows.filter((s) => s.id).map((s) => s.id));
            const dropped = have.filter((s) => !keepIds.has(s.uuid));
            const booked = await showsWithBookings(dropped.map((s) => s.id));
            if (booked.size) bad(`${dropped.find((s) => booked.has(s.id)).label || 'A show'} has bookings — pause the event instead of removing the show`);
            for (const s of dropped) {
                // No orders on this show (checked above): expired / released holds go with it.
                const holdIds = (await DB.table('seat_holds').select('id').where('show_id', s.id).get()).map((h) => h.id);
                if (holdIds.length) { await DB.table('seat_hold_items').whereIn('hold_id', holdIds).delete(); await DB.table('seat_holds').whereIn('id', holdIds).delete(); }
                await ShowSeat.where('show_id', s.id).delete(); await ShowZone.where('show_id', s.id).delete(); await EventShow.where('id', s.id).delete();
            }
            for (const s of shows) {
                const cur = s.id && have.find((h) => h.uuid === s.id);
                if (cur) { if (new Date(cur.starts_at).getTime() !== s.when.getTime() || cur.label !== s.label) await EventShow.where('id', cur.id).update({ starts_at: s.when, label: s.label, venue_id: venueIds[0], updated_at: new Date() }); }
                else await EventShow.create({ uuid: uuid(), event_id: id, venue_id: venueIds[0], starts_at: s.when, label: s.label, status: 'scheduled', source: 'manual' });
            }
            // Live events: new shows get seats now; a changed plan is re-drawn on shows without bookings.
            const status = existing?.status || 'draft';
            if (['published', 'paused'].includes(status) || (layoutChanged && existing)) {
                for (const s of await EventShow.select('id', 'seat_map_generated_at').where('event_id', id).where('status', 'scheduled').get()) {
                    if (!s.seat_map_generated_at) { if (['published', 'paused'].includes(status)) await SeatMapService.materialize(s.id, {}); } else if (layoutChanged) await SeatMapService.materialize(s.id, { force: true });
                }
            }
            return id;
        });
        await AuditService.record(ctx, existing ? 'EVENT_UPDATED' : 'EVENT_CREATED', { type: 'event', id: eventId, label: title }, { meta: { tiers: tiers.length, shows: shows.length, custom: !!customSpec }, merchantId: ctx.merchantId });
        BootstrapService.invalidate();
        return MerchantEventService.get(ctx, (await Event.select('uuid').where('id', eventId).first()).uuid);
    },

    async publish(ctx, eventUuid) {
        const e = await ownEvent(ctx, eventUuid);
        if (!['draft', 'rejected', 'paused'].includes(e.status)) bad(e.status === 'published' ? 'This event is already live' : `A ${e.status.replace('_', ' ')} event cannot be published`);
        const m = await Merchant.select('status').where('id', e.merchant_id).first();
        if (m.status !== 'active') bad(m.status === 'pending' ? 'Your merchant account is still under KYC review. You can publish once it is approved.' : `Merchant account is ${m.status}`, 'merchant_inactive');
        const store = await paymentView(e);
        if (!store.active) bad('Set a payment store — your default (Settings → Payment gateway) or this event’s own (Payment step) — before publishing', 'pg_missing');
        if (!store.active.verifiedAt) bad(`Test the ${store.useDefault ? 'default' : 'event'} payment store connection (Payment step → Test connection) before publishing`, 'pg_unverified');
        const [tiers, shows, layout, overrides] = await Promise.all([
            EventTier.select('tier_key').where('event_id', e.id).get(),
            EventShow.select('id').where('event_id', e.id).where('status', 'scheduled').where('starts_at', '>', new Date()).get(),
            EventLayout.select('spec').where('event_id', e.id).first(),
            EventBlockOverride.select('block_key', 'is_enabled').where('event_id', e.id).get(),
        ]);
        if (!tiers.length) bad('Set a price for at least one ticket category');
        if (!shows.length) bad('Add at least one upcoming show date');
        if (!layout) bad('Choose a venue layout');
        const priced = new Set(tiers.map((t) => t.tier_key));
        const off = new Set(overrides.filter((o) => !o.is_enabled).map((o) => o.block_key));
        if (!(layout.spec.blocks || []).some((b) => b.sell !== 'none' && priced.has(b.tier) && !off.has(b.id))) bad('No sellable blocks — enable at least one block/zone and price its category');

        const review = (await SettingsService.get('platform', 'event_requires_approval', false)) && e.status !== 'paused';
        const next = review ? 'pending_review' : 'published';
        let materialised = 0;
        await Db.transaction(async () => {
            await Event.where('id', e.id).update({ status: next, review_note: null, updated_by: ctx.user.id, updated_at: new Date(), ...(next === 'published' && !e.published_at ? { published_at: new Date() } : {}) });
            if (next === 'published') {
                for (const s of await EventShow.select('id').where('event_id', e.id).where('status', 'scheduled').whereNull('seat_map_generated_at').get()) { await SeatMapService.materialize(s.id, {}); materialised++; }
            }
        });
        await AuditService.record(ctx, next === 'published' ? 'EVENT_PUBLISHED' : 'EVENT_SUBMITTED', { type: 'event', id: e.id, label: e.title }, { before: { status: e.status }, after: { status: next }, meta: { showsMaterialised: materialised }, merchantId: e.merchant_id });
        BootstrapService.invalidate();
        return MerchantEventService.get(ctx, e.uuid);
    },

    async setStatus(ctx, eventUuid, status) {
        const e = await ownEvent(ctx, eventUuid);
        if (!['paused', 'published', 'draft', 'cancelled'].includes(status)) bad('Invalid status');
        if (status === 'published') return MerchantEventService.publish(ctx, eventUuid); // resume = publish checks again
        const allowed = { paused: ['published'], draft: ['paused', 'pending_review', 'rejected'], cancelled: ['draft', 'paused', 'pending_review', 'rejected', 'published'] };
        if (!allowed[status].includes(e.status)) bad(`A ${e.status.replace('_', ' ')} event cannot be set to ${status}`);
        if (['draft', 'cancelled'].includes(status) && await Order.where('event_id', e.id).whereIn('status', PAID).exists()) {
            bad('This event has paid bookings — pause it, or contact Ticketo support to cancel and refund buyers', 'has_orders');
        }
        await Event.where('id', e.id).update({ status, updated_by: ctx.user.id, updated_at: new Date() });
        await AuditService.record(ctx, `EVENT_${status.toUpperCase()}`, { type: 'event', id: e.id, label: e.title }, { before: { status: e.status }, after: { status }, merchantId: e.merchant_id });
        BootstrapService.invalidate();
        return MerchantEventService.get(ctx, e.uuid);
    },

    async remove(ctx, eventUuid) {
        const e = await ownEvent(ctx, eventUuid);
        if (!['draft', 'rejected', 'cancelled'].includes(e.status)) bad('Only draft, rejected or cancelled events can be deleted — pause live events instead');
        if (await Order.where('event_id', e.id).exists()) conflict('This event has bookings and is kept for your records', 'has_orders');
        await Event.where('id', e.id).update({ deleted_at: new Date(), status: 'cancelled', updated_by: ctx.user.id, updated_at: new Date() });
        await AuditService.record(ctx, 'EVENT_DELETED', { type: 'event', id: e.id, label: e.title }, { merchantId: e.merchant_id });
        BootstrapService.invalidate();
        return { ok: true };
    },
};

module.exports = MerchantEventService;
