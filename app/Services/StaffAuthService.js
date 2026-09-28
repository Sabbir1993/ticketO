// Partner & staff sign-in (merchant staff + CMS users): email + password, then TOTP when required.
//   1. login(): bcrypt check, lockout, security events. Issues a session with mfa_passed = 0 when an
//      authenticator code is still needed (CMS always when platform.cms_mfa_required; anyone with MFA on).
//   2. verifyMfa(): checks the code against the encrypted seed and marks the session; first use confirms enrolment.
// Passwords, codes and seeds are never logged or stored in plain text (seed = Envelope ciphertext).
const bcrypt = require('bcryptjs');
const User = use('App/Models/User');
const Merchant = use('App/Models/Merchant');
const MfaFactor = use('App/Models/MfaFactor');
const Envelope = use('App/Security/Envelope');
const Totp = use('App/Security/Totp');
const SessionService = use('App/Services/SessionService');
const SettingsService = use('App/Services/SettingsService');
const SecurityEventService = use('App/Services/SecurityEventService');
const AuditService = use('App/Services/AuditService');
const { HttpError, unauthorized, forbid, tooMany, bad } = use('App/Support/HttpError');

const WRONG = 'Wrong email or password';
// Compared when the account does not exist, so response time does not reveal valid emails.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', 12);
const aad = (userId) => `mfa:${userId}`;

async function needsMfa(user) {
    if (user.mfa_enabled) return true;
    return user.type === 'cms' && (await SettingsService.get('platform', 'cms_mfa_required', true)) !== false;
}

/** Start (or restart) TOTP enrolment: fresh seed, stored encrypted and unconfirmed. Returns the seed once. */
async function startEnrolment(user) {
    const secret = Totp.generateSecret();
    const { ciphertext, keyVersion } = Envelope.encrypt(secret, aad(user.id));
    const now = new Date();
    // A confirmed factor is never replaced here; an unconfirmed one gets the fresh seed.
    const existing = await MfaFactor.where('user_id', user.id).where('type', 'totp').first();
    if (!existing) await MfaFactor.create({ user_id: user.id, type: 'totp', secret_ciphertext: ciphertext, key_version: keyVersion });
    else await MfaFactor.where('id', existing.id).whereNull('confirmed_at').update({ secret_ciphertext: ciphertext, key_version: keyVersion, updated_at: now });
    const brand = (await SettingsService.get('branding', 'name', 'Ticketo')) || 'Ticketo';
    return { secret, otpauthUrl: Totp.uri(secret, user.email, brand) };
}

const StaffAuthService = {
    /** @returns {{ done: true, user } | { done: false, mfa: 'verify' } | { done: false, mfa: 'enroll', secret, otpauthUrl }} */
    async login(ctx, expressRes, { email, password } = {}) {
        const mail = String(email || '').trim().toLowerCase().slice(0, 190);
        const pw = String(password || '');
        if (!mail || !pw) bad('Enter your email and password');
        if (pw.length > 200) unauthorized(WRONG, 'auth');

        // A CMS account wins if the same email also exists as merchant staff.
        const accounts = await User.select('id', 'uuid', 'type', 'name', 'email', 'phone', 'password_hash', 'status', 'merchant_id', 'mfa_enabled', 'failed_logins', 'locked_until')
            .where('email', mail).whereIn('type', ['cms', 'merchant_staff']).get();
        const user = accounts.find((u) => u.type === 'cms') || accounts[0] || null;

        const ok = await bcrypt.compare(pw, user?.password_hash || DUMMY_HASH);
        if (user?.locked_until && new Date(user.locked_until) > new Date()) {
            SecurityEventService.record(ctx, 'login_failed', { email: mail, userId: user.id, details: { reason: 'locked' } });
            tooMany('Too many failed sign-in attempts. Please try again later.', 'locked');
        }
        if (!user || !user.password_hash || !ok) {
            if (user) {
                const max = Number(await SettingsService.get('security', 'login_max_failures', 5));
                const lockMin = Number(await SettingsService.get('security', 'login_lock_minutes', 15));
                const failed = user.failed_logins + 1;
                await User.where('id', user.id).update({ failed_logins: failed, locked_until: failed >= max ? new Date(Date.now() + lockMin * 60000) : null });
            }
            SecurityEventService.record(ctx, 'login_failed', { email: mail, userId: user?.id || null, details: { reason: user ? 'password' : 'unknown_account' } });
            unauthorized(WRONG, 'auth');
        }
        if (user.status !== 'active') {
            SecurityEventService.record(ctx, 'login_failed', { email: mail, userId: user.id, details: { reason: `status_${user.status}` } });
            forbid('This account is not active. Contact your administrator.', 'account_inactive');
        }
        const merchant = user.type === 'merchant_staff' ? await Merchant.withTrashed().select('status').where('id', user.merchant_id || 0).first() : null;
        if (user.type === 'merchant_staff' && ['suspended', 'rejected'].includes(merchant?.status)) {
            forbid('Your organisation’s account is not active. Contact Ticketo support.', 'merchant_inactive');
        }

        // Fresh session on every sign-in (no fixation); any session carried by this browser is revoked.
        if (ctx.session) await SessionService.revoke(ctx.session.id, 'relogin');
        const mfa = await needsMfa(user);
        const session = await SessionService.create(expressRes, user, ctx, { mfaPassed: !mfa });
        const actor = { ...ctx, user, session: { id: session.id } };

        if (!mfa) {
            await AuditService.record(actor, 'LOGIN', { type: 'user', id: user.id, label: user.email }, { meta: { guard: session.guard } });
            return { done: true, user };
        }
        const factor = await MfaFactor.select('confirmed_at').where('user_id', user.id).where('type', 'totp').first();
        await AuditService.record(actor, 'LOGIN_PASSWORD_OK', { type: 'user', id: user.id, label: user.email }, { meta: { guard: session.guard, mfa: factor?.confirmed_at ? 'verify' : 'enroll' } });
        if (factor?.confirmed_at) return { done: false, mfa: 'verify' };
        return { done: false, mfa: 'enroll', ...(await startEnrolment(user)) };
    },

    /** Second step: verify the authenticator code for the current (MFA-pending) session. */
    async verifyMfa(ctx, { code } = {}) {
        if (!ctx.user || !ctx.session) unauthorized('Your sign-in expired. Please sign in again.', 'auth');
        if (ctx.session.mfaPassed) return { user: ctx.user };
        const factor = await MfaFactor.select('id', 'secret_ciphertext', 'confirmed_at', 'last_used_step').where('user_id', ctx.user.id).where('type', 'totp').first();
        if (!factor) unauthorized('Set up your authenticator app first. Please sign in again.', 'mfa_setup');

        const step = Totp.verify(code, Envelope.decrypt(factor.secret_ciphertext, aad(ctx.user.id)), { lastStep: factor.last_used_step });
        if (step === null) {
            SecurityEventService.record(ctx, 'mfa_failed', { email: ctx.user.email, details: { enrolment: !factor.confirmed_at } });
            throw new HttpError(401, 'That code is not valid. Check the time on your phone and try again.', 'mfa_invalid');
        }
        // Conditional update = replay protection even under concurrent submissions of the same code.
        const changed = await MfaFactor.where('id', factor.id).whereRaw('(last_used_step IS NULL OR last_used_step < ?)', [step])
            .update({ last_used_step: step, confirmed_at: factor.confirmed_at || new Date(), updated_at: new Date() });
        if (!changed) throw new HttpError(401, 'That code was already used. Wait for the next one.', 'mfa_replay');

        await SessionService.markMfaPassed(ctx.session.id);
        const subject = { type: 'user', id: ctx.user.id, label: ctx.user.email };
        if (!factor.confirmed_at) {
            await User.where('id', ctx.user.id).update({ mfa_enabled: 1 });
            await AuditService.record(ctx, 'MFA_ENROLLED', subject, { meta: { type: 'totp' } });
        }
        await AuditService.record(ctx, 'LOGIN', subject, { meta: { guard: ctx.guard, mfa: true } });
        return { user: { ...ctx.user, mfa_enabled: true } };
    },

    async logout(ctx, expressRes) {
        if (ctx.session) {
            await SessionService.revoke(ctx.session.id, 'logout');
            if (ctx.user) await AuditService.record(ctx, 'LOGOUT', { type: 'user', id: ctx.user.id, label: ctx.user.email || ctx.user.phone });
        }
        SessionService.clearCookies(expressRes);
        return { ok: true };
    },

    needsMfa,
};

module.exports = StaffAuthService;
