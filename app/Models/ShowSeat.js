const Model = use('laranode/Database/Loquent/Model');

class ShowSeat extends Model {
    static table = 'show_seats';
    static timestamps = false;
    static fillable = ['show_id', 'block_key', 'row_label', 'seat_no', 'seat_code', 'tier_key', 'x', 'y', 'status', 'attrs', 'hold_id', 'hold_expires_at', 'order_id', 'price_override', 'blocked_reason', 'blocked_by'];
}

module.exports = ShowSeat;
