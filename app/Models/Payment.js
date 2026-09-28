const Model = use('laranode/Database/Loquent/Model');

class Payment extends Model {
    static table = 'payments';
    static timestamps = false;
    static fillable = ['order_id', 'attempt', 'method_code', 'gateway', 'pg_mode', 'tran_id', 'status', 'amount', 'currency', 'gateway_payment_id', 'val_id', 'bank_tran_id', 'card_brand', 'risk_level', 'error', 'started_at', 'completed_at'];

    order() { return this.belongsTo(use('App/Models/Order'), 'order_id'); }
    events() { return this.hasMany(use('App/Models/PaymentEvent'), 'payment_id'); }
}

module.exports = Payment;
