const Model = use('laranode/Database/Loquent/Model');

class HomeSection extends Model {
    static table = 'home_sections';
    static fillable = ['type', 'title', 'config', 'is_hidden', 'sort_order'];
    static casts = { config: 'json', is_hidden: 'boolean' };
}

module.exports = HomeSection;
