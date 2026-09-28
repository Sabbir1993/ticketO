const Model = use('laranode/Database/Loquent/Model');

class SeatHoldItem extends Model {
    static table = 'seat_hold_items';
    static timestamps = false;
    static fillable = ['hold_id', 'show_seat_id', 'show_zone_id', 'block_key', 'block_name', 'seat_code', 'tier_key', 'tier_name', 'qty', 'price'];
}

module.exports = SeatHoldItem;
