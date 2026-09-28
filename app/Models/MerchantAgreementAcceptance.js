const Model = use('laranode/Database/Loquent/Model');

class MerchantAgreementAcceptance extends Model {
    static table = 'merchant_agreement_acceptances';
    static timestamps = false;
    static fillable = ['merchant_id', 'user_id', 'page_version_id', 'accepted_at', 'ip', 'user_agent'];
}

module.exports = MerchantAgreementAcceptance;
