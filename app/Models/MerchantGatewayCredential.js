const Model = use('laranode/Database/Loquent/Model');

class MerchantGatewayCredential extends Model {
    static table = 'merchant_gateway_credentials';
    static fillable = ['merchant_id', 'gateway', 'public_id', 'public_config', 'secret_ciphertext', 'key_version', 'secret_last4', 'sandbox', 'verified_at', 'updated_by'];
    static hidden = ['secret_ciphertext']; // never serialised
    static casts = { public_config: 'json', sandbox: 'boolean' };
}

module.exports = MerchantGatewayCredential;
