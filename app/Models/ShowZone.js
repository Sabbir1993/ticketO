const Model = use('laranode/Database/Loquent/Model');

class ShowZone extends Model {
    static table = 'show_zones';
    static timestamps = false;
    static fillable = ['show_id', 'block_key', 'tier_key', 'capacity', 'sold', 'blocked', 'price_override'];
    static casts = { blocked: 'boolean' };
}

module.exports = ShowZone;
