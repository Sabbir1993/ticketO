const Model = use('laranode/Database/Loquent/Model');

class UserRole extends Model {
    static table = 'user_roles';
    static timestamps = false;
    static fillable = ['user_id', 'role_id', 'merchant_id', 'granted_by', 'granted_at', 'expires_at'];
}

module.exports = UserRole;
