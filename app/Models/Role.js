const Model = use('laranode/Database/Loquent/Model');
const SoftDeletes = use('laranode/Database/Loquent/SoftDeletes');

class Role extends SoftDeletes(Model) {
    static table = 'roles';
    static fillable = ['scope', 'slug', 'name', 'description', 'is_system', 'merchant_id', 'created_by'];
    static casts = { is_system: 'boolean' };

    permissions() { return this.belongsToMany(use('App/Models/Permission'), 'role_permissions', 'role_id', 'permission_id'); }
}

module.exports = Role;
