const Model = use('laranode/Database/Loquent/Model');

class Bank extends Model {
    static table = 'banks';
    static fillable = ['name', 'short_name', 'kind', 'routing_prefix', 'swift', 'sort_order', 'is_active'];
    static casts = { is_active: 'boolean' };
}

module.exports = Bank;
