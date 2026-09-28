const Model = use('laranode/Database/Loquent/Model');

class PromoRedemption extends Model {
    static table = 'promo_redemptions';
    static timestamps = false;
    static fillable = ['promo_id', 'order_id', 'user_id', 'phone', 'discount', 'created_at'];
}

module.exports = PromoRedemption;
