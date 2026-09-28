const Controller = use('App/Http/Controllers/Controller');
const PosService = use('App/Services/PosService');
const GateService = use('App/Services/GateService');

// Venue operations: box office and gate. Merchant staff with pos.sell / gate.scan (routes/api.js).
const json = (res, data, status = 200) => { res.header('Cache-Control', 'no-store'); return res.status(status).json(data); };

class OpsController extends Controller {
    async posSale(req, res) { return json(res, await PosService.sale(req.ctx, req.only(['showId', 'seats', 'zones', 'method', 'phone', 'name'])), 201); }
    async scan(req, res) { return json(res, await GateService.scan(req.ctx, req.only(['code', 'gate', 'eventId']))); }
    async gateStats(req, res) { return json(res, await GateService.stats(req.ctx, { eventId: req.query('eventId') })); }
}

module.exports = OpsController;
