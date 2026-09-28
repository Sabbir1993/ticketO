const Model = use('laranode/Database/Loquent/Model');
const SoftDeletes = use('laranode/Database/Loquent/SoftDeletes');

class Merchant extends SoftDeletes(Model) {
    static table = 'merchants';
    static fillable = ['uuid', 'name', 'slug', 'business_type', 'status', 'status_note', 'commission_pct', 'legal_name', 'trade_license', 'tin', 'bin', 'address', 'website', 'contact_name', 'contact_email', 'contact_phone', 'logo_media_id', 'pg_mode', 'kyc_status', 'kyc_submitted_at', 'kyc_reviewed_at', 'kyc_reviewed_by', 'kyc_note', 'settlement_cycle'];

    users() { return this.hasMany(use('App/Models/User'), 'merchant_id'); }
    events() { return this.hasMany(use('App/Models/Event'), 'merchant_id'); }
    gatewayCredentials() { return this.hasMany(use('App/Models/MerchantGatewayCredential'), 'merchant_id'); }
    settlementAccounts() { return this.hasMany(use('App/Models/MerchantSettlementAccount'), 'merchant_id'); }
    kycDocuments() { return this.hasMany(use('App/Models/MerchantKycDocument'), 'merchant_id'); }
}

module.exports = Merchant;
