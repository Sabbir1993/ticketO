const Model = use('laranode/Database/Loquent/Model');

class EventPerson extends Model {
    static table = 'event_people';
    static timestamps = false;
    static fillable = ['event_id', 'kind', 'name', 'role', 'media_id', 'url', 'sort_order'];
}

module.exports = EventPerson;
