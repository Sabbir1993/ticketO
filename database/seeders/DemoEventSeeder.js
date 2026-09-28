const Seeder = use('laranode/Database/Seeder');
const Db = use('App/Support/Db');
const DB = use('laranode/Support/Facades/DB');
const Merchant = use('App/Models/Merchant');
const Venue = use('App/Models/Venue');
const Category = use('App/Models/Category');
const ViewType = use('App/Models/ViewType');
const Lookup = use('App/Models/Lookup');
const Event = use('App/Models/Event');
const EventTier = use('App/Models/EventTier');
const EventShow = use('App/Models/EventShow');
const ShowSeat = use('App/Models/ShowSeat');
const ShowZone = use('App/Models/ShowZone');
const { uuid, slugify } = use('App/Support/Ids');
const SeatMapService = use('App/Services/SeatMapService');
const buildEvents = require('./data/events');

// Demo events + shows + materialised seat maps (non-production only; runs after DemoSeeder).
// Idempotent: events whose slug already exists are skipped. Demo occupancy marks some seats
// sold (blocked_reason 'demo_fill', no order) so maps don't look empty — real sales use orders.
const DAY = 86400000;
const at = (days, hh, mm = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setTime(d.getTime() + days * DAY); d.setHours(hh, mm, 0, 0); return d; };

// Deterministic 0–1 hash (same as the prototype) so demo occupancy is stable across runs.
function hash01(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
}

class DemoEventSeeder extends Seeder {
    async run() {
        const now = new Date();
        const idMap = async (query, key) => Object.fromEntries((await query.select('id', key).get()).map((r) => [r[key], r.id]));
        const merchants = await idMap(Merchant.withTrashed(), 'name');
        const venues = await idMap(Venue.withTrashed(), 'name');
        const cats = await idMap(Category.withTrashed(), 'slug');
        const views = await idMap(ViewType.query(), 'slug');
        const templates = Object.fromEntries((await DB.table('layout_templates as t').join('layout_versions as v', 'v.id', '=', 't.current_version_id')
            .select('t.slug', 't.id', 't.view_type_id', 'v.id as version_id', 'v.spec').get())
            .map((t) => [t.slug, { ...t, spec: Db.json(t.spec) }]));

        // Labels → lookup codes; unknown labels become new CMS-editable lookups.
        const lookupRows = (await Lookup.withTrashed().select('lookup_group', 'code', 'label').get()).map((l) => ({ lookup_group: l.lookup_group, code: l.code, label: l.label }));
        const lookup = async (group, label) => {
            if (!label) return null;
            const hit = lookupRows.find((l) => l.lookup_group === group && l.label.toLowerCase() === String(label).toLowerCase());
            if (hit) return hit.code;
            const code = slugify(label) || 'other';
            if (!lookupRows.some((l) => l.lookup_group === group && l.code === code)) {
                await DB.table('lookups').insertOrIgnore({ lookup_group: group, code, label, sort_order: 100, is_active: 1, created_at: now, updated_at: now });
                lookupRows.push({ lookup_group: group, code, label });
            }
            return code;
        };

        let created = 0; let showCount = 0; let seatCount = 0;
        for (const ev of buildEvents(at)) {
            if (await Event.withTrashed().where('slug', ev.slug).exists()) continue;
            const tpl = templates[ev.template];
            const merchantId = merchants[ev.merchant];
            const venueIds = ev.venues.map((v) => venues[v]);
            if (!tpl || !merchantId || venueIds.some((v) => !v)) { console.warn(`  skip ${ev.slug}: missing template/merchant/venue`); continue; }
            const viewTypeId = cats[ev.sub || ev.category] && (await Category.withTrashed().select('view_type_id').where('id', cats[ev.sub || ev.category]).first()).view_type_id;

            const showsCreated = await Db.transaction(async () => {
                const { id: eventId } = await Event.create({
                    uuid: uuid(), merchant_id: merchantId, slug: ev.slug, title: ev.title,
                    category_id: cats[ev.category], subcategory_id: ev.sub ? cats[ev.sub] : null,
                    view_type_id: viewTypeId || tpl.view_type_id || views['ga-list'], template_id: tpl.id,
                    language_code: await lookup('languages', ev.language), certificate_code: await lookup('certificates', ev.certificate),
                    duration: ev.duration, description: ev.description, palette: ev.palette, booking_limit: ev.bookingLimit,
                    release_date: ev.release || null, status: 'published', published_at: new Date(now.getTime() - 25 * DAY),
                    is_refundable: ev.policy.refundable ? 1 : 0, is_cancellable: ev.policy.cancellable ? 1 : 0, is_transferable: ev.policy.transferable ? 1 : 0,
                    refund_window_hrs: ev.policy.refundWindowHrs, cancellation_fee_pct: ev.policy.cancellationFeePct,
                    rating_avg: ev.rating, votes_count: ev.votes, interested_count: 0,
                    schedule_type: ev.recurring ? 'recurring' : 'fixed', schedule: ev.recurring ? { ...ev.recurring, formats: ev.formats } : null,
                });

                await DB.table('event_venues').insert(venueIds.map((v, i) => ({ event_id: eventId, venue_id: v, sort_order: i })));
                const tax = [
                    ...await Promise.all((ev.genres || []).map(async (g) => ['genre', await lookup('genres', g)])),
                    ...await Promise.all((ev.formats || []).map(async (f) => ['format', await lookup('formats', f)])),
                    ...(ev.tags || []).map((t) => ['tag', t]),
                ];
                if (tax.length) await DB.table('event_taxonomies').insertOrIgnore(tax.map(([taxonomy, code]) => ({ event_id: eventId, taxonomy, code })));
                const people = [
                    ...(ev.cast || []).map(([name, role], i) => ({ event_id: eventId, kind: 'cast', name, role, sort_order: i })),
                    ...(ev.sponsors || []).map((name, i) => ({ event_id: eventId, kind: 'sponsor', name, role: null, sort_order: i })),
                ];
                if (people.length) await DB.table('event_people').insert(people);

                // Tiers: name/colour from the layout spec, price set per event.
                for (const [i, t] of tpl.spec.tiers.entries()) {
                    if (ev.prices[t.id] === undefined) continue;
                    const eb = ev.earlyBird[t.id];
                    await EventTier.create({
                        event_id: eventId, tier_key: t.id, name: t.name, color: t.color, price: ev.prices[t.id], per_order_limit: t.limit || null,
                        early_bird_price: eb ? eb[0] : null, early_bird_until: eb ? at(eb[1], 23, 59) : null, sort_order: i,
                    });
                }
                for (const [key, o] of Object.entries(ev.overrides)) {
                    await DB.table('event_block_overrides').insert({ event_id: eventId, block_key: key, is_enabled: o.enabled === false ? 0 : 1, capacity: o.capacity || null });
                }
                await SeatMapService.snapshot(eventId, { versionId: tpl.version_id });

                // Shows: fixed list, or a recurring schedule materialised for the next N days.
                const shows = [];
                if (ev.recurring) {
                    const start = ev.release && ev.release > at(0, 0) ? Math.ceil((ev.release - at(0, 0)) / DAY) : 0;
                    for (let d = start; d < start + ev.recurring.days; d++) {
                        venueIds.forEach((vid, vi) => ev.recurring.times.forEach((t, ti) => {
                            const [hh, mm] = t.split(':').map(Number);
                            const when = at(d, hh, mm);
                            if (when > now) shows.push({ venue: vid, when, label: t, format: ev.formats?.[(ti + vi) % ev.formats.length], source: 'recurring' });
                        }));
                    }
                } else {
                    for (const [when, label] of ev.shows) shows.push({ venue: venueIds[0], when, label, format: null, source: 'manual' });
                }
                const out = [];
                for (const s of shows) {
                    const { id } = await EventShow.create({
                        uuid: uuid(), event_id: eventId, venue_id: s.venue, starts_at: s.when, label: s.label,
                        format_code: s.format ? await lookup('formats', s.format) : null, status: 'scheduled', source: s.source,
                    });
                    const r = await SeatMapService.materialize(id, {});
                    seatCount += r.seats || 0;
                    out.push(id);
                }
                return out;
            });

            if (ev.fill) for (const showId of showsCreated) await this.demoFill(showId, ev.fill);
            created += 1; showCount += showsCreated.length;
        }
        console.log(`  demo events: ${created} created, ${showCount} shows, ${seatCount} seats materialised`);
    }

    // Stable pseudo-random occupancy per show and block (prototype demoFill).
    async demoFill(showId, fill) {
        const seats = await DB.table('show_seats').select('id', 'block_key', 'seat_code').where('show_id', showId).where('status', 'available').get();
        const blockF = {};
        const sold = seats.filter((s) => hash01(`${showId}:${s.block_key}:${s.seat_code}`) < (blockF[s.block_key] ??= fill * (0.6 + hash01(`${showId}${s.block_key}`) * 0.7))).map((s) => s.id);
        for (let i = 0; i < sold.length; i += 1000) {
            const part = sold.slice(i, i + 1000);
            await ShowSeat.query().whereIn('id', part).update({ status: 'sold', blocked_reason: 'demo_fill' });
        }
        for (const z of await ShowZone.select('id', 'block_key', 'capacity').where('show_id', showId).get()) {
            const n = Math.floor(z.capacity * Math.min(0.97, fill * (0.7 + hash01(`${showId}${z.block_key}`) * 0.6)));
            await ShowZone.where('id', z.id).update({ sold: n });
        }
    }
}

module.exports = DemoEventSeeder;
