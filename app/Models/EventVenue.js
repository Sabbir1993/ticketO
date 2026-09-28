const Model = use('laranode/Database/Loquent/Model');

class EventVenue extends Model {
    static table = 'event_venues';
    static primaryKey = null; // composite key: use the query builder for writes
    static timestamps = false;
    static fillable = ['event_id', 'venue_id', 'sort_order'];
}

module.exports = EventVenue;
