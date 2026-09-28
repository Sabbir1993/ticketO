// Gate entry (POST /api/gate/scan) and live attendance (GET /api/gate/stats).
//   · the QR is an HMAC-signed code (TicketSigner); a forged or mistyped code never reaches the DB lookup
//   · a transferred ticket's old QR carries an old version → void
//   · first entry is a conditional update (scanned_at IS NULL), so two gates scanning the same ticket
//     at the same moment give one "valid" and one "duplicate"
//   · every scan is logged in ticket_scans with a fingerprint of the scanned text (never the code itself)
const DB = use('laranode/Support/Facades/DB');
const Ticket = use('App/Models/Ticket');
const TicketScan = use('App/Models/TicketScan');
const Event = use('App/Models/Event');
const Hasher = use('App/Security/Hasher');
const IpResolver = use('App/Security/IpResolver');
const TicketSigner = use('App/Security/TicketSigner');
const SecurityEventService = use('App/Services/SecurityEventService');
const { bad } = use('App/Support/HttpError');

const PAID = ['paid'];

async function eventIdFor(ctx, eventUuid) {
    if (!eventUuid) return null;
    const e = await Event.select('id').where('uuid', String(eventUuid)).where('merchant_id', ctx.merchantId || 0).first();
    return e ? e.id : -1; // unknown / foreign event → matches nothing
}

const GateService = {
    async scan(ctx, { code, gate, eventId } = {}) {
        const raw = String(code || '').trim().slice(0, 200);
        if (!raw) bad('Scan or type a ticket code');
        const gateName = String(gate || 'Gate 1').trim().slice(0, 80);
        const filterEvent = await eventIdFor(ctx, eventId);
        const now = new Date();
        const log = (result, t = null) => TicketScan.create({
            ticket_id: t?.id || null, event_id: t?.event_id || (filterEvent > 0 ? filterEvent : null), merchant_id: t?.merchant_id || ctx.merchantId,
            code_fingerprint: Hasher.fingerprint(raw), gate_id: t?.gate_id || null, gate_name: gateName, result, user_id: ctx.user.id,
            device_hash: ctx.deviceHash || null, ip: ctx.ip ? IpResolver.toBinary(ctx.ip) : null, request_id: ctx.requestId || null, scanned_at: now,
        });
        const out = (status, t = null, extra = {}) => ({
            status, code: t ? TicketSigner.shortCode(t.uuid) : raw.slice(0, 24),
            ...(t ? { ticket: { label: t.label, scannedAt: t.scanned_at, gate: t.gate_name || null }, booking: { event: { title: t.event_title }, contact: { name: t.contact_name } } } : {}),
            ...extra,
        });

        const parsed = TicketSigner.verify(raw);
        if (!parsed) {
            await log('invalid');
            SecurityEventService.record(ctx, 'invalid_ticket_scan', { details: { gate: gateName, reason: 'signature' } });
            return out('invalid', null, { message: 'Not a valid Ticketo ticket' });
        }
        const t = await DB.table('tickets as t').join('orders as o', 'o.id', '=', 't.order_id').join('events as e', 'e.id', '=', 'o.event_id')
            .leftJoin('event_shows as s', 's.id', '=', 'o.show_id')
            .select('t.id', 't.uuid', 't.label', 't.version', 't.status', 't.scanned_at', 'o.status as order_status', 'o.merchant_id', 'o.event_id', 'o.contact_name', 'e.title as event_title', 's.venue_id')
            .where('t.uuid', parsed.uuid).first();
        if (!t) { await log('invalid'); return out('invalid', null, { message: 'Ticket not found' }); }
        if (t.merchant_id !== ctx.merchantId) {
            await log('invalid');
            SecurityEventService.record(ctx, 'invalid_ticket_scan', { details: { gate: gateName, reason: 'other_merchant' } });
            return out('invalid', null, { message: 'Ticket belongs to another organiser' });
        }
        const gateRow = t.venue_id ? await DB.table('venue_gates').select('id').where('venue_id', t.venue_id).where('name', gateName).first() : null;
        t.gate_id = gateRow?.id || null;
        if (filterEvent && t.event_id !== filterEvent) { await log('wrong_event', t); return out('wrong_event', t); }
        if (parsed.version !== t.version) { await log('void', t); return out('void', t, { message: 'This QR was replaced after a transfer' }); }
        if (!PAID.includes(t.order_status) || t.status !== 'valid') { await log('void', t); return out('void', t, { message: t.order_status === 'refund_requested' ? 'Refund requested for this booking' : undefined }); }
        if (t.scanned_at) {
            const first = await TicketScan.select('gate_name').where('ticket_id', t.id).where('result', 'valid').orderBy('id').first();
            t.gate_name = first?.gate_name; await log('duplicate', t); return out('duplicate', t);
        }
        const won = await Ticket.where('id', t.id).whereNull('scanned_at').update({ scanned_at: now, gate_id: t.gate_id, scanned_by: ctx.user.id });
        if (!won) {
            const again = await Ticket.select('scanned_at').where('id', t.id).first();
            t.scanned_at = again.scanned_at; await log('duplicate', t); return out('duplicate', t);
        }
        t.scanned_at = now; t.gate_name = gateName;
        await log('valid', t);
        return out('valid', t);
    },

    async stats(ctx, { eventId } = {}) {
        const filterEvent = await eventIdFor(ctx, eventId);
        const tickets = DB.table('tickets as t').join('orders as o', 'o.id', '=', 't.order_id').where('o.merchant_id', ctx.merchantId).whereIn('o.status', PAID).where('t.status', 'valid');
        if (filterEvent) tickets.where('o.event_id', filterEvent);
        const counts = await tickets.selectRaw('COUNT(*) as issued, SUM(t.scanned_at IS NOT NULL) as inside').first();
        const scans = DB.table('ticket_scans as sc').leftJoin('tickets as t', 't.id', '=', 'sc.ticket_id')
            .select('sc.scanned_at', 'sc.gate_name', 'sc.result', 't.uuid').where('sc.merchant_id', ctx.merchantId);
        if (filterEvent) scans.where('sc.event_id', filterEvent);
        const recentScans = await scans.orderBy('sc.id', 'desc').limit(50).get();
        const byGateRows = DB.table('ticket_scans').select('gate_name').selectRaw('COUNT(*) as n').where('merchant_id', ctx.merchantId).where('result', 'valid');
        if (filterEvent) byGateRows.where('event_id', filterEvent);
        const byGate = Object.fromEntries((await byGateRows.groupBy('gate_name').get()).map((r) => [r.gate_name, Number(r.n)]));

        // Demo helper ("tap to test"): live ticket codes are only listed outside production.
        let recentTickets = [];
        if (env('APP_ENV') !== 'production') {
            const q = DB.table('tickets as t').join('orders as o', 'o.id', '=', 't.order_id').join('events as e', 'e.id', '=', 'o.event_id')
                .select('t.uuid', 't.version', 't.label', 't.scanned_at', 'e.title').where('o.merchant_id', ctx.merchantId).whereIn('o.status', PAID);
            if (filterEvent) q.where('o.event_id', filterEvent);
            recentTickets = (await q.orderBy('t.id', 'desc').limit(10).get()).map((r) => ({ code: TicketSigner.sign(r.uuid, r.version), label: r.label, event: r.title, scanned: !!r.scanned_at }));
        }
        return {
            issued: Number(counts?.issued || 0), inside: Number(counts?.inside || 0), byGate,
            scans: recentScans.map((s) => ({ at: s.scanned_at, code: s.uuid ? TicketSigner.shortCode(s.uuid) : '—', gate: s.gate_name, status: s.result })),
            recentTickets,
        };
    },
};

module.exports = GateService;
