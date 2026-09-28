const Model = use('laranode/Database/Loquent/Model');

class OrderItem extends Model {
    static table = 'order_items';
    static timestamps = false;
    static fillable = ['order_id', 'type', 'show_seat_id', 'show_zone_id', 'block_key', 'block_name', 'seat_code', 'tier_key', 'tier_name', 'qty', 'price'];
}

module.exports = OrderItem;
