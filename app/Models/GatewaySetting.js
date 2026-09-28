const Model = use('laranode/Database/Loquent/Model');

class GatewaySetting extends Model {
    static table = 'gateway_settings';
    static fillable = ['gateway', 'is_enabled', 'sandbox', 'public_id', 'public_config', 'secret_ciphertext', 'key_version', 'secret_last4', 'verified_at', 'updated_by'];
    static hidden = ['secret_ciphertext']; // never serialised
    static casts = { public_config: 'json', is_enabled: 'boolean', sandbox: 'boolean' };
}

module.exports = GatewaySetting;
