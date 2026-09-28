const Model = use('laranode/Database/Loquent/Model');

class EventBlockOverride extends Model {
    static table = 'event_block_overrides';
    static primaryKey = null; // composite key: use the query builder for writes
    static timestamps = false;
    static fillable = ['event_id', 'block_key', 'is_enabled', 'capacity'];
    static casts = { is_enabled: 'boolean' };
}

module.exports = EventBlockOverride;
