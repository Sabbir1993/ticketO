const Controller = use('App/Http/Controllers/Controller');
const OrderService = use('App/Services/OrderService');

// Customer orders & payment start. Responses are never cached (contact details, ticket codes).
const json = (res, data, status = 200) => { res.header('Cache-Control', 'no-store'); return res.status(status).json(data); };

class OrderController extends Controller {
    async store(req, res) {
        const r = await OrderService.create(req.ctx, req.getExpressRequest(), req.only(['holdId', 'contact', 'promoCode']));
        return json(res, { ...r.order, ...(r.accessKey ? { accessKey: r.accessKey } : {}) }, 201);
    }

    async show(orderId, req, res) {
        const o = await OrderService.accessible(req.ctx, req.getExpressRequest(), orderId, req.query('k'));
        return json(res, await OrderService.view(o));
    }

    async pay(orderId, req, res) { return json(res, await OrderService.startPayment(req.ctx, req.getExpressRequest(), orderId, req.input('method'))); }

    async simulate(orderId, req, res) { return json(res, await OrderService.simulate(req.ctx, req.getExpressRequest(), orderId, req.input('outcome'))); }
}

module.exports = OrderController;
