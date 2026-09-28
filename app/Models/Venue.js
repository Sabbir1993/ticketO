const Model = use('laranode/Database/Loquent/Model');
const SoftDeletes = use('laranode/Database/Loquent/SoftDeletes');

class Venue extends SoftDeletes(Model) {
    static table = 'venues';
    static fillable = ['uuid', 'slug', 'name', 'city_id', 'address', 'type', 'image_media_id', 'latitude', 'longitude', 'merchant_id', 'is_active'];
    static casts = { is_active: 'boolean' };

    city() { return this.belongsTo(use('App/Models/City'), 'city_id'); }
    gates() { return this.hasMany(use('App/Models/VenueGate'), 'venue_id'); }
    facilities() { return this.hasMany(use('App/Models/VenueFacility'), 'venue_id'); }
}

module.exports = Venue;
