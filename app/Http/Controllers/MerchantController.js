const Controller = use('App/Http/Controllers/Controller');
const UserView = use('App/Services/UserView');
const RbacService = use('App/Services/RbacService');
const MerchantAccountService = use('App/Services/MerchantAccountService');
const MerchantEventService = use('App/Services/MerchantEventService');
const MerchantReportService = use('App/Services/MerchantReportService');
const MerchantBrandService = use('App/Services/MerchantBrandService');

// Merchant portal. Every route: merchant staff session + MerchantScope + a permission (routes/api.js).
// Responses are never cached (buyer contacts, account details).
const json = (res, data, status = 200) => { res.header('Cache-Control', 'no-store'); return res.status(status).json(data); };

class MerchantController extends Controller {
    // POST /api/merchants/register — public sign-up; signs the new owner in.
    async register(req, res) {
        const r = await MerchantAccountService.register(req.ctx, res.res, req.only(['owner', 'business', 'settlement', 'pg', 'docs']));
        const rbac = await RbacService.forUser(r.user);
        return json(res, { user: UserView.user(r.user, { ...req.ctx, ...rbac }), merchant: r.merchant }, 201);
    }

    async update(req, res) { return json(res, await MerchantAccountService.update(req.ctx, req.only(['business', 'settlement', 'owner', 'type']))); }
    async kyc(req, res) { return json(res, await MerchantAccountService.addKycDocs(req.ctx, req.only(['docs']))); }
    async paymentSettings(req, res) { return json(res, await MerchantAccountService.updatePaymentSettings(req.ctx, req.only(['sslcommerz', 'bkash']))); }
    async testPayment(req, res) { return json(res, await MerchantAccountService.testConnection(req.ctx, req.only(['gateway']))); }

    async brand(req, res) { return json(res, await MerchantBrandService.get(req.ctx)); }
    async saveBrand(req, res) { return json(res, await MerchantBrandService.save(req.ctx, req.only(['tagline', 'about', 'primary', 'accent']))); }
    async brandImage(req, res) { return json(res, await MerchantBrandService.setImage(req.ctx, req.input('kind'), req.only(['name', 'type', 'dataUrl']))); }
    async clearBrandImage(kind, req, res) { return json(res, await MerchantBrandService.clearImage(req.ctx, kind)); }

    async dashboard(req, res) { return json(res, await MerchantReportService.dashboard(req.ctx)); }
    async orders(req, res) { return json(res, await MerchantReportService.orders(req.ctx, { eventId: req.query('eventId') })); }
    async settlement(req, res) { return json(res, await MerchantReportService.settlement(req.ctx)); }
    async payout(req, res) { return json(res, await MerchantReportService.payoutSummary(req.ctx, { from: req.query('from'), to: req.query('to') })); }
    async payoutCsv(req, res) {
        const csv = await MerchantReportService.payoutCsv(req.ctx, { from: req.query('from'), to: req.query('to') });
        res.header('Content-Type', 'text/csv; charset=utf-8'); res.header('Content-Disposition', 'attachment; filename="sales-and-payout.csv"'); res.header('Cache-Control', 'no-store');
        return res.status(200).send(csv);
    }

    async events(req, res) { return json(res, await MerchantEventService.list(req.ctx)); }
    async event(id, req, res) { return json(res, await MerchantEventService.get(req.ctx, id)); }
    async saveEvent(req, res) { return json(res, await MerchantEventService.save(req.ctx, req.input('event') || {})); }
    async eventPayment(id, req, res) { return json(res, await MerchantEventService.savePayment(req.ctx, id, req.only(['useDefault', 'sslcommerz']))); }
    async testEventPayment(id, req, res) { return json(res, await MerchantEventService.testPayment(req.ctx, id)); }
    async publish(id, req, res) { return json(res, await MerchantEventService.publish(req.ctx, id)); }
    async status(id, req, res) { return json(res, await MerchantEventService.setStatus(req.ctx, id, req.input('status'))); }
    async destroy(id, req, res) { return json(res, await MerchantEventService.remove(req.ctx, id)); }
}

module.exports = MerchantController;
