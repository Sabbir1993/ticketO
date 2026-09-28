// Dynamic seat plan → per-show inventory.
//   snapshot(): copies a published layout version into event_layouts (the event's own, immutable-once-sold spec)
//   materialize(): expands that spec into show_seats (one row per seat, with x/y from the shared geometry)
//   and show_zones (GA capacity per block). Seat codes and positions come from resources/js/shared/geometry.mjs,
//   the same code the browser seat map draws with, so inventory always matches the drawing.
const Db = use('App/Support/Db');
const LayoutVersion = use('App/Models/LayoutVersion');
const EventLayout = use('App/Models/EventLayout');
const EventShow = use('App/Models/EventShow');
const EventBlockOverride = use('App/Models/EventBlockOverride');
const EventTier = use('App/Models/EventTier');
const EventLayoutSeatAttribute = use('App/Models/EventLayoutSeatAttribute');
const ShowSeat = use('App/Models/ShowSeat');
const ShowZone = use('App/Models/ShowZone');
const Geometry = use('App/Support/Geometry');
const LayoutService = use('App/Services/LayoutService');
const { missing, conflict } = use('App/Support/HttpError');

const round2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

const SeatMapService = {
    /** Snapshot a layout version (or a custom spec) onto an event. Returns event_layouts.id. */
    async snapshot(eventId, { versionId = null, spec = null, userId = null } = {}) {
        let source = spec;
        if (!source) {
            const v = await LayoutVersion.select('spec').where('id', versionId || 0).first();
            if (!v) missing('Layout version not found');
            source = Db.json(v.spec);
        }
        const row = { source_version_id: versionId, spec: source, checksum: LayoutService.checksum(source), is_custom: spec ? 1 : 0, updated_by: userId };
        const existing = await EventLayout.select('id', 'locked_at').where('event_id', eventId).first();
        if (!existing) return (await EventLayout.create({ event_id: eventId, ...row })).id;
        if (existing.locked_at) conflict('Seats are already held or sold — use the layout editor, which protects sold seats', 'layout_locked');
        await EventLayout.where('id', existing.id).update({ ...row, spec: Db.toJson(source), updated_at: new Date() });
        return existing.id;
    },

    /** Build show_seats / show_zones for one show. Skips shows already generated unless force. */
    async materialize(showId, { force = false } = {}) {
        const G = await Geometry.load();
        const show = await EventShow.select('id', 'event_id', 'seat_map_generated_at').where('id', showId).first();
        if (!show) missing('Show not found');
        if (show.seat_map_generated_at && !force) return { skipped: true };
        const layout = await EventLayout.select('spec', 'checksum').where('event_id', show.event_id).first();
        if (!layout) missing('Event has no layout');
        const spec = Db.json(layout.spec);

        const [overrideRows, tierRows, attrRows] = await Promise.all([
            EventBlockOverride.select('block_key', 'is_enabled', 'capacity').where('event_id', show.event_id).get(),
            EventTier.select('tier_key').where('event_id', show.event_id).get(),
            EventLayoutSeatAttribute.select('block_key', 'seat_code', 'attr').where('event_id', show.event_id).get(),
        ]);
        const overrides = Object.fromEntries(overrideRows.map((o) => [o.block_key, o]));
        const tiers = new Set(tierRows.map((t) => t.tier_key));
        // Seat tools: kill = not part of this event; house_hold = blocked from sale; the rest are display flags.
        const attrs = {};
        for (const a of attrRows) ((attrs[a.block_key] ||= {})[a.seat_code] ||= new Set()).add(a.attr);

        if (force) {
            const sold = await ShowSeat.where('show_id', showId).whereIn('status', ['held', 'sold']).count();
            const soldGa = await ShowZone.where('show_id', showId).sum('sold');
            if (Number(sold) || Number(soldGa)) conflict('This show already has held or sold tickets', 'show_has_sales');
            await ShowSeat.where('show_id', showId).delete();
            await ShowZone.where('show_id', showId).delete();
        }

        const now = new Date();
        const seats = []; const zones = [];
        for (const b of spec.blocks || []) {
            const o = overrides[b.id];
            if (b.sell === 'none' || (o && !o.is_enabled) || !tiers.has(b.tier)) continue;
            if (b.sell === 'ga') {
                const capacity = Number(o?.capacity) || Number(b.capacity) || 0;
                if (capacity > 0) zones.push({ show_id: showId, block_key: b.id, tier_key: b.tier, capacity, sold: 0, blocked: 0, updated_at: now });
                continue;
            }
            const pos = Object.fromEntries(G.seatPositions(b, spec).filter((p) => !p.gap).map((p) => [p.id, p]));
            for (const code of G.blockSeatIds(b)) {
                const flags = attrs[b.id]?.[code];
                if (flags?.has('kill')) continue;
                const row = code.replace(/\d+$/, '');
                const p = pos[code];
                const display = flags ? [...flags].filter((f) => ['accessible', 'companion', 'restricted_view'].includes(f)).join(',') : '';
                seats.push({
                    show_id: showId, block_key: b.id, row_label: row, seat_no: Number(code.slice(row.length)), seat_code: code, tier_key: b.tier,
                    x: round2(p?.x), y: round2(p?.y), status: flags?.has('house_hold') ? 'blocked' : 'available', attrs: display || null,
                    blocked_reason: flags?.has('house_hold') ? 'house_hold' : null, updated_at: now,
                });
            }
        }
        await Db.insertMany('show_seats', seats, 1000);
        await Db.insertMany('show_zones', zones);
        await EventShow.where('id', showId).update({
            seat_count: seats.length, ga_capacity: zones.reduce((a, z) => a + z.capacity, 0),
            layout_checksum: layout.checksum, seat_map_generated_at: now, updated_at: now,
        });
        return { seats: seats.length, zones: zones.length };
    },
};

module.exports = SeatMapService;
