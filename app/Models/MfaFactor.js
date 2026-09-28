const Model = use('laranode/Database/Loquent/Model');

class MfaFactor extends Model {
    static table = 'mfa_factors';
    static fillable = ['user_id', 'type', 'secret_ciphertext', 'key_version', 'confirmed_at', 'last_used_step'];
    static hidden = ['secret_ciphertext']; // never serialised
}

module.exports = MfaFactor;
