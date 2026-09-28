const Model = use('laranode/Database/Loquent/Model');
const SoftDeletes = use('laranode/Database/Loquent/SoftDeletes');

class Lookup extends SoftDeletes(Model) {
    static table = 'lookups';
    static fillable = ['lookup_group', 'code', 'label', 'meta', 'sort_order', 'is_active'];
    static casts = { meta: 'json', is_active: 'boolean' };
}

module.exports = Lookup;
