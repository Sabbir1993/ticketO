const Model = use('laranode/Database/Loquent/Model');

class PasswordReset extends Model {
    static table = 'password_resets';
    static timestamps = false;
    static fillable = ['user_id', 'token_hash', 'ip', 'created_at', 'expires_at', 'used_at'];
    static hidden = ['token_hash']; // never serialised
}

module.exports = PasswordReset;
