// CMS orders (GET /api/admin/orders) and refund review (POST /api/orders/:ref/refund-review).
// Customer contact details are masked unless the viewer holds orders.pii.view; every unmasked
// listing is written to data_access_logs (who saw which customers' PII, when, from where).
const Db = use('App/Support/Db');
const DB = use('laranode/Support/Facades/DB');
const Order = use('App/Models/Order');
const DataAccessLog = use('App/Models/DataAccessLog');
const IpResolver = use('App/Security/IpResolver');
const Access = use('App/Support/Access');
const { bad, conflict, missing } = use('App/Support/HttpError');

const STATUSES = ['pending_payment', 'paid', 'failed', 'refund_requested', 'refunded', 'cancelled'];
const maskPhone = (p) => (p ? `${p.slice(0, 5)}•••••${p.slice(-2)}` : null);
const maskName = (n) => (n ? n.split(/\s+/).map((w) => `${w[0]}${'•'.repeat(Math.max(1, Math.min(4, w.length - 1)))}`).join(' ') : null);
const maskEmail = (e) => (e ? e.replace(/^(.).*(@.*)$/, '$1•••$2') : null);
const money = (v) => Number(v || 0);

const OrderAdminService = {
    async list(ctx, { status } = {}) {
        if (status && !STATUSES.includes(status)) bad('Unknown status');
        const q = DB.table('orders as o').join('merchants as m', 'm.id', '=', 'o.merchant_id').join('events as e', 'e.id', '=', 'o.event_id')
            .select('o.id', 'o.uuid', 'o.booking_ref', 'o.status', 'o.channel', 'o.contact_name', 'o.contact_phone', 'o.contact_email', 'o.subtotal', 'o.discount', 'o.fee', 'o.total',
                'o.commission', 'o.pg_mode', 'o.created_at', 'o.paid_at', 'm.name as merchant_name', 'e.title as event_title', 'e.slug as event_slug')
            .where('o.status', '!=', 'expired');
        if (status) q.where('o.status', status);
        const rows = await q.orderBy('o.id', 'desc').limit(500).get();
        // Latest payment and refund per order (grouped reads instead of correlated subqueries).
        const ids = rows.map((o) => o.id);
        const latest = async (table, cols) => {
            if (!ids.length) return new Map();
            const list = await DB.table(table).select('order_id', ...cols).whereIn('order_id', ids).orderBy('id').get();
            return new Map(list.map((r) => [r.order_id, r])); // ascending → the last one wins
        };
        const [payments, refunds] = await Promise.all([latest('payments', ['gateway', 'bank_tran_id', 'tran_id']), latest('refunds', ['amount', 'reason_text', 'status'])]);
        for (const o of rows) {
            const p = payments.get(o.id); const r = refunds.get(o.id);
            Object.assign(o, { gateway: p?.gateway, bank_tran_id: p?.bank_tran_id, tran_id: p?.tran_id, refund_amount: r?.amount, refund_reason: r?.reason_text, refund_status: r?.status });
        }

        const pii = Access.can(ctx, 'orders.pii.view');
        if (pii && rows.length) {
            await Db.outside(() => DataAccessLog.create({
                occurred_at: new Date(), user_id: ctx.user.id, resource: 'customer_contact', resource_id: `orders:list:${status || 'all'}:${rows.length}`,
                purpose: 'CMS order list', request_id: ctx.requestId, ip: IpResolver.toBinary(ctx.ip),
            }));
        }
        return rows.map((o) => ({
            id: o.booking_ref, uuid: o.uuid, status: o.status, channel: o.channel, createdAt: o.created_at, paidAt: o.paid_at,
            merchantName: o.merchant_name, event: { title: o.event_title, slug: o.event_slug },
            contact: pii ? { name: o.contact_name, phone: o.contact_phone, email: o.contact_email } : { name: maskName(o.contact_name), phone: maskPhone(o.contact_phone), email: maskEmail(o.contact_email), masked: true },
            amounts: { subtotal: money(o.subtotal), discount: money(o.discount), fee: money(o.fee), total: money(o.total), commission: money(o.commission) },
            payment: o.gateway ? { gateway: o.gateway, pgMode: o.pg_mode, bankTranId: o.bank_tran_id, ref: o.tran_id } : null,
            refund: o.refund_status ? { amount: money(o.refund_amount), reason: o.refund_reason, status: o.refund_status } : null,
        }));
    },

    // Refund execution calls the gateway (SSLCOMMERZ / bKash refund APIs) and releases inventory; it is
    // enabled together with the payment module so money never moves through a half-built path.
    async reviewRefund(ctx, bookingRef, { action } = {}) {
        Access.need(ctx, 'refunds.review');
        if (!['approve', 'reject'].includes(action)) bad('Unknown action');
        const o = await Order.select('id', 'status').whereRaw('(booking_ref = ? OR uuid = ?)', [String(bookingRef), String(bookingRef)]).first() || missing('Order not found');
        if (o.status !== 'refund_requested') bad('No pending refund on this booking');
        conflict('Refund processing is enabled with the payments module (gateway refunds + inventory release).', 'refunds_unavailable');
    },
};

OrderAdminService.mask = { phone: maskPhone, name: maskName, email: maskEmail };

module.exports = OrderAdminService;
