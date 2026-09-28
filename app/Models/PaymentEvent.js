const Model = use('laranode/Database/Loquent/Model');

class PaymentEvent extends Model {
    static table = 'payment_events';
    static timestamps = false;
    static fillable = ['payment_id', 'order_id', 'source', 'payload', 'result', 'ip', 'request_id', 'received_at'];
    static casts = { payload: 'json' };
}

module.exports = PaymentEvent;
