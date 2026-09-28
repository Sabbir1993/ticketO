const Model = use('laranode/Database/Loquent/Model');

class AuthSession extends Model {
    static table = 'auth_sessions';
    static timestamps = false;
    static fillable = ['user_id', 'guard', 'token_hash', 'csrf_hash', 'mfa_passed', 'ip', 'user_agent', 'device_hash', 'created_at', 'last_seen_at', 'idle_expires_at', 'expires_at', 'revoked_at', 'revoke_reason'];
    static hidden = ['token_hash', 'csrf_hash', 'device_hash']; // never serialised
    static casts = { mfa_passed: 'boolean' };
}

module.exports = AuthSession;
