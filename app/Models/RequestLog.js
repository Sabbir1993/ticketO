const Model = use('laranode/Database/Loquent/Model');

class RequestLog extends Model {
    static table = 'request_logs';
    static timestamps = false;
    static fillable = ['occurred_at', 'request_id', 'method', 'route', 'path', 'query', 'status', 'duration_ms', 'ip', 'remote_addr', 'remote_port', 'x_forwarded_for', 'cf_connecting_ip', 'x_real_ip', 'via_proxy', 'host', 'user_agent', 'referer', 'origin', 'accept_language', 'device_hash', 'user_id', 'user_type', 'auth_session_id', 'api_client_id', 'merchant_id', 'req_bytes', 'res_bytes', 'headers', 'body', 'error_code', 'error_message', 'blocked'];
    static hidden = ['device_hash']; // never serialised
    static casts = { query: 'json', headers: 'json', body: 'json', via_proxy: 'boolean', blocked: 'boolean' };
}

module.exports = RequestLog;
