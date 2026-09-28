const Model = use('laranode/Database/Loquent/Model');

class MerchantKycDocument extends Model {
    static table = 'merchant_kyc_documents';
    static fillable = ['merchant_id', 'document_type_id', 'media_id', 'status', 'reviewed_by', 'reviewed_at', 'note'];
}

module.exports = MerchantKycDocument;
