const Model = use('laranode/Database/Loquent/Model');

class LoyaltyTier extends Model {
    static table = 'loyalty_tiers';
    static fillable = ['code', 'name', 'min_points', 'multiplier', 'color', 'perks', 'sort_order', 'is_active'];
    static casts = { perks: 'json', is_active: 'boolean' };
}

module.exports = LoyaltyTier;
