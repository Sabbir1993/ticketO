const Model = use('laranode/Database/Loquent/Model');

class LoyaltyLedger extends Model {
    static table = 'loyalty_ledger';
    static timestamps = false;
    static fillable = ['user_id', 'delta', 'reason', 'ref', 'created_by', 'created_at'];
}

module.exports = LoyaltyLedger;
