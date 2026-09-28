// Box-office sale (POST /api/pos/sales): same inventory and concurrency path as online —
// HoldService claims the seats / GA places (409 if taken), then OrderService.complete issues the tickets.
// No convenience fee at the counter; the merchant collected the money (pg_mode 'direct' in the ledger:
// Ticketo's commission is receivable from the merchant).
const DB = use('laranode/Support/Facades/DB');
const Order = use('App/Models/Order');
const Lookup = use('App/Models/Lookup');
const Hasher = use('App/Security/Hasher');
const IpResolver = use('App/Security/IpResolver');
const HoldService = use('App/Services/HoldService');
const OrderService = use('App/Services/OrderService');
const PricingService = use('App/Services/PricingService');
const BlockService = use('App/Services/BlockService');
const AuditService = use('App/Services/AuditService');
const Db = use('App/Support/Db');
const { uuid, bookingRef } = use('App/Support/Ids');
const { bad } = use('App/Support/HttpError');

const PosService = {
    async sale(ctx, { showId, seats = [], zones = [], method = 'cash', phone, name } = {}) {
        const methods = (await Lookup.select('code').where('lookup_group', 'pos_methods').where('is_active', 1).get()).map((m) => m.code);
        if (!methods.includes(method)) bad('Choose a payment method');
        const buyerPhone = phone ? BlockService.normPhone(phone) || bad('Enter a valid mobile number or leave it empty') : null;
        const buyerName = String(name || '').trim().slice(0, 150) || 'Walk-in customer';

        // Claim inventory exactly like an online hold, under a one-off holder identity for this sale.
        const token = Hasher.token(24);
        const hold = await HoldService.create(ctx, { cookies: { [HoldService.HOLDER_COOKIE]: token } }, { cookie() {} }, { showId, seats, zones }, { channel: 'pos', merchantId: ctx.merchantId });
        const h = await HoldService._internals.holdRow(hold.id);
        const event = await DB.table('events').select('id', 'merchant_id', 'category_id', 'subcategory_id').where('id', h.event_id).first();
        const subtotal = Number(h.subtotal);
        const p = await PricingService.price(event, subtotal); // commission only; no fee / promo at the counter
        const show = await DB.table('event_shows').select('venue_id').where('id', h.show_id).first();

        const orderId = await Db.transaction(async () => {
            const { id } = await Order.create({
                uuid: uuid(), booking_ref: bookingRef('BO'), hold_id: h.id, user_id: null, merchant_id: event.merchant_id, event_id: event.id, show_id: h.show_id, venue_id: show.venue_id,
                channel: 'pos', status: 'pending_payment', contact_name: buyerName, contact_phone: buyerPhone, contact_email: null,
                subtotal, discount: 0, fee: 0, fee_ex_vat: 0, vat: 0, total: subtotal, commission_pct: p.commissionPct, commission: p.commission, merchant_net: subtotal - p.commission,
                pg_mode: 'direct', operator_id: ctx.user.id, pos_method: method, created_ip: ctx.ip ? IpResolver.toBinary(ctx.ip) : null,
            });
            const items = await DB.table('seat_hold_items').select('show_seat_id', 'show_zone_id', 'block_key', 'block_name', 'seat_code', 'tier_key', 'tier_name', 'qty', 'price').where('hold_id', h.id).get();
            await Db.insertMany('order_items', items.map((i) => ({ order_id: id, type: i.seat_code ? 'seat' : 'zone', ...i })));
            return id;
        });
        const r = await OrderService.complete(ctx, { orderId, gateway: 'pos', method, success: true, amount: subtotal, currency: 'BDT' });
        await AuditService.record(ctx, 'POS_SALE', { type: 'order', id: orderId, label: r.o.booking_ref }, { meta: { total: subtotal, method, tickets: r.tickets }, merchantId: event.merchant_id });
        // The receipt prints the QR codes for the buyer.
        return OrderService.view(await Order.find(orderId));
    },
};

module.exports = PosService;
