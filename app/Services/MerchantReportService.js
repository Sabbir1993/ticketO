// Merchant portal read models: dashboard, orders (buyer contact masked unless merchant.orders.pii.view,
// unmasked views logged to data_access_logs) and settlement (from paid orders; commission / payouts).
const Db = use('App/Support/Db');
const DB = use('laranode/Support/Facades/DB');
const Order = use('App/Models/Order');
const Event = use('App/Models/Event');
const DataAccessLog = use('App/Models/DataAccessLog');
const IpResolver = use('App/Security/IpResolver');
const Access = use('App/Support/Access');
const OrderService = use('App/Services/OrderService');
const MerchantEventService = use('App/Services/MerchantEventService');
const MerchantAccountService = use('App/Services/MerchantAccountService');
const AuditService = use('App/Services/AuditService');
const { mask } = use('App/Services/Cms/OrderAdminService');
const { bad } = use('App/Support/HttpError');

const DAY = 86400000;
const money = (v) => Number(v || 0);
const SETTLED = ['paid', 'refund_requested', 'refunded'];

async function orderViews(ctx, rows, purpose) {
    const views = await Promise.all(rows.map((o) => OrderService.view(o)));
    const pii = Access.can(ctx, 'merchant.orders.pii.view');
    if (pii && views.length) {
        await Db.outside(() => DataAccessLog.create({
            occurred_at: new Date(), user_id: ctx.user.id, merchant_id: ctx.merchantId, resource: 'customer_contact', resource_id: `merchant:${purpose}:${views.length}`,
            purpose, request_id: ctx.requestId, ip: ctx.ip ? IpResolver.toBinary(ctx.ip) : null,
        }));
    }
    // Staff never need ticket QR codes here (the gate validates them); keep only labels and scan state.
    return views.map((v) => ({
        ...v,
        contact: pii ? v.contact : { name: mask.name(v.contact.name), phone: mask.phone(v.contact.phone), email: mask.email(v.contact.email) },
        tickets: v.tickets.map(({ code, ...t }) => t), // eslint-disable-line no-unused-vars
    }));
}

const MerchantReportService = {
    async dashboard(ctx) {
        const since = new Date(Date.now() - 13 * DAY); since.setHours(0, 0, 0, 0);
        const [merchant, counts, events, daily, recent] = await Promise.all([
            MerchantAccountService.view(ctx.merchantId),
            DB.table('events').select('status').selectRaw('COUNT(*) as n').where('merchant_id', ctx.merchantId).whereNull('deleted_at').groupBy('status').get(),
            Event.select('id', 'uuid', 'title').where('merchant_id', ctx.merchantId).whereIn('status', ['published', 'paused']).get(),
            DB.table('orders').selectRaw('DATE(COALESCE(paid_at, created_at)) as d, SUM(subtotal - discount) as revenue')
                .where('merchant_id', ctx.merchantId).whereIn('status', ['paid', 'refund_requested']).whereRaw('COALESCE(paid_at, created_at) >= ?', [since]).groupByRaw('d').get(),
            Order.query().where('merchant_id', ctx.merchantId).whereNotIn('status', ['pending_payment', 'expired', 'failed']).orderBy('id', 'desc').limit(8).get(),
        ]);
        const n = (s) => Number(counts.find((c) => c.status === s)?.n || 0);
        const S = await MerchantEventService.stats(events.map((e) => e.id));
        const perDay = new Map(daily.map((r) => [new Date(r.d).toISOString().slice(0, 10), money(r.revenue)]));
        const series = [];
        for (let i = 13; i >= 0; i--) {
            const d = new Date(Date.now() - i * DAY);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            series.push({ date: key, revenue: perDay.get(key) || 0 });
        }
        return {
            merchant,
            events: { total: counts.reduce((a, c) => a + Number(c.n), 0), published: n('published'), draft: n('draft'), pending: n('pending_review') },
            stats: events.map((e) => ({ id: e.uuid, title: e.title, ...S.get(e.id) })),
            series,
            recentOrders: await orderViews(ctx, recent, 'dashboard'),
        };
    },

    async orders(ctx, { eventId } = {}) {
        const q = Order.query().where('merchant_id', ctx.merchantId).whereNotIn('status', ['expired']);
        if (eventId) {
            const e = await Event.select('id').where('uuid', String(eventId)).where('merchant_id', ctx.merchantId).first();
            if (!e) return [];
            q.where('event_id', e.id);
        }
        return orderViews(ctx, await q.orderBy('id', 'desc').limit(500).get(), 'orders');
    },

    async settlement(ctx) {
        const m = await DB.table('merchants').select('pg_mode', 'commission_pct').where('id', ctx.merchantId).first();
        const rows = await DB.table('orders as o').join('events as e', 'e.id', '=', 'o.event_id')
            .select('e.uuid as event_uuid', 'o.booking_ref', 'o.created_at', 'o.pg_mode', 'o.subtotal', 'o.discount', 'o.fee', 'o.commission', 'o.merchant_net', 'o.status', 'e.title')
            .where('o.merchant_id', ctx.merchantId).whereIn('o.status', SETTLED).orderBy('o.id', 'desc').limit(2000).get();
        const view = rows.map((o) => ({
            id: o.booking_ref, date: o.created_at, event: o.title, eventId: o.event_uuid, pgMode: o.pg_mode || 'platform', gross: money(o.subtotal) - money(o.discount),
            fee: money(o.fee), commission: money(o.commission), net: money(o.merchant_net), status: o.status,
        }));
        const live = view.filter((r) => r.status !== 'refunded');
        const sum = (list, k) => list.reduce((a, r) => a + r[k], 0);
        return {
            mode: m.pg_mode || 'platform', commissionPct: money(m.commission_pct), rows: view,
            payableToMerchant: sum(live.filter((r) => r.pgMode !== 'direct'), 'net'), // Ticketo collected → owes the merchant
            receivableFromMerchant: sum(live.filter((r) => r.pgMode === 'direct'), 'commission'), // merchant collected → owes commission
            directCollected: sum(live.filter((r) => r.pgMode === 'direct'), 'gross'),
        };
    },
};

// ── Sales & payout: one row per event ───────────────────────────────────────────────────────────────
// Same rules as settlement(): paid / refund-requested orders count as sales, refunded orders are shown
// separately and excluded from money owed. Contains no customer data, so it is safe to download.
const dayBound = (s, end = false) => {
    if (!s) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) bad('Dates must look like 2026-11-30');
    const d = new Date(`${s}T${end ? '23:59:59.999' : '00:00:00.000'}`);
    if (Number.isNaN(d.getTime())) bad('Invalid date');
    return d;
};
const SUM_KEYS = ['orders', 'tickets', 'gross', 'refunded', 'fees', 'commission', 'net', 'payable', 'directCollected', 'commissionReceivable'];

MerchantReportService.payoutSummary = async function payoutSummary(ctx, { from, to } = {}) {
    const f = dayBound(from); const t = dayBound(to, true);
    if (f && t && f > t) bad('"From" must be before "To"');
    const m = await DB.table('merchants').select('pg_mode', 'commission_pct', 'settlement_cycle').where('id', ctx.merchantId).first();
    const when = 'COALESCE(o.paid_at, o.created_at)';
    const live = "o.status <> 'refunded'";
    const q = DB.table('orders as o').join('events as e', 'e.id', '=', 'o.event_id')
        .select('e.id as event_pk', 'e.uuid as event_uuid', 'e.title')
        .selectRaw(`COUNT(CASE WHEN ${live} THEN 1 END) AS orders`)
        .selectRaw(`SUM(CASE WHEN ${live} THEN o.subtotal - o.discount ELSE 0 END) AS gross`)
        .selectRaw("SUM(CASE WHEN o.status = 'refunded' THEN o.subtotal - o.discount ELSE 0 END) AS refunded")
        .selectRaw(`SUM(CASE WHEN ${live} THEN o.fee ELSE 0 END) AS fees`)
        .selectRaw(`SUM(CASE WHEN ${live} THEN o.commission ELSE 0 END) AS commission`)
        .selectRaw(`SUM(CASE WHEN ${live} THEN o.merchant_net ELSE 0 END) AS net`)
        .selectRaw(`SUM(CASE WHEN ${live} AND o.pg_mode <> 'direct' THEN o.merchant_net ELSE 0 END) AS payable`)
        .selectRaw(`SUM(CASE WHEN ${live} AND o.pg_mode = 'direct' THEN o.subtotal - o.discount ELSE 0 END) AS direct_collected`)
        .selectRaw(`SUM(CASE WHEN ${live} AND o.pg_mode = 'direct' THEN o.commission ELSE 0 END) AS commission_receivable`)
        .where('o.merchant_id', ctx.merchantId).whereIn('o.status', SETTLED);
    if (f) q.whereRaw(`${when} >= ?`, [f]);
    if (t) q.whereRaw(`${when} <= ?`, [t]);
    const rows = await q.groupBy('e.id', 'e.uuid', 'e.title').orderBy('e.title').limit(1000).get();

    // Tickets issued per event for the same orders (refunded bookings excluded).
    const tq = DB.table('tickets as tk').join('orders as o', 'o.id', '=', 'tk.order_id').select('o.event_id').selectRaw('COUNT(*) AS n')
        .where('o.merchant_id', ctx.merchantId).whereIn('o.status', ['paid', 'refund_requested']);
    if (f) tq.whereRaw(`${when} >= ?`, [f]);
    if (t) tq.whereRaw(`${when} <= ?`, [t]);
    const tickets = Object.fromEntries((await tq.groupBy('o.event_id').get()).map((r) => [r.event_id, Number(r.n)]));

    const events = rows.map((r) => ({
        eventId: r.event_uuid, event: r.title, orders: Number(r.orders), tickets: tickets[r.event_pk] || 0,
        gross: money(r.gross), refunded: money(r.refunded), fees: money(r.fees), commission: money(r.commission), net: money(r.net),
        payable: money(r.payable), directCollected: money(r.direct_collected), commissionReceivable: money(r.commission_receivable),
    }));
    const total = Object.fromEntries(SUM_KEYS.map((k) => [k, events.reduce((a, e) => a + e[k], 0)]));
    return { mode: m?.pg_mode || 'platform', commissionPct: money(m?.commission_pct), cycle: m?.settlement_cycle || 'weekly', from: from || null, to: to || null, events, total };
};

// Spreadsheet formula-injection guard: a cell starting with = + - @ (or tab / CR) gets an apostrophe prefix.
const csvCell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
};

MerchantReportService.payoutCsv = async function payoutCsv(ctx, range) {
    const d = await MerchantReportService.payoutSummary(ctx, range);
    const head = ['Event', 'Orders', 'Tickets', 'Gross sales (BDT)', 'Refunded (BDT)', 'Convenience fees (BDT)', 'Ticketo commission (BDT)', 'Net to organiser (BDT)', 'Payable by Ticketo (BDT)', 'Collected directly by organiser (BDT)', 'Commission due to Ticketo (BDT)'];
    const line = (e, name) => [name, e.orders, e.tickets, e.gross, e.refunded, e.fees, e.commission, e.net, e.payable, e.directCollected, e.commissionReceivable];
    const out = [head, ...d.events.map((e) => line(e, e.event)), line(d.total, 'TOTAL')];
    await Db.outside(() => DataAccessLog.create({
        occurred_at: new Date(), user_id: ctx.user.id, merchant_id: ctx.merchantId, resource: 'settlement_export', resource_id: `merchant:events:${d.events.length}`,
        purpose: 'settlement_export', request_id: ctx.requestId, ip: ctx.ip ? IpResolver.toBinary(ctx.ip) : null,
    }));
    await AuditService.record(ctx, 'SETTLEMENT_EXPORTED', { type: 'merchant', id: ctx.merchantId, label: 'Sales & payout' }, { meta: { events: d.events.length, from: d.from, to: d.to }, merchantId: ctx.merchantId });
    return `﻿${out.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`; // BOM so Excel reads UTF-8 (Bangla titles)
};

module.exports = MerchantReportService;
