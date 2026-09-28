const Model = use('laranode/Database/Loquent/Model');

class TicketScan extends Model {
    static table = 'ticket_scans';
    static timestamps = false;
    static fillable = ['ticket_id', 'event_id', 'merchant_id', 'code_fingerprint', 'gate_id', 'gate_name', 'result', 'user_id', 'device_hash', 'ip', 'request_id', 'scanned_at'];
    static hidden = ['device_hash']; // never serialised
}

module.exports = TicketScan;
