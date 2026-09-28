const Model = use('laranode/Database/Loquent/Model');

class PaymentMethod extends Model {
    static table = 'payment_methods';
    static fillable = ['code', 'name', 'subtitle', 'icon', 'color', 'gateway', 'multi_card_name', 'channel', 'sort_order', 'is_enabled'];
    static casts = { is_enabled: 'boolean' };
}

module.exports = PaymentMethod;
