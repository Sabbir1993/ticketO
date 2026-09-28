const Model = use('laranode/Database/Loquent/Model');

class OtpChallenge extends Model {
    static table = 'otp_challenges';
    static timestamps = false;
    static fillable = ['phone', 'purpose', 'code_hash', 'attempts', 'ip', 'created_at', 'expires_at', 'consumed_at'];
    static hidden = ['code_hash']; // never serialised
}

module.exports = OtpChallenge;
