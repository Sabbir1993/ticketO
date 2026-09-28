// Customer sign-in with a one-time SMS code (POST /api/auth/otp, /api/auth/otp/verify).
//   · codes are stored only as a keyed hash bound to the phone (otp_challenges.code_hash)
//   · one live code per phone; resend cooldown + hourly cap per phone; the route is IP-throttled too
//   · attempts are counted with a conditional increment (no race past the limit); wrong codes are
//     `otp_failed` security events, which drive the auto-block rules (phone and IP)
//   · a code is consumed exactly once (conditional update), then a fresh session is issued
const Db = use('App/Support/Db');
const Hasher = use('App/Security/Hasher');
const IpResolver = use('App/Security/IpResolver');
const OtpChallenge = use('App/Models/OtpChallenge');
const User = use('App/Models/User');
const SettingsService = use('App/Services/SettingsService');
const SessionService = use('App/Services/SessionService');
const SmsService = use('App/Services/SmsService');
const BlockService = use('App/Services/BlockService');
const SecurityEventService = use('App/Services/SecurityEventService');
const AuditService = use('App/Services/AuditService');
const { uuid } = use('App/Support/Ids');
const { HttpError, bad, forbid, tooMany } = use('App/Support/HttpError');

const PURPOSE = 'login';
const DEMO_CODE = '123456'; // published demo code; accepted only by the non-production simulator
const RESEND_SECONDS = 60;
const MAX_PER_HOUR = 5;
const codeHash = (phone, code) => Hasher.hash(`${phone}:${code}`, 'otp');
const simulatorOn = () => !!config('ticketo').otpSimulator;

async function assertNotBlocked(ctx, phone) {
    const block = await BlockService.find(ctx, { scope: 'login', phone });
    if (block) { await BlockService.hit(block, ctx).catch(() => {}); forbid('Sign-in from this number is restricted. Contact support.', 'blocked'); }
}

const CustomerAuthService = {
    async requestOtp(ctx, { phone } = {}) {
        const p = BlockService.normPhone(phone) || bad('Enter a valid Bangladeshi mobile number (01XXXXXXXXX)');
        await assertNotBlocked(ctx, p);
        const now = new Date();
        const recent = await OtpChallenge.select('created_at').where('phone', p).where('purpose', PURPOSE)
            .where('created_at', '>', new Date(now.getTime() - 3600000)).orderBy('id', 'desc').get();
        if (recent[0] && now - new Date(recent[0].created_at) < RESEND_SECONDS * 1000) {
            tooMany(`Please wait ${Math.ceil((RESEND_SECONDS * 1000 - (now - new Date(recent[0].created_at))) / 1000)} seconds before requesting another code`, 'otp_cooldown');
        }
        if (recent.length >= MAX_PER_HOUR) tooMany('Too many codes requested for this number. Try again in an hour.', 'otp_limit');

        const sms = await SmsService.configured();
        if (!sms && !simulatorOn()) throw new HttpError(503, 'SMS sign-in is temporarily unavailable. Please continue as guest.', 'sms_unavailable');
        const code = sms ? Hasher.otp(6) : DEMO_CODE;
        const ttl = Number(await SettingsService.get('security', 'otp_ttl_minutes', 5)) || 5;

        // One live code per phone: earlier unconsumed codes stop working.
        await OtpChallenge.where('phone', p).where('purpose', PURPOSE).whereNull('consumed_at').update({ consumed_at: now });
        const ch = await OtpChallenge.create({
            phone: p, purpose: PURPOSE, code_hash: codeHash(p, code), attempts: 0, ip: ctx.ip ? IpResolver.toBinary(ctx.ip) : null,
            created_at: now, expires_at: new Date(now.getTime() + ttl * 60000),
        });
        if (sms) {
            const brand = (await SettingsService.get('branding', 'name', 'Ticketo')) || 'Ticketo';
            const r = await SmsService.send(ctx, { to: p, text: `${code} is your ${brand} sign-in code. It expires in ${ttl} minutes. Never share it.`, reference: `otp-${ch.id}` });
            if (!r.ok) {
                await OtpChallenge.where('id', ch.id).update({ consumed_at: new Date() });
                throw new HttpError(502, 'We could not send the SMS. Please try again in a moment.', 'sms_failed');
            }
        }
        return { sent: true, demo: !sms, expiresInSeconds: ttl * 60 };
    },

    /** @returns {{ user, isNew }} and sets the session cookies on `expressRes`. */
    async verifyOtp(ctx, expressRes, { phone, otp } = {}) {
        const p = BlockService.normPhone(phone) || bad('Enter a valid Bangladeshi mobile number');
        const code = String(otp || '').trim();
        if (!/^\d{6}$/.test(code)) bad('Enter the 6-digit code');
        await assertNotBlocked(ctx, p);
        const now = new Date();
        const max = Number(await SettingsService.get('security', 'otp_max_attempts', 5)) || 5;
        const ch = await OtpChallenge.select('id', 'code_hash').where('phone', p).where('purpose', PURPOSE).whereNull('consumed_at')
            .where('expires_at', '>', now).orderBy('id', 'desc').first();
        if (!ch) bad('This code has expired — request a new one', 'otp_expired');
        // Count the attempt first, conditionally: concurrent guesses cannot exceed the limit.
        if (!(await OtpChallenge.where('id', ch.id).where('attempts', '<', max).increment('attempts'))) {
            await OtpChallenge.where('id', ch.id).update({ consumed_at: now });
            tooMany('Too many wrong codes. Request a new one.', 'otp_attempts');
        }
        if (!Hasher.verify(`${p}:${code}`, ch.code_hash, 'otp')) {
            SecurityEventService.record(ctx, 'otp_failed', { phone: p, details: { challenge: ch.id } });
            bad('Incorrect code — please check and try again', 'otp_invalid');
        }
        if (!(await OtpChallenge.where('id', ch.id).whereNull('consumed_at').update({ consumed_at: now }))) bad('This code was already used — request a new one', 'otp_used');

        let user = await User.where('type', 'customer').where('phone', p).first();
        if (!user) {
            const trashed = await User.withTrashed().where('type', 'customer').where('phone', p).first();
            if (trashed) forbid('This account has been closed. Contact support.', 'account_closed');
            user = await User.create({ uuid: uuid(), type: 'customer', phone: p, name: '', status: 'active', phone_verified_at: now }); // name asked next
            await AuditService.record({ ...ctx, user }, 'CUSTOMER_REGISTERED', { type: 'user', id: user.id, label: p });
        } else {
            if (user.status !== 'active') forbid('This account is not active. Contact support.', 'account_inactive');
            if (!user.phone_verified_at) await User.where('id', user.id).update({ phone_verified_at: now });
        }
        // Fresh session on every sign-in (no fixation).
        if (ctx.session) await SessionService.revoke(ctx.session.id, 'relogin');
        await SessionService.create(expressRes, user, ctx, { mfaPassed: true });
        await AuditService.record({ ...ctx, user }, 'LOGIN', { type: 'user', id: user.id, label: p }, { meta: { guard: 'customer', method: 'otp' } });
        return { user, isNew: !user.name };
    },
};

CustomerAuthService._internals = { DEMO_CODE, codeHash };

module.exports = CustomerAuthService;
