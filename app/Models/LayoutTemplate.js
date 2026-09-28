const Model = use('laranode/Database/Loquent/Model');
const SoftDeletes = use('laranode/Database/Loquent/SoftDeletes');

class LayoutTemplate extends SoftDeletes(Model) {
    static table = 'layout_templates';
    static fillable = ['uuid', 'slug', 'name', 'view_type_id', 'venue_id', 'owner_merchant_id', 'status', 'current_version_id', 'draft_spec', 'is_sample', 'created_by', 'updated_by'];
    static casts = { draft_spec: 'json', is_sample: 'boolean' };

    versions() { return this.hasMany(use('App/Models/LayoutVersion'), 'template_id'); }
    currentVersion() { return this.belongsTo(use('App/Models/LayoutVersion'), 'current_version_id'); }
}

module.exports = LayoutTemplate;
