const Controller = use('App/Http/Controllers/Controller');
const EmbedService = use('App/Services/EmbedService');
const CatalogService = use('App/Services/CatalogService');
const HoldService = use('App/Services/HoldService');
const OrderService = use('App/Services/OrderService');
const Merchant = use('App/Models/Merchant');
const Event = use('App/Models/Event');
const DB = use('laranode/Support/Facades/DB');
const { missing, bad } = use('App/Support/HttpError');

// Published events of an active merchant only. Scope is checked against the token, never the URL.
const scoped = (link, key) => {
    const q = DB.table('events as e').join('merchants as m', 'm.id', '=', 'e.merchant_id')
        .select('e.uuid', 'm.uuid as merchant_uuid')
        .whereNull('e.deleted_at').where('e.status', 'published').where('m.status', 'active').whereNull('m.deleted_at')
        .whereRaw('(e.slug = ? OR e.uuid = ?)', [String(key), String(key)]);
    return (link.scope === 'merchant' ? q.where('m.uuid', link.id) : q.where('e.uuid', link.id)).first();
};

const linkOf = (token) => EmbedService.verify(token) || missing('Link not found');
const json = (res, data, status = 200) => { res.header('Cache-Control', 'no-store'); return res.status(status).json(data); };

// A show, hold or order must belong to the link's merchant (merchant link) or event (event link). Any mismatch is a 404.
async function inScope(link, table, uuid) {
    const row = await DB.table(`${table} as x`).join('events as e', 'e.id', '=', 'x.event_id').join('merchants as m', 'm.id', '=', 'e.merchant_id')
        .select('e.uuid as event_uuid', 'm.uuid as merchant_uuid').where('x.uuid', String(uuid || '')).first();
    const ok = row && (link.scope === 'merchant' ? row.merchant_uuid === link.id : row.event_uuid === link.id);
    if (!ok) missing('Not found');
    return row;
}

class EmbedController extends Controller {
    // GET /api/embed/:token — read-only list for a merchant link, or the single event for an event link.
    async show(token, req, res) {
        const link = EmbedService.verify(token);
        if (!link) missing('Link not found');
        res.header('Cache-Control', 'no-store');
        if (link.scope === 'merchant') return res.json({ scope: 'merchant', events: await CatalogService.list({ merchant: link.id }) });
        const row = await scoped(link, link.id);
        if (!row) missing('Event not found');
        return res.json({ scope: 'event', event: await CatalogService.detail(row.uuid) });
    }

    // GET /api/embed/:token/events/:slug — one event inside a merchant link (or the event link's own event).
    async event(token, slug, req, res) {
        const link = EmbedService.verify(token);
        if (!link) missing('Link not found');
        const row = await scoped(link, slug);
        if (!row) missing('Event not found');
        res.header('Cache-Control', 'no-store');
        return res.json(await CatalogService.detail(row.uuid));
    }

    // Embedded booking. Same services as the public API; the token decides which shows, holds and orders are allowed.
    async availability(token, showId, req, res) {
        await inScope(linkOf(token), 'event_shows', showId);
        res.header('Cache-Control', 'no-store');
        return res.json(await CatalogService.availability(showId));
    }

    async hold(token, req, res) {
        const body = req.only(['showId', 'seats', 'zones']);
        await inScope(linkOf(token), 'event_shows', body.showId);
        return json(res, await HoldService.create(req.ctx, req.getExpressRequest(), res.res, body), 201);
    }

    async showHold(token, holdId, req, res) {
        await inScope(linkOf(token), 'seat_holds', holdId);
        return json(res, await HoldService.get(req.ctx, req.getExpressRequest(), holdId));
    }

    async releaseHold(token, holdId, req, res) {
        await inScope(linkOf(token), 'seat_holds', holdId);
        return json(res, await HoldService.release(req.ctx, req.getExpressRequest(), holdId));
    }

    async quote(token, holdId, req, res) {
        await inScope(linkOf(token), 'seat_holds', holdId);
        return json(res, await HoldService.quote(req.ctx, req.getExpressRequest(), holdId, req.input('promoCode')));
    }

    async order(token, req, res) {
        const link = linkOf(token);
        await inScope(link, 'seat_holds', req.input('holdId'));
        // Stored as JSON {s, id, o} (not the token): the link is re-issued on return, so no bearer credential sits in the orders table.
        const embedReturn = JSON.stringify({ s: link.scope, id: link.id, o: link.origins });
        const r = await OrderService.create(req.ctx, req.getExpressRequest(), { ...req.only(['holdId', 'contact', 'promoCode']), embedReturn });
        return json(res, { ...r.order, ...(r.accessKey ? { accessKey: r.accessKey } : {}) }, 201);
    }

    async showOrder(token, orderId, req, res) {
        await inScope(linkOf(token), 'orders', orderId);
        const o = await OrderService.accessible(req.ctx, req.getExpressRequest(), orderId, req.query('k'));
        return json(res, await OrderService.view(o));
    }

    async pay(token, orderId, req, res) {
        await inScope(linkOf(token), 'orders', orderId);
        const r = await OrderService.startPayment(req.ctx, req.getExpressRequest(), orderId, req.input('method'));
        // Sandbox checkout page: keep it inside the embed. Real gateway URLs are absolute and returned as they are.
        if (r.redirectUrl?.startsWith('/pay/simulate/')) r.redirectUrl = `/embed/${token}${r.redirectUrl}`;
        return json(res, r);
    }

    async simulate(token, orderId, req, res) {
        await inScope(linkOf(token), 'orders', orderId);
        return json(res, await OrderService.simulate(req.ctx, req.getExpressRequest(), orderId, req.input('outcome')));
    }

    // GET /api/merchant/embed-links — what the merchant can embed: the whole merchant, and each published event.
    async merchantLinks(req, res) {
        const merchant = await Merchant.select('uuid', 'name').where('id', req.ctx.merchantId).first();
        const events = await Event.select('uuid', 'title').where('merchant_id', req.ctx.merchantId)
            .whereNull('deleted_at').where('status', 'published').orderBy('id', 'desc').get();
        res.header('Cache-Control', 'no-store');
        return res.json({
            merchant: { name: merchant.name, uuid: merchant.uuid },
            events: events.map((e) => ({ title: e.title, uuid: e.uuid })),
        });
    }

    // POST /api/merchant/embed-links { scope: 'merchant'|'event', eventUuid?, origins } — signs a link for the sites given.
    // Stateless: nothing is stored, and the same inputs give the same link.
    async createLink(req, res) {
        const { scope, eventUuid } = req.only(['scope', 'eventUuid']);
        const sites = EmbedService.normalizeOrigins(req.input('origins'));
        let id;
        if (scope === 'merchant') {
            id = (await Merchant.select('uuid').where('id', req.ctx.merchantId).first()).uuid;
        } else if (scope === 'event') {
            const e = await Event.select('uuid').where('uuid', String(eventUuid || '')).where('merchant_id', req.ctx.merchantId)
                .whereNull('deleted_at').where('status', 'published').first();
            if (!e) missing('Event not found');
            id = e.uuid;
        } else {
            bad('Choose a merchant or an event');
        }
        res.header('Cache-Control', 'no-store');
        return res.json({ url: `${config('ticketo').publicUrl}/embed/${EmbedService.issue(scope, id, sites)}`, sites });
    }
}

module.exports = EmbedController;
