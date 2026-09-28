const Model = use('laranode/Database/Loquent/Model');
const SoftDeletes = use('laranode/Database/Loquent/SoftDeletes');

class Banner extends SoftDeletes(Model) {
    static table = 'banners';
    static fillable = ['title', 'subtitle', 'badge', 'cta_label', 'href', 'palette', 'image_media_id', 'city_id', 'starts_at', 'ends_at', 'sort_order', 'is_active'];
    static casts = { palette: 'json', is_active: 'boolean' };
}

module.exports = Banner;
