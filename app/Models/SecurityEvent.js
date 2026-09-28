const Model = use('laranode/Database/Loquent/Model');

class SecurityEvent extends Model {
    static table = 'security_events';
    static timestamps = false;
    static fillable = ['occurred_at', 'event', 'severity', 'user_id', 'phone', 'email', 'ip', 'device_hash', 'request_id', 'path', 'details'];
    static hidden = ['device_hash']; // never serialised
    static casts = { details: 'json' };
}

module.exports = SecurityEvent;
