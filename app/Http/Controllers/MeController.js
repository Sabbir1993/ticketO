const Controller = use('App/Http/Controllers/Controller');
const CustomerService = use('App/Services/CustomerService');

// The signed-in user's own data. Never cached (contact details, ticket codes).
const json = (res, data, status = 200) => { res.header('Cache-Control', 'no-store'); return res.status(status).json(data); };

class MeController extends Controller {
    // PATCH /api/me { name, email }
    async update(req, res) { return json(res, await CustomerService.updateProfile(req.ctx, req.only(['name', 'email']))); }

    // GET /api/me/orders
    async orders(req, res) { return json(res, await CustomerService.orders(req.ctx)); }

    // POST /api/orders/:orderId/refund-request { reason }
    async refund(orderId, req, res) { return json(res, await CustomerService.requestRefund(req.ctx, req.getExpressRequest(), orderId, req.only(['reason']))); }

    // POST /api/orders/:orderId/transfer { name, phone }
    async transfer(orderId, req, res) { return json(res, await CustomerService.transfer(req.ctx, req.getExpressRequest(), orderId, req.only(['name', 'phone']))); }
}

module.exports = MeController;
