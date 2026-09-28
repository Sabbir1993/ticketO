const Model = use('laranode/Database/Loquent/Model');

class City extends Model {
    static table = 'cities';
    static fillable = ['slug', 'name', 'icon', 'image_media_id', 'is_popular', 'is_default', 'is_online', 'sort_order', 'is_active'];
    static casts = { is_popular: 'boolean', is_default: 'boolean', is_online: 'boolean', is_active: 'boolean' };
}

module.exports = City;
