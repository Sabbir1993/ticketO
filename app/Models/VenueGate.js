const Model = use('laranode/Database/Loquent/Model');

class VenueGate extends Model {
    static table = 'venue_gates';
    static fillable = ['venue_id', 'name', 'allowed_tier_keys', 'sort_order', 'is_active'];
    static casts = { allowed_tier_keys: 'json', is_active: 'boolean' };
}

module.exports = VenueGate;
