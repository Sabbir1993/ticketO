const Model = use('laranode/Database/Loquent/Model');

class OrderTransfer extends Model {
    static table = 'order_transfers';
    static timestamps = false;
    static fillable = ['order_id', 'from_name', 'from_phone', 'to_name', 'to_phone', 'transferred_by', 'transferred_at'];
}

module.exports = OrderTransfer;
