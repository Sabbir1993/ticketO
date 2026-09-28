const Model = use('laranode/Database/Loquent/Model');

class Setting extends Model {
    static table = 'settings';
    static fillable = ['setting_group', 'setting_key', 'value', 'value_type', 'label', 'help', 'is_public', 'updated_by'];
    static casts = { value: 'json', is_public: 'boolean' };
}

module.exports = Setting;
