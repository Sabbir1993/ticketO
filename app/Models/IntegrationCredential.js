const Model = use('laranode/Database/Loquent/Model');

class IntegrationCredential extends Model {
    static table = 'integration_credentials';
    static fillable = ['provider', 'name', 'is_enabled', 'public_config', 'secret_ciphertext', 'key_version', 'secret_last4', 'verified_at', 'updated_by'];
    static hidden = ['secret_ciphertext']; // never serialised
    static casts = { public_config: 'json', is_enabled: 'boolean' };
}

module.exports = IntegrationCredential;
