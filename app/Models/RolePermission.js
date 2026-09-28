const Model = use('laranode/Database/Loquent/Model');

class RolePermission extends Model {
    static table = 'role_permissions';
    static primaryKey = null; // composite key: use the query builder for writes
    static timestamps = false;
    static fillable = ['role_id', 'permission_id'];
}

module.exports = RolePermission;
