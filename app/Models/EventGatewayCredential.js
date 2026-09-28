const Model = use('laranode/Database/Loquent/Model');

class EventGatewayCredential extends Model {
    static table = 'event_gateway_credentials';
    static fillable = ['event_id', 'merchant_id', 'gateway', 'public_id', 'public_config', 'secret_ciphertext', 'key_version', 'secret_last4', 'is_active', 'verified_at', 'updated_by'];
    static hidden = ['secret_ciphertext']; // never serialised
    static casts = { public_config: 'json', is_active: 'boolean' };
}

module.exports = EventGatewayCredential;
