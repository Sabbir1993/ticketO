const Model = use('laranode/Database/Loquent/Model');

class UserPreference extends Model {
    static table = 'user_preferences';
    static primaryKey = 'user_id';
    static timestamps = false;
    static fillable = ['user_id', 'city_id', 'prefs'];
    static casts = { prefs: 'json' };
}

module.exports = UserPreference;
