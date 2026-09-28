const Controller = use('App/Http/Controllers/Controller');
const OrderService = use('App/Services/OrderService');

// SSLCOMMERZ callbacks. The posted body is NEVER trusted: success and IPN are re-validated with the
// Validation API (amount, currency, tran_id) before anything is marked paid. Browsers are sent back
// to the SPA with a 303 so a refresh cannot re-POST.
const spa = (path) => `${config('ticketo').publicUrl}${path}`;
const field = (body, k) => (body && body[k] !== undefined ? String(body[k]).slice(0, 120) : '');

class PaymentGatewayController extends Controller {
    async success(orderId, req, res) {
        const body = req.all();
        let r;
        try { r = await OrderService.sslcommerzValidated(req.ctx, { orderUuid: orderId, tranId: field(body, 'tran_id'), valId: field(body, 'val_id'), source: 'redirect' }); }
        catch { r = { ok: false, orderUuid: orderId, reason: 'error' }; }
        return res.res.redirect(303, r.ok ? spa(`/booking/${encodeURIComponent(orderId)}?new=1`) : spa(`/payment/${encodeURIComponent(orderId)}?failed=${encodeURIComponent(r.reason || 'failed')}`));
    }

    async fail(orderId, req, res) { return this.back(orderId, req, res, 'fail'); }
    async cancel(orderId, req, res) { return this.back(orderId, req, res, 'cancel'); }

    async back(orderId, req, res, kind) {
        const body = req.all();
        await OrderService.sslcommerzFailed(req.ctx, { orderUuid: orderId, tranId: field(body, 'tran_id'), kind, payload: { status: field(body, 'status'), error: field(body, 'error'), tran_id: field(body, 'tran_id') } }).catch(() => {});
        return res.res.redirect(303, spa(`/payment/${encodeURIComponent(orderId)}?failed=${kind}`));
    }

    // Server-to-server IPN — idempotent with the success redirect (order row lock in OrderService.complete).
    async ipn(req, res) {
        const body = req.all();
        // The raw body goes to the signature check (verify_sign over the fields named in verify_key).
        const raw = Object.fromEntries(Object.entries(body || {}).map(([k, v]) => [k, String(v ?? '').slice(0, 500)]));
        const r = await OrderService.sslcommerzValidated(req.ctx, { tranId: field(body, 'tran_id'), valId: field(body, 'val_id'), source: 'ipn', body: raw }).catch(() => ({ ok: false }));
        res.header('Cache-Control', 'no-store');
        return res.status(200).json({ received: true, processed: !!r.ok });
    }
}

module.exports = PaymentGatewayController;
