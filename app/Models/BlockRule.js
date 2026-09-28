const Model = use('laranode/Database/Loquent/Model');

class BlockRule extends Model {
    static table = 'block_rules';
    static fillable = ['name', 'event', 'subject_type', 'threshold', 'window_sec', 'duration_sec', 'scope', 'is_active'];
    static casts = { is_active: 'boolean' };
}

module.exports = BlockRule;
