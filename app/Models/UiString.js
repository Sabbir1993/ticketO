const Model = use('laranode/Database/Loquent/Model');

class UiString extends Model {
    static table = 'ui_strings';
    static fillable = ['string_key', 'locale', 'value', 'context', 'updated_by'];
}

module.exports = UiString;
