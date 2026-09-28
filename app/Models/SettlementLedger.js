const Model = use('laranode/Database/Loquent/Model');

class SettlementLedger extends Model {
    static table = 'settlement_ledger';
    static timestamps = false;
    static fillable = ['merchant_id', 'order_id', 'entry_type', 'direction', 'amount', 'pg_mode', 'note', 'created_at'];
}

module.exports = SettlementLedger;
