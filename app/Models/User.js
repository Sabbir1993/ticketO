const Model = use('laranode/Database/Loquent/Model');
const SoftDeletes = use('laranode/Database/Loquent/SoftDeletes');

class User extends SoftDeletes(Model) {
    static table = 'users';
    static fillable = ['uuid', 'type', 'name', 'email', 'phone', 'password_hash', 'status', 'status_reason', 'mfa_enabled', 'merchant_id', 'email_verified_at', 'phone_verified_at', 'last_login_at', 'last_login_ip', 'failed_logins', 'locked_until'];
    static hidden = ['password_hash']; // never serialised
    static casts = { mfa_enabled: 'boolean' };

    merchant() { return this.belongsTo(use('App/Models/Merchant'), 'merchant_id'); }
    roles() { return this.belongsToMany(use('App/Models/Role'), 'user_roles', 'user_id', 'role_id'); }
    sessions() { return this.hasMany(use('App/Models/AuthSession'), 'user_id'); }
    mfaFactors() { return this.hasMany(use('App/Models/MfaFactor'), 'user_id'); }
}

module.exports = User;
