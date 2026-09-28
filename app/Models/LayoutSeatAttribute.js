const Model = use('laranode/Database/Loquent/Model');

class LayoutSeatAttribute extends Model {
    static table = 'layout_seat_attributes';
    static timestamps = false;
    static fillable = ['version_id', 'block_key', 'seat_code', 'attr', 'note'];
}

module.exports = LayoutSeatAttribute;
