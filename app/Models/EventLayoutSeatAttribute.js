const Model = use('laranode/Database/Loquent/Model');

class EventLayoutSeatAttribute extends Model {
    static table = 'event_layout_seat_attributes';
    static timestamps = false;
    static fillable = ['event_id', 'block_key', 'seat_code', 'attr', 'note'];
}

module.exports = EventLayoutSeatAttribute;
