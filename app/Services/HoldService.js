// Seat holds: the concurrency-critical step between the seat map and checkout.
//
// Seats  — one conditional UPDATE per hold: rows flip to 'held' only if still free
//          (available, or held by an expired hold). Fewer rows than requested → roll back, 409 seat_taken.
//          Correct across any number of app instances; no application locks.
// GA     — the transaction's FIRST statement is an update() on the show_zones rows: it takes their row
//          locks (held to commit) before any read, so InnoDB's snapshot is created only after the lock and
//          the live-hold count sees every competing hold committed before us. Same effect as FOR UPDATE.
// Owner  — a hold belongs to the signed-in user or to this browser (HttpOnly holder cookie; only its
//          hash is stored). Hold ids are UUIDs, and every read/write checks ownership.
const Db = use('App/Support/Db');
const DB = use('laranode/Support/Facades/DB');
const SeatHold = use('App/Models/SeatHold');
const SeatHoldItem = use('App/Models/SeatHoldItem');
const ShowSeat = use('App/Models/ShowSeat');
const ShowZone = use('App/Models/ShowZone');
const Order = use('App/Models/Order');
const Promo = use('App/Models/Promo');
const EventLayout = use('App/Models/EventLayout');
const EventBlockOverride = use('App/Models/EventBlockOverride');
const EventTier = use('App/Models/EventTier');
const Hasher = use('App/Security/Hasher');
const IpResolver = use('App/Security/IpResolver');
const SettingsService = use('App/Services/SettingsService');
const PricingService = use('App/Services/PricingService');
const CatalogService = use('App/Services/CatalogService');
const { uuid } = use('App/Support/Ids');
const { HttpError, bad, missing, conflict } = use('App/Support/HttpError');

const HOLDER_COOKIE = 'ticketo_holder';
const PAST_GRACE_MS = 6 * 3600000;
const holderHash = (req) => { const t = req.cookies?.[HOLDER_COOKIE]; return t && t.length <= 64 ? Hasher.hash(t, 'holder') : null; };

/** Ensure this browser has a holder token; returns its hash. */
function ensureHolder(req, res) {
    let t = req.cookies?.[HOLDER_COOKIE];
    if (!t || t.length > 64) {
        t = Hasher.token(24);
        res.cookie(HOLDER_COOKIE, t, { httpOnly: true, secure: env('APP_ENV') === 'production', sameSite: 'lax', path: '/', maxAge: 7 * 86400000 });
        req.cookies = { ...(req.cookies || {}), [HOLDER_COOKIE]: t };
    }
    return Hasher.hash(t, 'holder');
}

async function loadEventForShow(showUuid) {
    const s = await DB.table('event_shows as s').join('events as e', 'e.id', '=', 's.event_id').join('merchants as m', 'm.id', '=', 'e.merchant_id')
        .select('s.id', 's.uuid', 's.starts_at', 's.status', 's.venue_id', 's.seat_map_generated_at',
            'e.id as event_id', 'e.uuid as event_uuid', 'e.status as event_status', 'e.merchant_id', 'e.category_id', 'e.subcategory_id',
            'e.booking_limit', 'e.sale_start', 'e.sale_end', 'm.status as merchant_status')
        .where('s.uuid', String(showUuid)).whereNull('e.deleted_at').first();
    if (!s || s.status !== 'scheduled' || new Date(s.starts_at).getTime() < Date.now() - PAST_GRACE_MS) missing('Show not found or already over');
    return s;
}

async function holdRow(holdUuid) {
    const h = await DB.table('seat_holds as h').join('event_shows as s', 's.id', '=', 'h.show_id').join('venues as v', 'v.id', '=', 's.venue_id')
        .join('events as e', 'e.id', '=', 'h.event_id')
        .select('h.*', 's.uuid as show_uuid', 's.starts_at', 'v.slug as venue_slug', 'e.uuid as event_uuid', 'e.slug as event_slug',
            'e.merchant_id', 'e.category_id', 'e.subcategory_id')
        .where('h.uuid', String(holdUuid)).first();
    if (!h) return null;
    const order = await Order.select('booking_ref').where('hold_id', h.id).orderBy('id', 'desc').first();
    return { ...h, order_ref: order?.booking_ref || null };
}

function assertOwner(h, ctx, req) {
    const mine = (h.user_id && ctx.user && h.user_id === ctx.user.id) || (h.owner_hash && h.owner_hash === holderHash(req));
    if (!mine) missing('Your seat hold has expired'); // same answer as a missing hold: no id probing
}

const HoldService = {
    HOLDER_COOKIE,

    /** channel 'pos' (box office): no online sale window / start-time cut-off; merchantId must own the event. */
    async create(ctx, req, res, { showId, seats = [], zones = [] } = {}, { channel = 'web', merchantId = null } = {}) {
        if (!Array.isArray(seats) || !Array.isArray(zones)) bad('Invalid selection');
        const s = await loadEventForShow(showId);
        const now = new Date();
        if (channel === 'pos' && s.merchant_id !== merchantId) missing('Show not found or already over');
        if (s.event_status !== 'published' || s.merchant_status !== 'active') bad('This event is not on sale');
        if (channel !== 'pos') {
            if (s.sale_start && new Date(s.sale_start) > now) bad('Ticket sales have not started yet');
            if (s.sale_end && new Date(s.sale_end) < now) bad('Online ticket sales have closed');
            if (new Date(s.starts_at) < now) bad('This show has already started');
        }
        if (!s.seat_map_generated_at) bad('Tickets for this show are not on sale yet');

        // Normalise + de-duplicate the request.
        const seatReq = [...new Map(seats.map((x) => [`${String(x?.blockId).slice(0, 40)}:${String(x?.seat).slice(0, 20)}`, { blockId: String(x?.blockId || '').slice(0, 40), seat: String(x?.seat || '').slice(0, 20) }])).values()].filter((x) => x.blockId && x.seat);
        const zoneReq = new Map();
        for (const z of zones) { const q = Math.floor(Number(z?.qty) || 0); if (q > 0) zoneReq.set(String(z.blockId || '').slice(0, 40), (zoneReq.get(String(z.blockId || '').slice(0, 40)) || 0) + q); }
        const qty = seatReq.length + [...zoneReq.values()].reduce((a, q) => a + q, 0);
        if (!qty) bad('Select at least one ticket');
        const [maxPerOrder, holdMinutes] = await Promise.all([SettingsService.get('platform', 'max_tickets_per_order', 10), SettingsService.get('platform', 'hold_minutes', 8)]);
        const limit = Math.min(s.booking_limit || 10, Number(maxPerOrder) || 10);
        if (qty > limit) bad(`Maximum ${limit} tickets per order`);

        // Layout + prices (static for this request).
        const [layout, overrides, tierRows] = await Promise.all([
            EventLayout.select('spec').where('event_id', s.event_id).first(),
            EventBlockOverride.select('block_key', 'is_enabled').where('event_id', s.event_id).get(),
            DB.table('event_tiers').select('tier_key', 'name', 'price', 'per_order_limit', 'early_bird_price', 'early_bird_until').where('event_id', s.event_id).get(),
        ]);
        const spec = Db.json(layout?.spec) || { blocks: [] };
        const blocks = Object.fromEntries(spec.blocks.map((b) => [b.id, b]));
        const disabled = new Set(overrides.filter((o) => !o.is_enabled).map((o) => o.block_key));
        const tiers = Object.fromEntries(tierRows.map((t) => [t.tier_key, { ...t, price: Number(t.early_bird_price !== null && t.early_bird_until && new Date(t.early_bird_until) > now ? t.early_bird_price : t.price) }]));
        const block = (id, sell) => { const b = blocks[id]; if (!b || b.sell !== sell || disabled.has(id) || !tiers[b.tier]) bad(`${sell === 'ga' ? 'Zone' : 'Block'} ${id} is not available`); return b; };

        const perTier = {};
        for (const x of seatReq) { const b = block(x.blockId, 'seated'); perTier[b.tier] = (perTier[b.tier] || 0) + 1; }
        for (const [id, q] of zoneReq) { const b = block(id, 'ga'); perTier[b.tier] = (perTier[b.tier] || 0) + q; }
        for (const [t, n] of Object.entries(perTier)) if (tiers[t].per_order_limit && n > tiers[t].per_order_limit) bad(`Max ${tiers[t].per_order_limit} × ${tiers[t].name} per order`);

        // Resolve seat rows (outside the transaction: seat identity never changes).
        let seatRows = [];
        if (seatReq.length) {
            // Candidates by block + code, then exact (block, seat) pairs.
            const wanted = new Set(seatReq.map((x) => `${x.blockId}:${x.seat}`));
            seatRows = (await DB.table('show_seats').select('id', 'block_key', 'seat_code', 'tier_key', 'price_override').where('show_id', s.id)
                .whereIn('block_key', [...new Set(seatReq.map((x) => x.blockId))]).whereIn('seat_code', [...new Set(seatReq.map((x) => x.seat))]).get())
                .filter((r) => wanted.has(`${r.block_key}:${r.seat_code}`));
            const found = new Set(seatRows.map((r) => `${r.block_key}:${r.seat_code}`));
            const miss = seatReq.find((x) => !found.has(`${x.blockId}:${x.seat}`));
            if (miss) bad(`Seat ${miss.seat} does not exist in ${blocks[miss.blockId]?.name || miss.blockId}`);
        }
        const zoneRows = zoneReq.size ? await DB.table('show_zones').select('id', 'block_key').where('show_id', s.id).whereIn('block_key', [...zoneReq.keys()]).get() : [];
        if (zoneRows.length !== zoneReq.size) bad('Zone is not available');

        const owner = ensureHolder(req, res);
        const expires = new Date(now.getTime() + Number(holdMinutes || 8) * 60000);
        const holdUuid = uuid();

        await Db.independent(async () => {
            // 1) GA: take the zone row locks FIRST (see header) so the reads below see every competing hold.
            const zoneIds = zoneRows.map((z) => z.id);
            if (zoneIds.length) await ShowZone.query().whereIn('id', zoneIds).update({ updated_at: now });
            // 2) This browser re-selecting for the same show: release its earlier active holds (never ones already in an order).
            const candidates = (await SeatHold.select('id').where('show_id', s.id).where('owner_hash', owner).where('status', 'active').get()).map((h) => h.id);
            const ordered = candidates.length ? new Set((await Order.select('hold_id').whereIn('hold_id', candidates).get()).map((o) => o.hold_id)) : new Set();
            const mine = candidates.filter((id) => !ordered.has(id));
            if (mine.length) {
                await ShowSeat.query().whereIn('hold_id', mine).where('status', 'held').update({ status: 'available', hold_id: null, hold_expires_at: null, updated_at: now });
                await SeatHold.query().whereIn('id', mine).update({ status: 'released', updated_at: now });
            }
            // 2b) GA capacity against ALL live holds (ours just released above are no longer active).
            if (zoneIds.length) {
                const locked = await DB.table('show_zones').select('id', 'block_key', 'capacity', 'sold', 'blocked').whereIn('id', zoneIds).get();
                const heldBy = await CatalogService._internals.liveZoneHolds(zoneIds, now);
                for (const z of locked) {
                    const left = Math.max(0, z.capacity - z.sold - z.blocked - (heldBy.get(z.id) || 0));
                    const want = zoneReq.get(z.block_key);
                    if (want > left) throw new HttpError(409, left ? `Only ${left} left in ${blocks[z.block_key].name}` : `${blocks[z.block_key].name} is sold out`, 'sold_out');
                }
            }
            // 3) The hold.
            const holdId = (await SeatHold.create({
                uuid: holdUuid, show_id: s.id, event_id: s.event_id, user_id: ctx.user?.type === 'customer' ? ctx.user.id : null, owner_hash: owner,
                status: 'active', subtotal: 0, expires_at: expires, ip: ctx.ip ? IpResolver.toBinary(ctx.ip) : null,
            })).id;
            // 4) Seats: atomic conditional claim.
            if (seatRows.length) {
                const ids = seatRows.map((r) => r.id);
                const claimed = await ShowSeat.query().whereIn('id', ids).whereRaw("(status = 'available' OR (status = 'held' AND hold_expires_at < ?))", [now])
                    .update({ status: 'held', hold_id: holdId, hold_expires_at: expires, updated_at: now });
                if (claimed !== ids.length) {
                    const lost = await ShowSeat.select('block_key', 'seat_code').whereIn('id', ids).whereRaw('(hold_id IS NULL OR hold_id <> ?)', [holdId]).first();
                    throw new HttpError(409, `Seat ${lost?.seat_code || ''} in ${blocks[lost?.block_key]?.name || 'this block'} was just taken — please pick another`, 'seat_taken');
                }
            }
            // 5) Line items with the price at hold time.
            const items = [
                ...seatRows.map((r) => ({ hold_id: holdId, show_seat_id: r.id, show_zone_id: null, block_key: r.block_key, block_name: blocks[r.block_key].name, seat_code: r.seat_code, tier_key: r.tier_key, tier_name: tiers[r.tier_key].name, qty: 1, price: r.price_override !== null ? Number(r.price_override) : tiers[r.tier_key].price })),
                ...zoneRows.map((z) => { const b = blocks[z.block_key]; return { hold_id: holdId, show_seat_id: null, show_zone_id: z.id, block_key: z.block_key, block_name: b.name, seat_code: null, tier_key: b.tier, tier_name: tiers[b.tier].name, qty: zoneReq.get(z.block_key), price: tiers[b.tier].price }; }),
            ];
            await Db.insertMany('seat_hold_items', items);
            await SeatHold.where('id', holdId).update({ subtotal: items.reduce((a, i) => a + i.price * i.qty, 0) });
        });
        return HoldService.get(ctx, req, holdUuid);
    },

    async get(ctx, req, holdUuid) {
        const h = await holdRow(holdUuid);
        if (!h) missing('Your seat hold has expired');
        assertOwner(h, ctx, req);
        const live = h.status === 'active' && new Date(h.expires_at) > new Date();
        if (!live && !h.order_ref) missing('Your seat hold has expired');
        const [items, detail, promos] = await Promise.all([
            SeatHoldItem.select('block_key', 'block_name', 'seat_code', 'tier_key', 'tier_name', 'qty', 'price').where('hold_id', h.id).orderBy('id').get(),
            CatalogService.detail(h.event_slug).catch(() => null),
            Promo.select('code', 'type', 'value').where('event_id', h.event_id).where('is_active', 1).get(),
        ]);
        const subtotal = Number(h.subtotal);
        const pricing = await PricingService.price({ id: h.event_id, merchant_id: h.merchant_id, category_id: h.category_id, subcategory_id: h.subcategory_id }, subtotal);
        const venue = detail?.venues?.find((v) => v.id === h.venue_slug) || null;
        const { description, cast, sponsors, shows, venues, tiers, promos: _p, ...event } = detail || {}; // eslint-disable-line no-unused-vars
        return {
            id: h.uuid, showId: h.show_uuid, eventId: h.event_uuid, venueId: h.venue_slug, showDate: h.starts_at, status: live ? 'active' : h.status,
            items: items.map((i) => ({ type: i.seat_code ? 'seat' : 'zone', blockId: i.block_key, blockName: i.block_name, seat: i.seat_code || undefined, tierId: i.tier_key, tierName: i.tier_name, price: Number(i.price), qty: i.qty })),
            subtotal, createdAt: h.created_at, expiresAt: h.expires_at, orderId: h.order_ref || null,
            event, venue, policy: detail?.policy || null,
            promos: promos.map((p) => ({ code: p.code, type: p.type, value: Number(p.value) })),
            pricing: PricingService.public(pricing),
        };
    },

    async quote(ctx, req, holdUuid, promoCode) {
        const h = await holdRow(holdUuid);
        if (!h) missing('Hold expired');
        assertOwner(h, ctx, req);
        if (h.status !== 'active' || new Date(h.expires_at) <= new Date()) missing('Hold expired');
        const p = await PricingService.price({ id: h.event_id, merchant_id: h.merchant_id, category_id: h.category_id, subcategory_id: h.subcategory_id }, Number(h.subtotal), promoCode, { userId: ctx.user?.id });
        return PricingService.public(p);
    },

    async release(ctx, req, holdUuid) {
        const h = await holdRow(holdUuid);
        if (!h) return { ok: true };
        assertOwner(h, ctx, req);
        if (h.order_ref) conflict('This hold is already part of an order', 'hold_ordered');
        if (h.status !== 'active') return { ok: true };
        const now = new Date();
        await Db.independent(async () => {
            await ShowSeat.where('hold_id', h.id).where('status', 'held').update({ status: 'available', hold_id: null, hold_expires_at: null, updated_at: now });
            await SeatHold.where('id', h.id).where('status', 'active').update({ status: 'released', updated_at: now });
        });
        return { ok: true };
    },

    _internals: { holdRow, assertOwner, holderHash },
};

module.exports = HoldService;
