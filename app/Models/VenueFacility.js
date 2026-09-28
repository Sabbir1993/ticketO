const Model = use('laranode/Database/Loquent/Model');

class VenueFacility extends Model {
    static table = 'venue_facilities';
    static timestamps = false;
    static fillable = ['venue_id', 'code'];
}

module.exports = VenueFacility;
