// Orders & payment — hold → order → gateway → validated completion → tickets.
//
// Money rules (from the prototype, now enforced on the server):
//   · an order is marked paid ONLY by complete(), after server-side validation (amount ≥ total, BDT, our tran_id)
//   · complete() starts with an update() on the order row (row lock held to commit) → redirect + IPN racing
//     each other are serialised and tickets are issued exactly once
//   · inventory converts held → sold inside the same transaction; if the seats were lost (hold expired and
//     re-sold while the customer sat on the gateway) the payment is recorded, the order fails and a refund is
//     queued automatically — we never double-sell and never keep money without tickets
//   · ticket QR codes are HMAC-derived (TicketSigner), never stored
// Access: the buyer (customer session or this browser's holder cookie), a guest key, CMS orders.view,
// or staff of the order's merchant. Anyone else gets 404.
const Db = use('App/Support/Db');
const DB = use('laranode/Support/Facades/DB');
const Order = use('App/Models/Order');
const OrderItem = use('App/Models/OrderItem');
const Payment = use('App/Models/Payment');
const PaymentEvent = use('App/Models/PaymentEvent');
const PaymentMethod = use('App/Models/PaymentMethod');
const Ticket = use('App/Models/Ticket');
const Refund = use('App/Models/Refund');
const SettlementLedger = use('App/Models/SettlementLedger');
const SeatHold = use('App/Models/SeatHold');
const ShowSeat = use('App/Models/ShowSeat');
const ShowZone = use('App/Models/ShowZone');
const EventShow = use('App/Models/EventShow');
const Promo = use('App/Models/Promo');
const Hasher = use('App/Security/Hasher');
const Redactor = use('App/Security/Redactor');
const IpResolver = use('App/Security/IpResolver');
const TicketSigner = use('App/Security/TicketSigner');
const Access = use('App/Support/Access');
const SettingsService = use('App/Services/SettingsService');
const PricingService = use('App/Services/PricingService');
const BlockService = use('App/Services/BlockService');
const AuditService = use('App/Services/AuditService');
const SecurityEventService = use('App/Services/SecurityEventService');
const GatewayCredentialService = use('App/Services/GatewayCredentialService');
const CatalogService = use('App/Services/CatalogService');
const HoldService = use('App/Services/HoldService');
const Sslcommerz = use('App/Gateways/SslcommerzGateway');
const { uuid, bookingRef } = use('App/Support/Ids');
const { HttpError, bad, missing, unauthorized, forbid } = use('App/Support/HttpError');

const { holdRow, assertOwner, holderHash } = HoldService._internals;
const { related, summary, labels, eventQuery } = CatalogService._internals;
const money = (v) => Number(v || 0);
const TICKET_STATES = ['paid', 'refund_requested', 'refunded', 'cancelled'];
const simulatorOn = () => !!config('ticketo')?.paymentSimulator && env('APP_ENV') !== 'production';
const gatewayActor = (ctx, gateway) => ({ ...ctx, user: null, actorType: gateway === 'simulator' ? 'system' : 'gateway', actorLabel: gateway });

// ------------------------------------------------------------------ access
// Plain row incl. guest_access_hash (hidden on the model) — needed for the access check only, never returned.
async function loadOrder(idOrRef) {
    return DB.table('orders as o').leftJoin('seat_holds as h', 'h.id', '=', 'o.hold_id').select('o.*', 'h.owner_hash')
        .whereRaw('(o.uuid = ? OR o.booking_ref = ?)', [String(idOrRef), String(idOrRef)]).first();
}
function canAccess(ctx, req, o, key) {
    // Customers: their account, or the booking's contact phone (verified by OTP sign-in).
    if (ctx.user?.type === 'customer' && (o.user_id === ctx.user.id || (ctx.user.phone && o.contact_phone === ctx.user.phone))) return true;
    // The buying browser (holder cookie) and the guest link lose access once the booking is transferred.
    if (o.owner_hash && o.owner_hash === holderHash(req)) return true;
    if (key && o.guest_access_hash && Hasher.verify(String(key), o.guest_access_hash, 'guest')) return true;
    if (ctx.guard === 'cms' && Access.can(ctx, 'orders.view')) return true;
    if (ctx.guard === 'merchant' && ctx.merchantId === o.merchant_id && Access.can(ctx, 'merchant.orders.view')) return true;
    return false;
}
async function accessible(ctx, req, idOrRef, key) {
    const o = await loadOrder(idOrRef);
    if (!o || !canAccess(ctx, req, o, key)) missing('Booking not found');
    return o;
}

// ------------------------------------------------------------------ view
async function view(o) {
    const [items, tickets, payment, refund, eventRows, venue] = await Promise.all([
        OrderItem.select('id', 'type', 'block_key', 'block_name', 'seat_code', 'tier_key', 'tier_name', 'qty', 'price').where('order_id', o.id).orderBy('id').get(),
        TICKET_STATES.includes(o.status) ? Ticket.select('uuid', 'label', 'tier_name', 'version', 'status', 'scanned_at').where('order_id', o.id).orderBy('id').get() : [],
        Payment.select('method_code', 'gateway', 'pg_mode', 'tran_id', 'status', 'val_id', 'bank_tran_id', 'card_brand', 'error', 'started_at', 'completed_at')
            .where('order_id', o.id).orderBy('id', 'desc').first(),
        Refund.select('kind', 'amount', 'fee', 'reason_text', 'status', 'requested_at', 'processed_at').where('order_id', o.id).orderBy('id', 'desc').first(),
        eventQuery().where('e.id', o.event_id).get(),
        DB.table('venues as v').join('cities as c', 'c.id', '=', 'v.city_id').select('v.slug', 'v.name', 'v.address', 'c.slug as city').where('v.id', o.venue_id || 0).first(),
    ]);
    const [show, hold] = await Promise.all([
        EventShow.select('uuid', 'starts_at', 'label').where('id', o.show_id).first(),
        o.hold_id ? SeatHold.select('uuid').where('id', o.hold_id).first() : null,
    ]);
    const R = await related(eventRows);
    const event = R ? summary(eventRows[0], R, await labels()) : null;
    return {
        id: o.uuid, ref: o.booking_ref, holdId: hold?.uuid || null, eventId: event?.id || null, showId: show?.uuid || null, showDate: show?.starts_at || null,
        venueId: venue?.slug || null, status: o.status, channel: o.channel, createdAt: o.created_at, paidAt: o.paid_at,
        items: items.map((i) => ({ type: i.type, blockId: i.block_key, blockName: i.block_name, seat: i.seat_code || undefined, tierId: i.tier_key, tierName: i.tier_name, price: money(i.price), qty: i.qty })),
        amounts: { subtotal: money(o.subtotal), discount: money(o.discount), fee: money(o.fee), feeExVat: money(o.fee_ex_vat), vat: money(o.vat), total: money(o.total) },
        promo: o.promo_code || null,
        contact: { name: o.contact_name, phone: o.contact_phone, email: o.contact_email },
        tickets: tickets.map((t) => ({ code: TicketSigner.sign(t.uuid, t.version), ref: TicketSigner.shortCode(t.uuid), label: t.label, tier: t.tier_name, status: t.status, scanned: !!t.scanned_at })),
        payment: payment ? {
            method: payment.method_code, gateway: payment.gateway, pgMode: payment.pg_mode, tranId: payment.tran_id, status: payment.status,
            ref: payment.bank_tran_id || payment.val_id || payment.tran_id, cardType: payment.card_brand, paidAt: payment.completed_at, lastError: payment.status === 'success' ? null : payment.error,
        } : null,
        refund: refund ? { kind: refund.kind, amount: money(refund.amount), fee: money(refund.fee), reason: refund.reason_text, status: refund.status, requestedAt: refund.requested_at, processedAt: refund.processed_at } : null,
        event, venue: venue ? { id: venue.slug, name: venue.name, city: venue.city, address: venue.address } : null,
    };
}

async function logPaymentEvent(ctx, { paymentId = null, orderId = null, source, payload, result }) {
    // Gateway payloads are redacted (secrets, PAN-like numbers, tokens) before storage — forensic trail only.
    // Outside any transaction: the forensic record survives a rollback of the payment work.
    await Db.outside(() => PaymentEvent.create({
        payment_id: paymentId, order_id: orderId, source, payload: Redactor.toJson(payload, 16384), result: result ? String(result).slice(0, 60) : null,
        ip: ctx?.ip ? IpResolver.toBinary(ctx.ip) : null, request_id: ctx?.requestId || null, received_at: new Date(),
    })).catch(() => {});
}

// ------------------------------------------------------------------ service
const OrderService = {
    accessible, view,

    async create(ctx, req, { holdId, contact = {}, promoCode } = {}) {
        const h = await holdRow(holdId);
        if (!h) bad('Your seat hold expired — please select seats again', 'hold_expired');
        assertOwner(h, ctx, req);
        const existing = await Order.where('hold_id', h.id).whereNotIn('status', ['failed', 'expired', 'cancelled']).orderBy('id', 'desc').first();
        if (existing) return { order: await view(existing) }; // idempotent: double-clicks / retries
        if (h.status !== 'active' || new Date(h.expires_at) <= new Date()) bad('Your seat hold expired — please select seats again', 'hold_expired');

        const name = String(contact.name || '').trim().replace(/\s+/g, ' ').slice(0, 150);
        const phone = BlockService.normPhone(contact.phone);
        const email = BlockService.normEmail(contact.email).slice(0, 190);
        if (name.length < 2) bad('Enter the ticket holder name');
        if (!phone) bad('Enter a valid Bangladeshi mobile number (01XXXXXXXXX)');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) bad('Enter a valid email address');
        const customer = ctx.user?.type === 'customer' ? ctx.user : null;
        if (!customer && !(await SettingsService.get('platform', 'allow_guest_checkout', true))) unauthorized('Please sign in to continue');
        // Checkout-scope blocks also apply to the buyer's phone / email (not only IP / device).
        const block = await BlockService.find(ctx, { scope: 'checkout', phone, email }).catch(() => null);
        if (block) { await BlockService.hit(block, ctx).catch(() => {}); forbid('This purchase cannot be completed. Contact support with your reference.', 'blocked'); }

        const event = await DB.table('events as e').join('merchants as m', 'm.id', '=', 'e.merchant_id')
            .select('e.id', 'e.uuid', 'e.merchant_id', 'e.category_id', 'e.subcategory_id', 'e.status', 'm.pg_mode').where('e.id', h.event_id).first();
        if (event.status !== 'published') bad('This event is not on sale');
        const pricing = await PricingService.price(event, money(h.subtotal), promoCode, { userId: customer?.id });
        if (pricing.promoError) bad(pricing.promoError, 'promo');

        const now = new Date();
        const payHold = Number(await SettingsService.get('platform', 'payment_hold_minutes', 15)) || 15;
        const holdUntil = new Date(Math.max(new Date(h.expires_at).getTime(), now.getTime() + payHold * 60000));
        const guestKey = Hasher.token(24);
        const orderUuid = uuid();
        const show = await EventShow.select('venue_id').where('id', h.show_id).first();
        const orderId = await Db.independent(async () => {
            const { id } = await Order.create({
                uuid: orderUuid, booking_ref: bookingRef('TK'), hold_id: h.id, user_id: customer?.id || null, merchant_id: event.merchant_id, event_id: event.id,
                show_id: h.show_id, venue_id: show.venue_id, channel: 'web', status: 'pending_payment',
                contact_name: name, contact_phone: phone, contact_email: email,
                subtotal: pricing.subtotal, discount: pricing.discount, fee: pricing.fee, fee_ex_vat: pricing.feeExVat, vat: pricing.vat, total: pricing.total,
                commission_pct: pricing.commissionPct, commission: pricing.commission, merchant_net: pricing.merchantNet,
                promo_id: pricing._promoId, promo_code: pricing.promo, pg_mode: event.pg_mode,
                guest_access_hash: Hasher.hash(guestKey, 'guest'), created_ip: ctx.ip ? IpResolver.toBinary(ctx.ip) : null,
            });
            const items = await DB.table('seat_hold_items').select('show_seat_id', 'show_zone_id', 'block_key', 'block_name', 'seat_code', 'tier_key', 'tier_name', 'qty', 'price')
                .where('hold_id', h.id).get();
            await Db.insertMany('order_items', items.map((i) => ({ order_id: id, type: i.seat_code ? 'seat' : 'zone', ...i })));
            // Keep the seats while the customer is on the payment page.
            await SeatHold.where('id', h.id).update({ expires_at: holdUntil, updated_at: now });
            await ShowSeat.where('hold_id', h.id).where('status', 'held').update({ hold_expires_at: holdUntil });
            return id;
        });
        await AuditService.record(ctx, 'ORDER_CREATED', { type: 'order', id: orderId, label: orderUuid }, { meta: { total: pricing.total, promo: pricing.promo }, merchantId: event.merchant_id });
        if (pricing.total === 0) await OrderService.complete(ctx, { orderId, gateway: 'free', method: 'free', success: true, amount: 0, currency: 'BDT' });
        // guestKey is returned once, for the confirmation link (email/SMS); only its hash is stored.
        return { order: await view(await loadOrder(orderUuid)), accessKey: guestKey };
    },

    async startPayment(ctx, req, idOrRef, methodCode) {
        const o = await accessible(ctx, req, idOrRef);
        if (o.status === 'paid') return { alreadyPaid: true, orderId: o.uuid };
        if (o.status !== 'pending_payment') bad(`This booking is ${o.status.replace('_', ' ')}`);
        const hold = await SeatHold.select('id', 'expires_at').where('id', o.hold_id || 0).first();
        if (!hold || new Date(hold.expires_at) <= new Date()) {
            await Order.where('id', o.id).update({ status: 'expired', updated_at: new Date() });
            bad('Seat hold expired before payment — please book again', 'hold_expired');
        }
        const m = await PaymentMethod.select('code', 'name', 'gateway', 'multi_card_name').where('code', String(methodCode || '')).where('channel', 'online').where('is_enabled', 1).first()
            || bad('Choose a payment method');
        const attempts = Number(await Payment.where('order_id', o.id).count());
        if (attempts >= 10) bad('Too many payment attempts for this booking — please book again');
        const tranId = `${o.booking_ref}-${attempts + 1}`;

        let gateway = m.gateway;
        // The event's own store, else the merchant's default store (there is no platform store).
        const resolved = gateway === 'sslcommerz' ? await GatewayCredentialService.resolve(ctx, { gateway, merchantId: o.merchant_id, eventId: o.event_id }) : null;
        if (!resolved) {
            if (!simulatorOn()) bad(`${m.name} is not available right now. Please choose another method.`, 'gateway_unavailable');
            gateway = 'simulator'; // local / staging only (PAYMENT_SIMULATOR, never in production)
        }
        if (gateway === 'sslcommerz' && !(money(o.total) >= Sslcommerz.MIN_AMOUNT && money(o.total) <= Sslcommerz.MAX_AMOUNT)) {
            bad(`Online payment is available for ৳${Sslcommerz.MIN_AMOUNT}–৳${Sslcommerz.MAX_AMOUNT.toLocaleString()} per booking`, 'amount_out_of_range');
        }
        const now = new Date();
        const { id: paymentId } = await Payment.create({
            order_id: o.id, attempt: attempts + 1, method_code: m.code, gateway, pg_mode: resolved?.pgMode || 'platform', credential_source: resolved?.source || null, tran_id: tranId,
            status: 'initiated', amount: o.total, currency: 'BDT', started_at: now,
        });
        if (gateway === 'simulator') {
            await logPaymentEvent(ctx, { paymentId, orderId: o.id, source: 'init', payload: { gateway, method: m.code }, result: 'simulator' });
            return { redirectUrl: `/pay/simulate/${o.uuid}?m=${encodeURIComponent(m.code)}`, gateway: 'simulator' };
        }

        const cfg = config('ticketo');
        const cb = `${cfg.publicUrl}/api/pg/sslcommerz`;
        const event = await DB.table('events as e').join('merchants as m', 'm.id', '=', 'e.merchant_id').select('e.uuid', 'e.title', 'm.uuid as merchant_uuid').where('e.id', o.event_id).first();
        const qty = Number(await OrderItem.where('order_id', o.id).sum('qty'));
        try {
            const r = await Sslcommerz.init({
                creds: resolved.creds, tranId, amount: o.total, itemCount: qty, productName: event.title, method: { multiCardName: m.multi_card_name },
                contact: { name: o.contact_name, email: o.contact_email, phone: o.contact_phone },
                urls: { success: `${cb}/success/${o.uuid}`, fail: `${cb}/fail/${o.uuid}`, cancel: `${cb}/cancel/${o.uuid}`, ipn: cfg.ipnBaseUrl ? `${cfg.ipnBaseUrl}/api/pg/sslcommerz/ipn` : null },
                refs: { order: o.uuid, merchant: event.merchant_uuid, event: event.uuid },
            });
            await Payment.where('id', paymentId).update({ status: 'redirected' });
            await logPaymentEvent(ctx, { paymentId, orderId: o.id, source: 'init', payload: { gateway, method: m.code, tranId }, result: 'session_created' });
            return { redirectUrl: r.url, gateway };
        } catch (e) {
            const msg = Redactor.errorMessage(e.message).slice(0, 255);
            await Payment.where('id', paymentId).update({ status: 'failed', error: msg, completed_at: new Date() });
            await logPaymentEvent(ctx, { paymentId, orderId: o.id, source: 'init', payload: { gateway, mode: Sslcommerz.mode(), credentials: resolved.source, error: msg }, result: 'init_failed' });
            // A rejected store (wrong / inactive credentials, sandbox vs live mismatch) is the merchant's setup, not the buyer's:
            // record it and show a neutral message. The real reason is in payment_events / security_events.
            if (/credential|de-?active|store/i.test(msg)) {
                SecurityEventService.record(ctx, 'gateway_misconfigured', { details: { gateway, mode: Sslcommerz.mode(), source: resolved.source, merchant_id: o.merchant_id, event_id: o.event_id, reason: msg } });
                throw new HttpError(503, 'Online payment is temporarily unavailable. Please try again later or contact support.', 'gateway_unavailable');
            }
            throw new HttpError(502, 'The payment gateway could not be reached. Please try again or choose another method.', 'gateway');
        }
    },

    /**
     * The single place an order becomes paid. Idempotent (row lock). `success` must already be the result of
     * server-side validation; amount/currency are re-checked here against the stored order.
     */
    async complete(ctx, { orderId, paymentId = null, gateway, method = null, success, amount, currency = 'BDT', valId = null, bankTranId = null, cardBrand = null, riskLevel = null, error = null }) {
        const actor = gatewayActor(ctx, gateway);
        const now = new Date();
        let outcome;
        try {
            outcome = await Db.independent(async () => {
                // Row lock first (see header), then read the order as it is now.
                // (changed-row count can be 0 within the same second, so existence is checked by the read)
                await Order.where('id', orderId).update({ updated_at: now });
                const o = await DB.table('orders').where('id', orderId).first();
                if (!o) missing('Order not found');
                if (o.status === 'paid') return { state: 'already_paid', o };
                let pid = paymentId;
                if (!pid) {
                    // No gateway payment row (free orders): reuse the synthetic one on retries (tran_id is unique).
                    const tranId = `${o.booking_ref}-${gateway}`;
                    pid = (await Payment.select('id').where('tran_id', tranId).first())?.id
                        || (await Payment.create({ order_id: o.id, attempt: 0, method_code: method || gateway, gateway, pg_mode: o.pg_mode || 'platform', tran_id: tranId, status: 'initiated', amount: o.total, currency: 'BDT', started_at: now })).id;
                }

                const amountOk = Number(amount) + 0.001 >= money(o.total);
                if (!success || !amountOk || currency !== 'BDT') {
                    const why = !success ? (error || 'Payment failed') : !amountOk ? `Amount mismatch (${amount})` : `Currency mismatch (${currency})`;
                    await Payment.where('id', pid).update({ status: error === 'Cancelled by customer' ? 'cancelled' : 'failed', error: String(why).slice(0, 255), val_id: valId, completed_at: now });
                    return { state: 'failed', o, why, suspicious: success && (!amountOk || currency !== 'BDT') };
                }
                if (!['pending_payment', 'expired', 'failed'].includes(o.status)) return { state: 'ignored', o };

                // Convert inventory held → sold. Any shortfall means the seats were lost: roll back and refund.
                const items = await DB.table('order_items').select('id', 'type', 'show_seat_id', 'show_zone_id', 'block_name', 'seat_code', 'tier_key', 'tier_name', 'qty').where('order_id', o.id).get();
                const lost = () => Object.assign(new Error('inventory_lost'), { inventoryLost: true, pid });
                const seatIds = items.filter((i) => i.type === 'seat').map((i) => i.show_seat_id);
                if (seatIds.length) {
                    // Conditional: only seats still held by this order's hold become sold.
                    const n = await ShowSeat.query().whereIn('id', seatIds).where('hold_id', o.hold_id || 0).where('status', 'held')
                        .update({ status: 'sold', order_id: o.id, hold_expires_at: null, updated_at: now });
                    if (n !== seatIds.length) throw lost();
                }
                for (const z of items.filter((i) => i.type === 'zone')) {
                    const n = await ShowZone.where('id', z.show_zone_id).whereRaw('sold + blocked + ? <= capacity', [z.qty]).increment('sold', z.qty, { updated_at: now });
                    if (n !== 1) throw lost();
                }
                // Tickets: one per seat, one per GA place.
                const tickets = items.flatMap((i) => Array.from({ length: i.type === 'seat' ? 1 : i.qty }, (_, k) => ({
                    uuid: uuid(), order_id: o.id, order_item_id: i.id, show_seat_id: i.show_seat_id, tier_key: i.tier_key, tier_name: i.tier_name, version: 1, status: 'valid', created_at: now,
                    label: i.type === 'seat' ? `${i.block_name} · ${i.seat_code}` : `${i.block_name}${i.qty > 1 ? ` #${k + 1}` : ''}`,
                })));
                await Db.insertMany('tickets', tickets);
                await Order.where('id', o.id).update({ status: 'paid', paid_at: now, updated_at: now });
                await Payment.where('id', pid).update({ status: 'success', val_id: valId, bank_tran_id: bankTranId, card_brand: cardBrand ? String(cardBrand).slice(0, 60) : null, risk_level: riskLevel === null ? null : String(riskLevel).slice(0, 10), error: null, completed_at: now });
                if (o.hold_id) await SeatHold.where('id', o.hold_id).update({ status: 'converted', updated_at: now });
                if (o.promo_id) {
                    // Unique (promo, order): count the use only when the redemption row is new.
                    const added = await DB.table('promo_redemptions').insertOrIgnore({ promo_id: o.promo_id, order_id: o.id, user_id: o.user_id, phone: o.contact_phone, discount: o.discount, created_at: now });
                    if (added) await Promo.withTrashed().where('id', o.promo_id).increment('used_count');
                }
                // Settlement ledger. Platform mode: Ticketo collected → owes the merchant the ticket value, minus commission.
                // Direct mode: the merchant's gateway collected → merchant owes Ticketo commission + convenience fee.
                const base = money(o.subtotal) - money(o.discount);
                const direct = o.pg_mode === 'direct';
                const ledger = direct
                    ? [['commission', 'receivable_from_merchant', money(o.commission)], ['fee', 'receivable_from_merchant', money(o.fee)]]
                    : [['gross', 'payable_to_merchant', base], ['commission', 'receivable_from_merchant', money(o.commission)]];
                for (const [entry_type, direction, amt] of ledger) if (amt > 0) await SettlementLedger.create({ merchant_id: o.merchant_id, order_id: o.id, entry_type, direction, amount: amt, pg_mode: direct ? 'direct' : 'platform', created_at: now });
                return { state: 'paid', o, tickets: tickets.length };
            });
        } catch (e) {
            if (!e.inventoryLost) throw e;
            // Paid, but the seats are gone: record the payment, fail the order and queue a full refund for finance.
            outcome = await Db.independent(async () => {
                await Order.where('id', orderId).update({ status: 'refund_requested', updated_at: now }); // also the row lock
                const o = await DB.table('orders').where('id', orderId).first();
                await Payment.where('id', e.pid).update({ status: 'success', val_id: valId, bank_tran_id: bankTranId, card_brand: cardBrand, completed_at: now, error: 'Seats no longer available — refund queued' });
                await Refund.create({ order_id: o.id, kind: 'refund', amount: o.total, fee: 0, reason_code: 'inventory_lost', reason_text: 'Seats were released before payment completed — full refund', status: 'requested', requested_at: now });
                return { state: 'inventory_lost', o };
            });
        }

        const subject = { type: 'order', id: outcome.o.id, label: outcome.o.booking_ref };
        if (outcome.state === 'paid') await AuditService.record(actor, 'ORDER_PAID', subject, { meta: { gateway, amount: Number(amount), tickets: outcome.tickets }, merchantId: outcome.o.merchant_id });
        else if (outcome.state === 'failed') {
            await AuditService.record(actor, 'PAYMENT_FAILED', subject, { meta: { gateway, reason: outcome.why }, merchantId: outcome.o.merchant_id });
            if (outcome.suspicious) SecurityEventService.record(ctx, 'payment_validation_failed', { details: { order: outcome.o.booking_ref, gateway, reason: outcome.why } });
        } else if (outcome.state === 'inventory_lost') {
            await AuditService.record(actor, 'ORDER_INVENTORY_LOST', subject, { meta: { gateway, amount: Number(amount), action: 'refund_queued' }, merchantId: outcome.o.merchant_id });
        }
        return outcome;
    },

    /** Sandbox checkout (local / staging only; the route does not exist in production). */
    async simulate(ctx, req, idOrRef, outcome) {
        if (!simulatorOn()) missing();
        const o = await accessible(ctx, req, idOrRef);
        if (o.status !== 'pending_payment') return view(await loadOrder(o.uuid));
        const p = await Payment.select('id', 'method_code').where('order_id', o.id).where('gateway', 'simulator').where('status', 'initiated').orderBy('id', 'desc').first();
        if (!p) bad('Start the payment first');
        const ok = outcome === 'success';
        await logPaymentEvent(ctx, { paymentId: p.id, orderId: o.id, source: 'simulator', payload: { outcome }, result: outcome });
        await OrderService.complete(ctx, { orderId: o.id, paymentId: p.id, gateway: 'simulator', success: ok, amount: o.total, currency: 'BDT', valId: ok ? `SIM${Date.now()}` : null, error: outcome === 'cancel' ? 'Cancelled by customer' : ok ? null : 'Declined by issuer (simulated)' });
        return view(await loadOrder(o.uuid));
    },

    /** SSLCOMMERZ success redirect / IPN: validate server-to-server, then complete. */
    /**
     * SSLCOMMERZ success redirect / IPN. `body` is the raw POST: for IPN its verify_sign must match
     * (checked with the store password of the account that owns this tran_id); failed / cancelled IPNs
     * close the attempt; VALID ones are always re-validated with the Validation API before completing.
     */
    async sslcommerzValidated(ctx, { orderUuid = null, tranId, valId, source, body = null }) {
        const p = await DB.table('payments as p').join('orders as o', 'o.id', '=', 'p.order_id')
            .select('p.id', 'p.order_id', 'p.status', 'p.tran_id', 'p.credential_source', 'o.uuid', 'o.merchant_id', 'o.event_id', 'o.total')
            .where('p.tran_id', String(tranId || '')).where('p.gateway', 'sslcommerz').first();
        if (!p || (orderUuid && p.uuid !== orderUuid)) {
            await logPaymentEvent(ctx, { source, payload: { tranId, orderUuid }, result: 'unknown_tran' });
            SecurityEventService.record(ctx, 'payment_validation_failed', { details: { reason: 'unknown tran_id', tranId: String(tranId || '').slice(0, 60), source } });
            return { ok: false, orderUuid, reason: 'unknown' };
        }
        // Same store that opened the session (even if the gateway was switched off or the event went back to the default since).
        const resolved = await GatewayCredentialService.resolve(ctx, { gateway: 'sslcommerz', merchantId: p.merchant_id, eventId: p.event_id, source: p.credential_source || null, checkEnabled: false });
        if (!resolved) return { ok: false, orderUuid: p.uuid, reason: 'gateway_unavailable' };
        if (source === 'ipn') {
            if (!Sslcommerz.verifySignature(body, resolved.creds.storePassword)) {
                await logPaymentEvent(ctx, { paymentId: p.id, orderId: p.order_id, source, payload: { tranId, status: body?.status }, result: 'bad_signature' });
                SecurityEventService.record(ctx, 'payment_validation_failed', { details: { reason: 'IPN signature mismatch', tranId: String(tranId).slice(0, 60) } });
                return { ok: false, orderUuid: p.uuid, reason: 'bad_signature' };
            }
            const st = String(body?.status || '').toUpperCase();
            if (st !== 'VALID' && st !== 'VALIDATED') {
                await OrderService.sslcommerzFailed(ctx, { orderUuid: p.uuid, tranId, kind: st === 'CANCELLED' ? 'cancel' : 'fail', payload: { status: st, source: 'ipn', error: String(body?.error || '').slice(0, 120) } });
                return { ok: false, orderUuid: p.uuid, reason: st.toLowerCase() || 'failed' };
            }
        }
        if (!valId) return { ok: false, orderUuid: p.uuid, reason: 'missing_val_id' };
        let v;
        try { v = await Sslcommerz.validate({ valId: String(valId || ''), creds: resolved.creds }); } catch (e) {
            await logPaymentEvent(ctx, { paymentId: p.id, orderId: p.order_id, source: 'validate', payload: { error: Redactor.errorMessage(e.message) }, result: 'validate_error' });
            return { ok: false, orderUuid: p.uuid, reason: 'validation_unreachable' }; // stays pending; IPN / reconciliation retries
        }
        await logPaymentEvent(ctx, { paymentId: p.id, orderId: p.order_id, source: 'validate', payload: { status: v.status, tranId: v.tranId, amount: v.amount, currency: v.currency, riskLevel: v.riskLevel, via: source }, result: v.status });
        // Our tran_id and our order reference (value_a) must both come back; amount / currency are checked in complete().
        const success = v.valid && v.tranId === p.tran_id && (!v.orderRef || v.orderRef === p.uuid);
        // risk_level 1 = SSLCOMMERZ flags the card as high risk: tickets are issued, operators review it.
        if (success && String(v.riskLevel) === '1') {
            SecurityEventService.record(ctx, 'payment_high_risk', { details: { tranId: p.tran_id, riskTitle: v.riskTitle, orderId: p.order_id } });
        }
        const r = await OrderService.complete(ctx, {
            orderId: p.order_id, paymentId: p.id, gateway: 'sslcommerz', success, amount: v.amount, currency: v.currency || 'BDT',
            valId: String(valId).slice(0, 120), bankTranId: v.bankTranId, cardBrand: v.cardBrand, riskLevel: v.riskLevel, error: success ? null : `Validation ${v.status}`,
        });
        return { ok: ['paid', 'already_paid'].includes(r.state), orderUuid: p.uuid, reason: r.state };
    },

    async sslcommerzFailed(ctx, { orderUuid, tranId, kind, payload }) {
        const p = await DB.table('payments as p').join('orders as o', 'o.id', '=', 'p.order_id').select('p.id', 'p.order_id')
            .where('p.tran_id', String(tranId || '')).where('o.uuid', String(orderUuid)).where('p.gateway', 'sslcommerz').first();
        await logPaymentEvent(ctx, { paymentId: p?.id, orderId: p?.order_id, source: 'redirect', payload, result: kind });
        if (p) {
            await Payment.where('id', p.id).whereIn('status', ['initiated', 'redirected'])
                .update({ status: kind === 'cancel' ? 'cancelled' : 'failed', error: kind === 'cancel' ? 'Cancelled by customer' : 'Declined', completed_at: new Date() });
        }
    },

    logPaymentEvent, simulatorOn,
};

module.exports = OrderService;
