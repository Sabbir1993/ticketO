const Model = use('laranode/Database/Loquent/Model');
const SoftDeletes = use('laranode/Database/Loquent/SoftDeletes');

class Event extends SoftDeletes(Model) {
    static table = 'events';
    static fillable = ['uuid', 'merchant_id', 'slug', 'title', 'category_id', 'subcategory_id', 'view_type_id', 'template_id', 'language_code', 'certificate_code', 'duration', 'description', 'palette', 'poster_media_id', 'backdrop_media_id', 'trailer_url', 'booking_limit', 'sale_start', 'sale_end', 'release_date', 'status', 'review_note', 'published_at', 'is_refundable', 'is_cancellable', 'is_transferable', 'refund_window_hrs', 'cancellation_fee_pct', 'rating_avg', 'votes_count', 'interested_count', 'schedule_type', 'schedule', 'created_by', 'updated_by'];
    static casts = { palette: 'json', schedule: 'json', is_refundable: 'boolean', is_cancellable: 'boolean', is_transferable: 'boolean' };

    merchant() { return this.belongsTo(use('App/Models/Merchant'), 'merchant_id'); }
    category() { return this.belongsTo(use('App/Models/Category'), 'category_id'); }
    tiers() { return this.hasMany(use('App/Models/EventTier'), 'event_id'); }
    shows() { return this.hasMany(use('App/Models/EventShow'), 'event_id'); }
    layout() { return this.hasOne(use('App/Models/EventLayout'), 'event_id'); }
    people() { return this.hasMany(use('App/Models/EventPerson'), 'event_id'); }
    overrides() { return this.hasMany(use('App/Models/EventBlockOverride'), 'event_id'); }
}

module.exports = Event;
