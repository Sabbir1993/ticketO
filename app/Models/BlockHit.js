const Model = use('laranode/Database/Loquent/Model');

class BlockHit extends Model {
    static table = 'block_hits';
    static timestamps = false;
    static fillable = ['block_id', 'request_id', 'ip', 'path', 'at'];
}

module.exports = BlockHit;
