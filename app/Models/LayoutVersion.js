const Model = use('laranode/Database/Loquent/Model');

class LayoutVersion extends Model {
    static table = 'layout_versions';
    static timestamps = false;
    static fillable = ['template_id', 'version', 'spec', 'seat_count', 'ga_capacity', 'block_count', 'checksum', 'notes', 'created_by', 'created_at', 'published_at'];
    static casts = { spec: 'json' };

    template() { return this.belongsTo(use('App/Models/LayoutTemplate'), 'template_id'); }
}

module.exports = LayoutVersion;
