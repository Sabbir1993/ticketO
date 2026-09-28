const Model = use('laranode/Database/Loquent/Model');

class NavItem extends Model {
    static table = 'nav_items';
    static fillable = ['parent_id', 'location', 'label', 'icon', 'href', 'audience', 'permission', 'open_new_tab', 'sort_order', 'is_active'];
    static casts = { open_new_tab: 'boolean', is_active: 'boolean' };
}

module.exports = NavItem;
