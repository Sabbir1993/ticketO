// Public event catalogue: listing (GET /api/events) and detail (GET /api/events/:slug).
// Output keeps the prototype's eventSummary / eventDetail shapes so the UI flow is unchanged;
// public ids are UUIDs (events, shows) or slugs (venues, categories, templates) — never row ids.
// Multi-table reads use DB.table() with aliases (soft-delete filters must be table-qualified in joins);
// inventory is aggregated with grouped queries instead of correlated subqueries.
const Db = use('App/Support/Db');
const DB = use('laranode/Support/Facades/DB');
const EventLayout = use('App/Models/EventLayout');
const EventBlockOverride = use('App/Models/EventBlockOverride');
const EventTier = use('App/Models/EventTier');
const VenueFacility = use('App/Models/VenueFacility');
const Promo = use('App/Models/Promo');
const BootstrapService = use('App/Services/BootstrapService');
const { missing } = use('App/Support/HttpError');

const PAST_GRACE_MS = 6 * 3600000; // a show stays listed for 6 h after it starts (prototype rule)
const iso = (d) => (d ? new Date(d).toISOString() : null);
const money = (v) => (v === null || v === undefined ? null : Number(v));
const groupBy = (rows, key) => { const m = new Map(); for (const r of rows) { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); } return m; };

const EVENT_COLUMNS = [
    'e.id', 'e.uuid', 'e.slug', 'e.title', 'e.status', 'e.duration', 'e.palette', 'e.release_date', 'e.rating_avg', 'e.votes_count', 'e.interested_count',
    'e.language_code', 'e.certificate_code', 'e.booking_limit', 'e.sale_start', 'e.sale_end', 'e.description',
    'e.is_refundable', 'e.is_cancellable', 'e.is_transferable', 'e.refund_window_hrs', 'e.cancellation_fee_pct',
    'c.slug as category', 'sc.slug as sub_category', 'vt.slug as view_type', 't.slug as template_slug', 't.name as template_name',
    'm.uuid as merchant_uuid', 'm.name as merchant_name',
];

/** Events joined with category, view type, template and merchant (the summary's columns). */
function eventQuery(...extraColumns) {
    return DB.table('events as e')
        .join('categories as c', 'c.id', '=', 'e.category_id')
        .leftJoin('categories as sc', 'sc.id', '=', 'e.subcategory_id')
        .join('view_types as vt', 'vt.id', '=', 'e.view_type_id')
        .leftJoin('layout_templates as t', 't.id', '=', 'e.template_id')
        .join('merchants as m', 'm.id', '=', 'e.merchant_id')
        .select(...EVENT_COLUMNS, ...extraColumns);
}

async function labels() {
    const { lookups } = await BootstrapService.get();
    const map = {};
    for (const [group, items] of Object.entries(lookups)) map[group] = Object.fromEntries(items.map((i) => [i.code, i.label]));
    return (group, code) => (code ? map[group]?.[code] || code : null);
}

function tierInfo(t, now) {
    const eb = t.early_bird_price !== null && t.early_bird_until && new Date(t.early_bird_until) > now;
    return {
        id: t.tier_key, name: t.name, color: t.color, limit: t.per_order_limit || null,
        price: money(eb ? t.early_bird_price : t.price), original: money(t.price), earlyBirdActive: !!eb,
    };
}

/** GA places held by live holds, per show_zones.id. */
async function liveZoneHolds(zoneIds, now) {
    if (!zoneIds.length) return new Map();
    const rows = await DB.table('seat_hold_items as hi').join('seat_holds as h', 'h.id', '=', 'hi.hold_id')
        .select('hi.show_zone_id').selectRaw('SUM(hi.qty) as n')
        .whereIn('hi.show_zone_id', zoneIds).where('h.status', 'active').where('h.expires_at', '>', now)
        .groupBy('hi.show_zone_id').get();
    return new Map(rows.map((r) => [r.show_zone_id, Number(r.n)]));
}

/** Remaining places per show: free seats (incl. expired holds) + free GA places (minus live GA holds). */
async function freeByShow(showIds, now) {
    const free = new Map(showIds.map((id) => [id, 0]));
    if (!showIds.length) return free;
    const [seatRows, zones] = await Promise.all([
        DB.table('show_seats').select('show_id').selectRaw('COUNT(*) as n').whereIn('show_id', showIds)
            .whereRaw("(status = 'available' OR (status = 'held' AND hold_expires_at < ?))", [now]).groupBy('show_id').get(),
        DB.table('show_zones').select('id', 'show_id', 'capacity', 'sold', 'blocked').whereIn('show_id', showIds).get(),
    ]);
    for (const r of seatRows) free.set(r.show_id, free.get(r.show_id) + Number(r.n));
    const held = await liveZoneHolds(zones.map((z) => z.id), now);
    for (const z of zones) free.set(z.show_id, free.get(z.show_id) + Math.max(0, z.capacity - z.sold - z.blocked - (held.get(z.id) || 0)));
    return free;
}

/** Load everything the summary needs for a set of events, in a fixed number of queries. */
async function related(events, { detail = false } = {}) {
    const ids = events.map((e) => e.id);
    if (!ids.length) return null;
    const now = new Date();
    const [venues, tax, tiers, shows, people, facilities] = await Promise.all([
        DB.table('event_venues as ev').join('venues as v', 'v.id', '=', 'ev.venue_id').join('cities as ci', 'ci.id', '=', 'v.city_id')
            .select('ev.event_id', 'v.id', 'v.slug', 'v.name', 'v.address', 'v.type', 'ci.slug as city')
            .whereIn('ev.event_id', ids).orderBy('ev.event_id').orderBy('ev.sort_order').get(),
        DB.table('event_taxonomies').select('event_id', 'taxonomy', 'code').whereIn('event_id', ids).orderBy('event_id').orderBy('taxonomy').orderBy('code').get(),
        DB.table('event_tiers').select('event_id', 'tier_key', 'name', 'color', 'price', 'per_order_limit', 'early_bird_price', 'early_bird_until')
            .whereIn('event_id', ids).orderBy('event_id').orderBy('sort_order').orderBy('id').get(),
        DB.table('event_shows as s').join('venues as v', 'v.id', '=', 's.venue_id')
            .select('s.id', 's.uuid', 's.event_id', 's.starts_at', 's.label', 's.format_code', 's.seat_map_generated_at', 'v.slug as venue')
            .whereIn('s.event_id', ids).where('s.status', 'scheduled').where('s.starts_at', '>', new Date(now.getTime() - PAST_GRACE_MS))
            .orderBy('s.starts_at').orderBy('s.id').get(),
        detail ? DB.table('event_people').select('event_id', 'kind', 'name', 'role').whereIn('event_id', ids)
            .orderBy('event_id').orderBy('kind').orderBy('sort_order').orderBy('id').get() : [],
        detail ? DB.table('venue_facilities as vf').join('event_venues as ev', 'ev.venue_id', '=', 'vf.venue_id')
            .select('vf.venue_id', 'vf.code').whereIn('ev.event_id', ids).orderBy('vf.id').get() : [],
    ]);
    const free = await freeByShow(shows.filter((s) => s.seat_map_generated_at).map((s) => s.id), now);
    return {
        now, free,
        venues: groupBy(venues, 'event_id'), tax: groupBy(tax, 'event_id'), tiers: groupBy(tiers, 'event_id'),
        shows: groupBy(shows, 'event_id'), people: groupBy(people, 'event_id'), facilities: groupBy(facilities, 'venue_id'),
    };
}

function summary(e, R, label) {
    const venues = R.venues.get(e.id) || [];
    const tax = R.tax.get(e.id) || [];
    const shows = R.shows.get(e.id) || [];
    const tiers = (R.tiers.get(e.id) || []).map((t) => tierInfo(t, R.now));
    const prices = tiers.map((t) => t.price).filter((p) => p !== null);
    const codes = (kind) => tax.filter((x) => x.taxonomy === kind).map((x) => x.code);
    const v = venues[0];
    return {
        id: e.uuid, slug: e.slug, title: e.title, category: e.category, subCategory: e.sub_category || null,
        viewType: e.view_type, templateId: e.template_slug || null,
        genres: codes('genre').map((c) => label('genres', c)), language: label('languages', e.language_code), certificate: label('certificates', e.certificate_code),
        duration: e.duration, format: codes('format').map((c) => label('formats', c)),
        score: Math.round(Number(e.rating_avg) * 10), votes: e.votes_count,
        palette: Db.json(e.palette) || ['#1E3A8A', '#2D499A'], tags: codes('tag'),
        releaseDate: iso(e.release_date), comingSoon: !!(e.release_date && new Date(e.release_date) > R.now), status: e.status,
        venue: v ? { id: v.slug, name: v.name, city: v.city, address: v.address } : null,
        cities: [...new Set(venues.map((x) => x.city))],
        nextShow: iso(shows[0]?.starts_at), showsCount: shows.length, priceFrom: prices.length ? Math.min(...prices) : 0,
        merchant: { id: e.merchant_uuid, name: e.merchant_name },
        soldOut: shows.length > 0 && shows.every((s) => R.free.has(s.id) && R.free.get(s.id) === 0),
    };
}

/** Event ids playing in a city (online events show everywhere). */
async function eventIdsInCity(city) {
    return DB.table('event_venues as ev').join('venues as v', 'v.id', '=', 'ev.venue_id').join('cities as ci', 'ci.id', '=', 'v.city_id')
        .whereRaw('(ci.slug = ? OR ci.is_online = 1)', [String(city)]).select('ev.event_id as id').get().then((r) => r.map((x) => x.id));
}

/** Event ids whose people (cast/sponsors) or genre labels match the search. */
async function eventIdsMatching(like) {
    const [people, genres] = await Promise.all([
        DB.table('event_people').where('name', 'LIKE', like).pluck('event_id'),
        DB.table('event_taxonomies as x').join('lookups as l', 'l.code', '=', 'x.code')
            .where('l.lookup_group', 'genres').where('x.taxonomy', 'genre').where('l.label', 'LIKE', like).select('x.event_id as id').get().then((r) => r.map((x) => x.id)),
    ]);
    return [...new Set([...people, ...genres])];
}

const CatalogService = {
    async list({ city, category, q, merchant } = {}) {
        const query = eventQuery().whereNull('e.deleted_at').where('e.status', 'published').where('m.status', 'active');
        if (category) query.whereRaw('(c.slug = ? OR sc.slug = ?)', [String(category), String(category)]);
        if (merchant) query.where('m.uuid', String(merchant));
        if (city) {
            const ids = await eventIdsInCity(city);
            if (!ids.length) return [];
            query.whereIn('e.id', ids);
        }
        if (q && String(q).trim()) {
            const like = Db.like(String(q).trim().slice(0, 80));
            const ids = await eventIdsMatching(like);
            const inIds = ids.length ? ` OR e.id IN (${ids.map(() => '?').join(', ')})` : '';
            query.whereRaw(`(e.title LIKE ? OR c.name LIKE ? OR sc.name LIKE ?${inIds})`, [like, like, like, ...ids]);
        }
        const events = await query.orderBy('e.published_at', 'desc').orderBy('e.id', 'desc').limit(500).get();
        const R = await related(events);
        if (!R) return [];
        const label = await labels();
        return events.map((e) => summary(e, R, label));
    },

    /**
     * GET /api/shows/:showId/availability — layout spec + per-block price/stock + taken seat codes.
     * Taken = sold, blocked (house holds, staff blocks) or held by a live hold; expired holds count as free.
     */
    async availability(showUuid) {
        const now = new Date();
        const show = await DB.table('event_shows as s').join('venues as v', 'v.id', '=', 's.venue_id').join('cities as ci', 'ci.id', '=', 'v.city_id')
            .select('s.id', 's.uuid', 's.event_id', 's.starts_at', 's.label', 's.format_code', 's.seat_map_generated_at',
                'v.id as venue_row', 'v.slug as venue_slug', 'v.name as venue_name', 'v.address as venue_address', 'v.type as venue_type', 'ci.slug as venue_city')
            .where('s.uuid', String(showUuid)).where('s.status', 'scheduled').where('s.starts_at', '>', new Date(now.getTime() - PAST_GRACE_MS))
            .first();
        if (!show) missing('Show not found or already over');
        const e = await eventQuery().where('e.id', show.event_id).whereNull('e.deleted_at').whereIn('e.status', ['published', 'paused']).first();
        if (!e) missing('Show not found or already over');

        const Settings = use('App/Services/SettingsService');
        const [R, label, layout, overrides, tierRows, seatRows, zoneRows, facilities, maxPerOrder, holdMinutes] = await Promise.all([
            related([e]),
            labels(),
            EventLayout.select('spec', 'is_custom').where('event_id', e.id).first(),
            EventBlockOverride.select('block_key', 'is_enabled', 'capacity').where('event_id', e.id).get(),
            EventTier.select('tier_key', 'name', 'color', 'price', 'per_order_limit', 'early_bird_price', 'early_bird_until')
                .where('event_id', e.id).orderBy('sort_order').orderBy('id').get(),
            // Plain rows: a stadium show has tens of thousands of seats.
            DB.table('show_seats').select('block_key', 'seat_code')
                .selectRaw("(status IN ('sold','blocked') OR (status = 'held' AND hold_expires_at > ?)) as taken", [now])
                .where('show_id', show.id).get(),
            DB.table('show_zones').select('id', 'block_key', 'capacity', 'sold', 'blocked').where('show_id', show.id).get(),
            VenueFacility.select('code').where('venue_id', show.venue_row).orderBy('id').get(),
            Settings.get('platform', 'max_tickets_per_order', 10),
            Settings.get('platform', 'hold_minutes', 8),
        ]);
        if (!layout) missing('This show has no seat map yet');
        const spec = Db.json(layout.spec);
        const tiers = Object.fromEntries(tierRows.map((t) => [t.tier_key, tierInfo(t, now)]));
        const ov = Object.fromEntries(overrides.map((o) => [o.block_key, o]));

        // Inventory from the materialised rows (the source of truth), grouped per block.
        const seatCap = {}; const soldSeats = {};
        for (const s of seatRows) {
            seatCap[s.block_key] = (seatCap[s.block_key] || 0) + 1;
            if (Number(s.taken)) (soldSeats[s.block_key] ||= []).push(s.seat_code);
        }
        const held = await liveZoneHolds(zoneRows.map((z) => z.id), now);
        const zones = Object.fromEntries(zoneRows.map((z) => [z.block_key, { capacity: Number(z.capacity), taken: Number(z.sold) + Number(z.blocked) + (held.get(z.id) || 0) }]));

        const blocks = (spec.blocks || []).map((b) => {
            const tier = tiers[b.tier];
            const o = ov[b.id];
            const enabled = b.sell !== 'none' && !(o && !o.is_enabled) && !!tier && !!show.seat_map_generated_at;
            let capacity = 0; let sold = 0;
            if (b.sell === 'seated') { capacity = seatCap[b.id] || 0; sold = soldSeats[b.id]?.length || 0; }
            else if (b.sell === 'ga') { capacity = zones[b.id]?.capacity ?? (Number(o?.capacity) || Number(b.capacity) || 0); sold = Math.min(capacity, zones[b.id]?.taken || 0); }
            return {
                ...b, ...(b.sell === 'ga' ? { capacity } : {}), enabled,
                price: tier?.price ?? null, original: tier?.original ?? null, tierName: tier?.name || b.tier, color: tier?.color || '#94a3b8',
                earlyBird: !!tier?.earlyBirdActive, capacity, sold, available: enabled ? Math.max(0, capacity - sold) : 0,
            };
        });

        return {
            event: summary(e, R, label),
            show: { id: show.uuid, eventId: e.uuid, venueId: show.venue_slug, date: iso(show.starts_at), label: show.label, format: label('formats', show.format_code) },
            venue: {
                id: show.venue_slug, name: show.venue_name, city: show.venue_city, address: show.venue_address, type: show.venue_type,
                facilities: facilities.map((f) => label('facilities', f.code)),
            },
            template: { id: e.template_slug, name: layout.is_custom ? 'Custom layout' : e.template_name, viewType: e.view_type, spec },
            tiers: tierRows.map((t) => tierInfo(t, now)),
            bookingLimit: Math.min(e.booking_limit || 10, Number(maxPerOrder) || 10),
            holdMinutes: Number(holdMinutes) || 8,
            blocks,
            soldSeats,
        };
    },

    async detail(slug) {
        const e = await eventQuery('e.template_id').whereRaw('(e.slug = ? OR e.uuid = ?)', [String(slug), String(slug)])
            .whereNull('e.deleted_at').whereIn('e.status', ['published', 'paused']).first();
        if (!e) missing('Event not found');
        const [R, label, layout, promos] = await Promise.all([
            related([e], { detail: true }),
            labels(),
            EventLayout.select('is_custom').where('event_id', e.id).first(),
            Promo.select('code', 'type', 'value', 'description').where('event_id', e.id).where('is_active', 1)
                .whereRaw('(ends_at IS NULL OR ends_at > ?)', [new Date()]).get(),
        ]);
        const people = R.people.get(e.id) || [];
        const custom = !!layout?.is_custom;
        return {
            ...summary(e, R, label),
            description: e.description,
            cast: people.filter((p) => p.kind === 'cast').map((p) => ({ name: p.name, role: p.role })),
            sponsors: people.filter((p) => p.kind === 'sponsor').map((p) => p.name),
            policy: {
                refundable: !!e.is_refundable, cancellable: !!e.is_cancellable, transferable: !!e.is_transferable,
                refundWindowHrs: e.refund_window_hrs, cancellationFeePct: Number(e.cancellation_fee_pct),
            },
            bookingLimit: e.booking_limit,
            tiers: (R.tiers.get(e.id) || []).map((t) => tierInfo(t, R.now)),
            shows: (R.shows.get(e.id) || []).map((s) => ({ id: s.uuid, eventId: e.uuid, venueId: s.venue, date: iso(s.starts_at), label: s.label, format: label('formats', s.format_code) })),
            venues: (R.venues.get(e.id) || []).map((v) => ({
                id: v.slug, name: v.name, city: v.city, address: v.address, type: v.type,
                facilities: (R.facilities.get(v.id) || []).map((f) => label('facilities', f.code)),
            })),
            template: e.template_slug ? { id: e.template_slug, name: custom ? `${e.template_name} (custom)` : e.template_name, viewType: e.view_type } : null,
            customLayout: custom,
            saleStart: iso(e.sale_start), saleEnd: iso(e.sale_end),
            interested: e.interested_count,
            promos: promos.map((p) => ({ code: p.code, type: p.type, value: money(p.value), desc: p.description })),
        };
    },
};

// Shared with the CMS event list and order views (same summary shape, any status).
CatalogService._internals = { related, summary, labels, tierInfo, eventQuery, liveZoneHolds, iso };

module.exports = CatalogService;
