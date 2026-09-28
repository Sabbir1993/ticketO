const Model = use('laranode/Database/Loquent/Model');

class EventShow extends Model {
    static table = 'event_shows';
    static fillable = ['uuid', 'event_id', 'venue_id', 'starts_at', 'ends_at', 'label', 'format_code', 'status', 'source', 'layout_checksum', 'seat_map_generated_at', 'seat_count', 'ga_capacity'];

    event() { return this.belongsTo(use('App/Models/Event'), 'event_id'); }
    venue() { return this.belongsTo(use('App/Models/Venue'), 'venue_id'); }
    seats() { return this.hasMany(use('App/Models/ShowSeat'), 'show_id'); }
    zones() { return this.hasMany(use('App/Models/ShowZone'), 'show_id'); }
}

module.exports = EventShow;
