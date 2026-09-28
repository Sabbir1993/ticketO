const Model = use('laranode/Database/Loquent/Model');

class MerchantSettlementAccount extends Model {
    static table = 'merchant_settlement_accounts';
    static fillable = ['merchant_id', 'type', 'bank_id', 'account_name', 'account_no_ciphertext', 'account_no_last4', 'key_version', 'branch', 'routing', 'is_primary'];
    static hidden = ['account_no_ciphertext']; // never serialised
    static casts = { is_primary: 'boolean' };
}

module.exports = MerchantSettlementAccount;
