// Order pricing — same formula as the prototype's priceOrder():
//   base = subtotal − discount · fee = round(base × fee% × (1 + VAT%)) · total = base + fee
//   commission = round(base × merchant commission%) · merchantNet = base − commission
// Promos: event-level codes win over platform / merchant codes with the same text.
const Promo = use('App/Models/Promo');
const PromoRedemption = use('App/Models/PromoRedemption');
const Category = use('App/Models/Category');
const Merchant = use('App/Models/Merchant');
const SettingsService = use('App/Services/SettingsService');

const num = (v) => (v === null || v === undefined ? null : Number(v));

async function findPromo(event, code, now) {
    const c = String(code || '').trim().toUpperCase();
    if (!c || c.length > 40) return null;
    // Most specific code wins: this event → this merchant → platform-wide.
    const candidates = await Promo.where('code', c).get();
    const p = candidates.find((x) => x.event_id === event.id)
        || candidates.find((x) => !x.event_id && x.merchant_id === event.merchant_id)
        || candidates.find((x) => !x.event_id && !x.merchant_id);
    if (!p) return null;
    const category = p.category_id ? await Category.withTrashed().where('id', p.category_id).first() : null;
    const expired = !p.is_active || (p.starts_at && new Date(p.starts_at) > now) || (p.ends_at && new Date(p.ends_at) <= now);
    return { ...p.toArray(), category_name: category?.name || null, expired };
}

const PricingService = {
    /** @param event row with id, merchant_id, category_id, subcategory_id */
    async price(event, subtotal, promoCode, { userId = null } = {}) {
        const now = new Date();
        const [feePct, vatPct, defaultCommission, merchant] = await Promise.all([
            SettingsService.get('platform', 'convenience_fee_pct', 3.5),
            SettingsService.get('platform', 'vat_on_fee_pct', 15),
            SettingsService.get('platform', 'default_commission_pct', 8),
            Merchant.withTrashed().select('commission_pct').where('id', event.merchant_id).first(),
        ]);
        let discount = 0; let promo = null; let promoError = null; let promoId = null;
        if (promoCode) {
            const p = await findPromo(event, promoCode, now);
            if (!p) promoError = 'Invalid promo code';
            else if (p.expired) promoError = 'This code has expired';
            else if (p.category_id && ![event.category_id, event.subcategory_id].includes(p.category_id)) promoError = `Valid only on ${p.category_name}`;
            else if (subtotal < num(p.min_order)) promoError = `Minimum order ৳${num(p.min_order)}`;
            else if (p.usage_limit !== null && p.used_count >= p.usage_limit) promoError = 'This code has reached its usage limit';
            else if (p.per_customer_limit && userId && Number(await PromoRedemption.where('promo_id', p.id).where('user_id', userId).count()) >= p.per_customer_limit) promoError = 'You have already used this code';
            else {
                discount = p.type === 'flat' ? Math.min(num(p.value), subtotal) : Math.min(num(p.max_discount) ?? Infinity, Math.round((subtotal * num(p.value)) / 100));
                promo = p.code; promoId = p.id;
            }
        }
        const base = Math.max(0, subtotal - discount);
        const feeRaw = base === 0 ? 0 : (base * Number(feePct)) / 100;
        const vat = (feeRaw * Number(vatPct)) / 100;
        const fee = Math.round(feeRaw + vat);
        const commissionPct = merchant ? Number(merchant.commission_pct) : Number(defaultCommission);
        const commission = Math.round((base * commissionPct) / 100);
        return {
            subtotal, discount, promo, promoError, fee, feeExVat: Math.round(feeRaw), vat: Math.round(vat), total: base + fee,
            commissionPct, commission, merchantNet: base - commission, _promoId: promoId,
        };
    },

    /** Strip internal fields before sending pricing to the browser. */
    public({ _promoId, commissionPct, commission, merchantNet, ...p }) { return p; }, // eslint-disable-line no-unused-vars
};

module.exports = PricingService;
