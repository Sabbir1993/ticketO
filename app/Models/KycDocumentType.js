const Model = use('laranode/Database/Loquent/Model');

class KycDocumentType extends Model {
    static table = 'kyc_document_types';
    static fillable = ['code', 'name', 'description', 'is_required', 'accepted_mime', 'max_bytes', 'sort_order', 'is_active'];
    static casts = { accepted_mime: 'json', is_required: 'boolean', is_active: 'boolean' };
}

module.exports = KycDocumentType;
