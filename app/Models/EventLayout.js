const Model = use('laranode/Database/Loquent/Model');

class EventLayout extends Model {
    static table = 'event_layouts';
    static fillable = ['event_id', 'source_version_id', 'spec', 'checksum', 'is_custom', 'locked_at', 'updated_by'];
    static casts = { spec: 'json', is_custom: 'boolean' };
}

module.exports = EventLayout;
