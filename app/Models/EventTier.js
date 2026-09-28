const Model = use('laranode/Database/Loquent/Model');

class EventTier extends Model {
    static table = 'event_tiers';
    static timestamps = false;
    static fillable = ['event_id', 'tier_key', 'name', 'color', 'price', 'per_order_limit', 'early_bird_price', 'early_bird_until', 'sort_order'];
}

module.exports = EventTier;
