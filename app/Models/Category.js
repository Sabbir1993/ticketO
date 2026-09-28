const Model = use('laranode/Database/Loquent/Model');
const SoftDeletes = use('laranode/Database/Loquent/SoftDeletes');

class Category extends SoftDeletes(Model) {
    static table = 'categories';
    static fillable = ['parent_id', 'slug', 'name', 'icon', 'color', 'image_media_id', 'view_type_id', 'default_template_id', 'people_label', 'sort_order', 'is_active'];
    static casts = { is_active: 'boolean' };

    parent() { return this.belongsTo(use('App/Models/Category'), 'parent_id'); }
    children() { return this.hasMany(use('App/Models/Category'), 'parent_id'); }
}

module.exports = Category;
