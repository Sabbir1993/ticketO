const Model = use('laranode/Database/Loquent/Model');

class LoyaltyRule extends Model {
    static table = 'loyalty_rules';
    static fillable = ['event', 'points', 'per_amount', 'daily_cap', 'is_active'];
    static casts = { is_active: 'boolean' };
}

module.exports = LoyaltyRule;
