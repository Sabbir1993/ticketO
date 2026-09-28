const Model = use('laranode/Database/Loquent/Model');

class Permission extends Model {
    static table = 'permissions';
    static fillable = ['slug', 'scope', 'group_name', 'name', 'description', 'sort_order'];
}

module.exports = Permission;
