const Model = use('laranode/Database/Loquent/Model');

class EventReview extends Model {
    static table = 'event_reviews';
    static fillable = ['event_id', 'user_id', 'rating', 'body', 'status', 'moderated_by'];
}

module.exports = EventReview;
