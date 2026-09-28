const Model = use('laranode/Database/Loquent/Model');

class Ticket extends Model {
    static table = 'tickets';
    static timestamps = false;
    static fillable = ['uuid', 'order_id', 'order_item_id', 'show_seat_id', 'label', 'tier_key', 'tier_name', 'version', 'status', 'scanned_at', 'gate_id', 'scanned_by', 'created_at'];

    order() { return this.belongsTo(use('App/Models/Order'), 'order_id'); }
    seat() { return this.belongsTo(use('App/Models/ShowSeat'), 'show_seat_id'); }
}

module.exports = Ticket;
