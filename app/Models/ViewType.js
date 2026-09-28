const Model = use('laranode/Database/Loquent/Model');

class ViewType extends Model {
    static table = 'view_types';
    static fillable = ['slug', 'name', 'kind', 'icon', 'description', 'customer_label', 'sort_order', 'is_active'];
    static casts = { is_active: 'boolean' };
}

module.exports = ViewType;
