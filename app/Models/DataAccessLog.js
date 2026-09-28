const Model = use('laranode/Database/Loquent/Model');

class DataAccessLog extends Model {
    static table = 'data_access_logs';
    static timestamps = false;
    static fillable = ['occurred_at', 'user_id', 'resource', 'resource_id', 'merchant_id', 'purpose', 'request_id', 'ip'];
}

module.exports = DataAccessLog;
