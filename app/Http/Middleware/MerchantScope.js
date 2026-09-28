// Merchant portal routes: the signed-in staff member must belong to an active merchant.
// Sets ctx.merchant for controllers; every query is then scoped by ctx.merchantId.
const Merchant = use('App/Models/Merchant');

class MerchantScope {
    async handle(context, next) {
        const { req, res } = context;
        const ctx = req.ctx;
        if (!ctx.merchantId) return res.status(403).json({ error: { message: 'No merchant account', code: 'forbidden' } });
        const m = await Merchant.select('id', 'uuid', 'name', 'status', 'pg_mode', 'kyc_status', 'commission_pct').where('id', ctx.merchantId).first();
        if (!m) return res.status(403).json({ error: { message: 'No merchant account', code: 'forbidden' } });
        if (m.status === 'suspended') return res.status(403).json({ error: { message: 'This merchant account is suspended. Contact Ticketo support.', code: 'merchant_suspended' } });
        ctx.merchant = m;
        return next(context);
    }
}

module.exports = MerchantScope;
