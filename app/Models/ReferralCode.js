const Model = use('laranode/Database/Loquent/Model');

class ReferralCode extends Model {
    static table = 'referral_codes';
    static timestamps = false;
    static fillable = ['user_id', 'code', 'created_at'];
}

module.exports = ReferralCode;
