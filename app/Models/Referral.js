const Model = use('laranode/Database/Loquent/Model');

class Referral extends Model {
    static table = 'referrals';
    static timestamps = false;
    static fillable = ['referrer_id', 'referee_id', 'rewarded_at', 'created_at'];
}

module.exports = Referral;
