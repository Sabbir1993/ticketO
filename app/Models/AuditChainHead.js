const Model = use('laranode/Database/Loquent/Model');

class AuditChainHead extends Model {
    static table = 'audit_chain_head';
    static timestamps = false;
    static fillable = ['last_id', 'last_hash'];
    static hidden = ['last_hash']; // never serialised
}

module.exports = AuditChainHead;
