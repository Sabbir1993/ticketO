const Model = use('laranode/Database/Loquent/Model');

class Order extends Model {
    static table = 'orders';
    static fillable = ['uuid', 'booking_ref', 'hold_id', 'user_id', 'merchant_id', 'event_id', 'show_id', 'venue_id', 'channel', 'status', 'contact_name', 'contact_phone', 'contact_email', 'subtotal', 'discount', 'fee', 'fee_ex_vat', 'vat', 'total', 'commission_pct', 'commission', 'merchant_net', 'promo_id', 'promo_code', 'pg_mode', 'guest_access_hash', 'operator_id', 'pos_method', 'pos_tendered', 'created_ip', 'paid_at'];
    static hidden = ['guest_access_hash']; // never serialised

    items() { return this.hasMany(use('App/Models/OrderItem'), 'order_id'); }
    tickets() { return this.hasMany(use('App/Models/Ticket'), 'order_id'); }
    payments() { return this.hasMany(use('App/Models/Payment'), 'order_id'); }
    refunds() { return this.hasMany(use('App/Models/Refund'), 'order_id'); }
    event() { return this.belongsTo(use('App/Models/Event'), 'event_id'); }
    show() { return this.belongsTo(use('App/Models/EventShow'), 'show_id'); }
    merchant() { return this.belongsTo(use('App/Models/Merchant'), 'merchant_id'); }
    user() { return this.belongsTo(use('App/Models/User'), 'user_id'); }
}

module.exports = Order;
