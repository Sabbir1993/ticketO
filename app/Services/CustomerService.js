// Signed-in customer: profile (PATCH /api/me), bookings (GET /api/me/orders), cancellation / refund
// requests and ticket transfers. Order access always goes through OrderService.accessible (404 for others).
const Db = use('App/Support/Db');
const DB = use('laranode/Support/Facades/DB');
const User = use('App/Models/User');
const Order = use('App/Models/Order');
const Refund = use('App/Models/Refund');
const Ticket = use('App/Models/Ticket');
const OrderTransfer = use('App/Models/OrderTransfer');
const SeatHold = use('App/Models/SeatHold');
const Lookup = use('App/Models/Lookup');
const OrderService = use('App/Services/OrderService');
const BlockService = use('App/Services/BlockService');
const AuditService = use('App/Services/AuditService');
const UserView = use('App/Services/UserView');
const Access = use('App/Support/Access');
const Hasher = use('App/Security/Hasher');
const { bad, forbid } = use('App/Support/HttpError');

const HIDDEN_STATES = ['pending_payment', 'expired', 'failed', 'cancelled'];
const money = (v) => Number(v || 0);

/** Order + show time + event policy (for refund / transfer rules). */
async function policyFor(o) {
    return DB.table('event_shows as s').join('events as e', 'e.id', '=', 's.event_id')
        .select('s.starts_at', 'e.is_refundable', 'e.is_cancellable', 'e.is_transferable', 'e.refund_window_hrs', 'e.cancellation_fee_pct', 'e.title')
        .where('s.id', o.show_id).first();
}

const CustomerService = {
    async updateProfile(ctx, { name, email } = {}) {
        const patch = {};
        if (name !== undefined) {
            const n = String(name || '').trim().replace(/\s+/g, ' ');
            if (n.length < 2 || n.length > 150) bad('Enter your full name (2–150 characters)');
            patch.name = n;
        }
        // Staff sign in with their email, so only customers can change it here.
        if (email !== undefined && ctx.user.type === 'customer') {
            const e = BlockService.normEmail(email).slice(0, 190);
            if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) bad('Enter a valid email address');
            if (e && await User.withTrashed().where('type', 'customer').where('email', e).where('id', '!=', ctx.user.id).first()) bad('This email is already used by another account');
            patch.email = e || null;
        }
        if (!Object.keys(patch).length) bad('Nothing to update');
        const before = { name: ctx.user.name, email: ctx.user.email };
        await User.where('id', ctx.user.id).update({ ...patch, updated_at: new Date() });
        await AuditService.record(ctx, 'PROFILE_UPDATED', { type: 'user', id: ctx.user.id, label: ctx.user.phone || ctx.user.email }, { before, after: patch });
        const user = await User.find(ctx.user.id);
        return UserView.user(user, ctx);
    },

    /** Confirmed / refunded bookings for this account or its verified phone, newest first. */
    async orders(ctx) {
        const q = Order.query().whereNotIn('status', HIDDEN_STATES);
        if (ctx.user.phone) q.whereRaw('(user_id = ? OR contact_phone = ?)', [ctx.user.id, ctx.user.phone]);
        else q.where('user_id', ctx.user.id);
        const rows = await q.orderBy('id', 'desc').limit(100).get();
        return Promise.all(rows.map((o) => OrderService.view(o)));
    },

    async requestRefund(ctx, req, idOrRef, { reason } = {}) {
        const o = await OrderService.accessible(ctx, req, idOrRef);
        // Customers ask for their own bookings; CMS support staff need refunds.review to file one for a customer.
        if (ctx.guard !== 'customer' && !Access.can(ctx, 'refunds.review')) forbid();
        if (o.status !== 'paid') bad('Only confirmed bookings can be cancelled');
        if (await Ticket.where('order_id', o.id).whereNotNull('scanned_at').first()) bad('Tickets were already used at the gate');
        const p = await policyFor(o);
        const hrs = (new Date(p.starts_at) - Date.now()) / 3600000;
        const total = money(o.total);
        let kind; let fee = 0;
        if (p.is_cancellable && hrs > Number(p.refund_window_hrs || 0)) { kind = 'cancellation'; fee = Math.round((total * Number(p.cancellation_fee_pct || 0)) / 100); }
        else if (p.is_refundable && hrs > 0) kind = 'refund';
        else bad('The organiser does not allow cancellation for this booking', 'policy');

        const text = String(reason || '').trim().slice(0, 255) || 'Requested by customer';
        const code = (await Lookup.select('code').where('lookup_group', 'refund_reasons').where('label', text).first())?.code || 'other';
        const now = new Date();
        await Db.transaction(async () => {
            // Conditional status change = one refund request per booking, even on double submit.
            if (!(await Order.where('id', o.id).where('status', 'paid').update({ status: 'refund_requested', updated_at: now }))) bad('This booking already has a pending request');
            await Refund.create({ order_id: o.id, kind, amount: total - fee, fee, reason_code: code, reason_text: text, status: 'requested', requested_by: ctx.user.id, requested_at: now });
        });
        await AuditService.record(ctx, 'REFUND_REQUESTED', { type: 'order', id: o.id, label: o.booking_ref }, { meta: { kind, amount: total - fee, fee }, merchantId: o.merchant_id });
        return OrderService.view(await Order.find(o.id));
    },

    /** Moves the booking to another person: new QR codes (ticket version + 1), old ones stop working. */
    async transfer(ctx, req, idOrRef, { name, phone } = {}) {
        const o = await OrderService.accessible(ctx, req, idOrRef);
        if (ctx.guard !== 'customer') forbid('Only the ticket holder can transfer a booking');
        const p = await policyFor(o);
        if (!p.is_transferable) bad('Transfers are not allowed for this event', 'policy');
        if (o.status !== 'paid' || new Date(p.starts_at) <= new Date()) bad('This booking cannot be transferred');
        if (await Ticket.where('order_id', o.id).whereNotNull('scanned_at').first()) bad('Tickets were already used at the gate');
        const toName = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 150);
        if (toName.length < 2) bad('Enter the recipient’s name');
        const toPhone = BlockService.normPhone(phone) || bad('Enter a valid mobile number for the recipient');
        if (toPhone === o.contact_phone) bad('The booking already belongs to this number');

        const recipient = await User.select('id').where('type', 'customer').where('phone', toPhone).first();
        const now = new Date();
        await Db.transaction(async () => {
            // Row lock + state check in one statement.
            if (!(await Order.where('id', o.id).where('status', 'paid').update({
                contact_name: toName, contact_phone: toPhone, user_id: recipient?.id || null, guest_access_hash: null, updated_at: now,
            }))) bad('This booking cannot be transferred');
            await OrderTransfer.create({ order_id: o.id, from_name: o.contact_name, from_phone: o.contact_phone, to_name: toName, to_phone: toPhone, transferred_by: ctx.user.id, transferred_at: now });
            await Ticket.where('order_id', o.id).increment('version');
            // The buying browser's holder cookie no longer opens this booking.
            // (a hash of a random token nobody holds — the column is NOT NULL)
            if (o.hold_id) await SeatHold.where('id', o.hold_id).update({ owner_hash: Hasher.hash(Hasher.token(32), 'holder'), updated_at: now });
        });
        await AuditService.record(ctx, 'ORDER_TRANSFERRED', { type: 'order', id: o.id, label: o.booking_ref }, { meta: { to_phone_last4: toPhone.slice(-4) }, merchantId: o.merchant_id });
        return OrderService.view(await Order.find(o.id));
    },
};

module.exports = CustomerService;
