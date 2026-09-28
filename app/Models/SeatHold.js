const Model = use('laranode/Database/Loquent/Model');

class SeatHold extends Model {
    static table = 'seat_holds';
    static fillable = ['uuid', 'show_id', 'event_id', 'user_id', 'owner_hash', 'status', 'subtotal', 'expires_at', 'ip'];
    static hidden = ['owner_hash']; // never serialised

    items() { return this.hasMany(use('App/Models/SeatHoldItem'), 'hold_id'); }
    show() { return this.belongsTo(use('App/Models/EventShow'), 'show_id'); }
}

module.exports = SeatHold;
