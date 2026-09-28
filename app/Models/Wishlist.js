const Model = use('laranode/Database/Loquent/Model');

class Wishlist extends Model {
    static table = 'wishlists';
    static primaryKey = null; // composite key: use the query builder for writes
    static timestamps = false;
    static fillable = ['user_id', 'event_id', 'created_at'];
}

module.exports = Wishlist;
