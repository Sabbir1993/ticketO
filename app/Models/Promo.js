const Model = use('laranode/Database/Loquent/Model');
const SoftDeletes = use('laranode/Database/Loquent/SoftDeletes');

class Promo extends SoftDeletes(Model) {
    static table = 'promos';
    static fillable = ['code', 'type', 'value', 'max_discount', 'min_order', 'description', 'category_id', 'event_id', 'merchant_id', 'starts_at', 'ends_at', 'usage_limit', 'per_customer_limit', 'used_count', 'is_active', 'created_by'];
    static casts = { is_active: 'boolean' };

    redemptions() { return this.hasMany(use('App/Models/PromoRedemption'), 'promo_id'); }
}

module.exports = Promo;
