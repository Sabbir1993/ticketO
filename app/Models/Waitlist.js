const Model = use('laranode/Database/Loquent/Model');

class Waitlist extends Model {
    static table = 'waitlists';
    static timestamps = false;
    static fillable = ['event_id', 'show_id', 'user_id', 'phone', 'created_at', 'notified_at'];
}

module.exports = Waitlist;
