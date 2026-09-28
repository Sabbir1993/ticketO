const Model = use('laranode/Database/Loquent/Model');

class VenueTemplate extends Model {
    static table = 'venue_templates';
    static primaryKey = null; // composite key: use the query builder for writes
    static timestamps = false;
    static fillable = ['venue_id', 'template_id'];
}

module.exports = VenueTemplate;
