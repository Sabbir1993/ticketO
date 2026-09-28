const Model = use('laranode/Database/Loquent/Model');

class AuditLog extends Model {
    static table = 'audit_logs';
    static timestamps = false;
    static fillable = ['occurred_at', 'actor_user_id', 'actor_type', 'actor_label', 'actor_roles', 'merchant_id', 'action', 'subject_type', 'subject_id', 'subject_label', 'before_state', 'after_state', 'meta', 'request_id', 'ip', 'user_agent', 'prev_hash', 'row_hash'];
    static hidden = ['prev_hash', 'row_hash']; // never serialised
    static casts = { actor_roles: 'json', before_state: 'json', after_state: 'json', meta: 'json' };
}

module.exports = AuditLog;
