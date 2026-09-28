const Model = use('laranode/Database/Loquent/Model');

class Checkin extends Model {
    static table = 'checkins';
    static primaryKey = null; // composite key: use the query builder for writes
    static timestamps = false;
    static fillable = ['user_id', 'day'];
}

module.exports = Checkin;
