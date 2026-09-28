const Model = use('laranode/Database/Loquent/Model');

class Block extends Model {
    static table = 'blocks';
    static fillable = ['subject_type', 'subject_value', 'ip_start', 'ip_end', 'scope', 'reason', 'source', 'rule_id', 'created_by', 'starts_at', 'expires_at', 'revoked_at', 'revoked_by', 'revoke_reason', 'hits', 'last_hit_at'];
}

module.exports = Block;
