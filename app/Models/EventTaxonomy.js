const Model = use('laranode/Database/Loquent/Model');

class EventTaxonomy extends Model {
    static table = 'event_taxonomies';
    static primaryKey = null; // composite key: use the query builder for writes
    static timestamps = false;
    static fillable = ['event_id', 'taxonomy', 'code'];
}

module.exports = EventTaxonomy;
