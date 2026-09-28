const Controller = use('App/Http/Controllers/Controller');
const HoldService = use('App/Services/HoldService');

// Seat holds for the current browser / customer. Never cached. Cookies go on the raw Express response.
const json = (res, data, status = 200) => { res.header('Cache-Control', 'no-store'); return res.status(status).json(data); };

class HoldController extends Controller {
    async store(req, res) { return json(res, await HoldService.create(req.ctx, req.getExpressRequest(), res.res, req.only(['showId', 'seats', 'zones'])), 201); }
    async show(holdId, req, res) { return json(res, await HoldService.get(req.ctx, req.getExpressRequest(), holdId)); }
    async destroy(holdId, req, res) { return json(res, await HoldService.release(req.ctx, req.getExpressRequest(), holdId)); }
    async quote(holdId, req, res) { return json(res, await HoldService.quote(req.ctx, req.getExpressRequest(), holdId, req.input('promoCode'))); }
}

module.exports = HoldController;
