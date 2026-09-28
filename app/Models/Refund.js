const Model = use('laranode/Database/Loquent/Model');

class Refund extends Model {
    static table = 'refunds';
    static timestamps = false;
    static fillable = ['order_id', 'kind', 'amount', 'fee', 'reason_code', 'reason_text', 'status', 'requested_by', 'reviewed_by', 'review_note', 'gateway_ref', 'requested_at', 'processed_at'];
}

module.exports = Refund;
