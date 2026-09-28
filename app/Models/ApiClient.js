const Model = use('laranode/Database/Loquent/Model');

class ApiClient extends Model {
    static table = 'api_clients';
    static fillable = ['uuid', 'name', 'key_prefix', 'key_hash', 'scopes', 'allowed_origins', 'allowed_ips', 'merchant_id', 'status', 'last_used_at', 'last_used_ip', 'created_by'];
    static hidden = ['key_hash']; // never serialised
    static casts = { scopes: 'json', allowed_origins: 'json', allowed_ips: 'json' };
}

module.exports = ApiClient;
