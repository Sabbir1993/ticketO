// CMS dashboard (GET /api/admin/overview) and audit trail (GET /api/admin/audit).
// Money comes only from real orders; "sold" is live inventory on upcoming shows (seat + GA rows),
// which on demo data includes the seeded occupancy.
const Db = use('App/Support/Db');
const DB = use('laranode/Support/Facades/DB');
const Order = use('App/Models/Order');
const Merchant = use('App/Models/Merchant');
const Event = use('App/Models/Event');
const TicketScan = use('App/Models/TicketScan');
const AuditLog = use('App/Models/AuditLog');
const IpResolver = use('App/Security/IpResolver');

const PAID = ['paid', 'refund_requested'];
const DAY = 86400000;
const n = (v) => Number(v || 0);

const OverviewService = {
    async overview() {
        const now = new Date();
        const upcoming = new Date(now.getTime() - 6 * 3600000);
        const since = new Date(now.getTime() - 13 * DAY); since.setHours(0, 0, 0, 0);
        const [money, pendingMerchants, pendingEvents, pendingRefunds, merchants, seatInv, zoneInv, revByEvent, byCat, daily, events, scans] = await Promise.all([
            DB.table('orders').selectRaw("COALESCE(SUM(total),0) as gmv, COALESCE(SUM(CASE WHEN channel = 'web' THEN total END),0) as online, COALESCE(SUM(commission + fee_ex_vat),0) as earnings, COUNT(*) as orders")
                .whereIn('status', PAID).first(),
            Merchant.where('status', 'pending').count(),
            Event.where('status', 'pending_review').count(),
            Order.where('status', 'refund_requested').count(),
            DB.table('merchants').selectRaw("COUNT(*) as total, SUM(status = 'active') as active, SUM(pg_mode = 'direct') as direct").whereNull('deleted_at').first(),
            DB.table('show_seats as ss').join('event_shows as s', 's.id', '=', 'ss.show_id')
                .select('s.event_id').selectRaw("COUNT(*) as capacity, SUM(ss.status = 'sold') as sold")
                .where('s.status', 'scheduled').where('s.starts_at', '>', upcoming).groupBy('s.event_id').get(),
            DB.table('show_zones as z').join('event_shows as s', 's.id', '=', 'z.show_id')
                .select('s.event_id').selectRaw('SUM(z.capacity) as capacity, SUM(z.sold) as sold')
                .where('s.status', 'scheduled').where('s.starts_at', '>', upcoming).groupBy('s.event_id').get(),
            DB.table('orders').select('event_id').selectRaw('SUM(subtotal - discount) as revenue').whereIn('status', PAID).groupBy('event_id').get(),
            DB.table('orders as o').join('events as e', 'e.id', '=', 'o.event_id').join('categories as c', 'c.id', '=', 'e.category_id')
                .select('c.name as label').selectRaw('SUM(o.total) as value').whereIn('o.status', PAID).groupBy('c.id', 'c.name').orderByRaw('value DESC').get(),
            DB.table('orders').selectRaw('DATE(COALESCE(paid_at, created_at)) as d, SUM(total) as revenue')
                .whereIn('status', PAID).whereRaw('COALESCE(paid_at, created_at) >= ?', [since]).groupByRaw('d').get(),
            DB.table('events as e').join('categories as c', 'c.id', '=', 'e.category_id').join('merchants as m', 'm.id', '=', 'e.merchant_id')
                .select('e.id', 'e.uuid', 'e.title', 'c.slug as category', 'm.name as merchant').where('e.status', 'published').whereNull('e.deleted_at').get(),
            TicketScan.where('result', 'valid').where('scanned_at', '>=', new Date(new Date().setHours(0, 0, 0, 0))).count(),
        ]);
        const pending = { merchants: pendingMerchants, events: pendingEvents, refunds: pendingRefunds };

        const inv = new Map();
        for (const r of [...seatInv, ...zoneInv]) {
            const cur = inv.get(r.event_id) || { capacity: 0, sold: 0 };
            inv.set(r.event_id, { capacity: cur.capacity + n(r.capacity), sold: cur.sold + n(r.sold) });
        }
        const rev = new Map(revByEvent.map((r) => [r.event_id, n(r.revenue)]));
        const top = events.map((e) => ({ id: e.uuid, title: e.title, category: e.category, merchant: e.merchant, ...(inv.get(e.id) || { capacity: 0, sold: 0 }), revenue: rev.get(e.id) || 0 }))
            .sort((a, b) => b.revenue - a.revenue || b.sold - a.sold);

        const perDay = new Map(daily.map((r) => [new Date(r.d).toISOString().slice(0, 10), n(r.revenue)]));
        const series = [];
        for (let i = 13; i >= 0; i--) {
            const d = new Date(now.getTime() - i * DAY);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            series.push({ date: key, revenue: perDay.get(key) || 0 });
        }

        return {
            gmv: n(money.gmv), onlineGmv: n(money.online), commission: n(money.earnings),
            ticketsSold: top.reduce((a, t) => a + t.sold, 0), liveOrders: n(money.orders),
            pending: { merchants: n(pending.merchants), events: n(pending.events), refunds: n(pending.refunds) },
            merchants: { total: n(merchants.total), active: n(merchants.active), direct: n(merchants.direct) },
            byCategory: byCat.map((r) => ({ label: r.label, value: n(r.value) })),
            topEvents: top.slice(0, 8), series, scansToday: n(scans),
        };
    },

    /**
     * Keyset pagination (newest first) — stays fast on an append-only table of any size, unlike OFFSET.
     *   before=<id> → the next (older) page · after=<id> → the previous (newer) page
     * Filters: action (exact), actor (contains), from / to (YYYY-MM-DD, inclusive, server time).
     * Returns { data, older, newer, perPage, actions } where older/newer are cursors (null at either end).
     */
    async audit({ perPage, before, after, action, actor, from, to } = {}) {
        const size = Math.max(10, Math.min(100, Db.int(perPage, 50, 100) || 50));
        const day = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : null);
        /** A fresh builder with the filters applied (one per query: builders are mutable). */
        const filtered = () => {
            const q = DB.table('audit_logs');
            if (action) q.where('action', String(action).slice(0, 80));
            if (actor) q.where('actor_label', 'LIKE', Db.like(String(actor).slice(0, 80)));
            if (day(from)) q.where('occurred_at', '>=', new Date(`${day(from)}T00:00:00`));
            if (day(to)) q.where('occurred_at', '<', new Date(new Date(`${day(to)}T00:00:00`).getTime() + DAY));
            return q;
        };

        const newerPage = Db.int(after, 0, Number.MAX_SAFE_INTEGER) > 0;
        const cursor = newerPage ? Db.int(after, 0, Number.MAX_SAFE_INTEGER) : Db.int(before, 0, Number.MAX_SAFE_INTEGER);
        const q = filtered().select('id', 'occurred_at', 'actor_type', 'actor_label', 'actor_roles', 'action', 'subject_type', 'subject_id', 'subject_label', 'meta', 'request_id', 'ip');
        if (cursor) q.where('id', newerPage ? '>' : '<', cursor);
        // Fetch one extra row to know whether another page exists in that direction.
        const rows = await q.orderBy('id', newerPage ? 'asc' : 'desc').limit(size + 1).get();
        const more = rows.length > size;
        const slice = rows.slice(0, size);
        if (newerPage) slice.reverse(); // always return newest first

        const edge = (op, id) => filtered().where('id', op, id).exists();
        const first = slice[0]?.id; const last = slice[slice.length - 1]?.id;
        const [hasNewer, hasOlder, actions] = await Promise.all([
            first === undefined ? false : newerPage ? more : cursor ? edge('>', first) : false,
            last === undefined ? false : newerPage ? edge('<', last) : more,
            AuditLog.select('action').distinct().orderBy('action').get(),
        ]);
        return {
            data: slice.map((r) => ({
                id: r.id, at: r.occurred_at, actor: r.actor_label || r.actor_type, role: (Db.json(r.actor_roles) || []).join(', ') || r.actor_type,
                action: r.action, target: r.subject_label || (r.subject_type ? `${r.subject_type}#${r.subject_id}` : ''),
                subject: r.subject_type ? { type: r.subject_type, id: r.subject_id } : null, meta: Db.json(r.meta), requestId: r.request_id, ip: IpResolver.fromBinary(r.ip),
            })),
            older: hasOlder ? last : null,
            newer: hasNewer ? first : null,
            perPage: size,
            actions: actions.map((a) => a.action),
        };
    },
};

module.exports = OverviewService;
