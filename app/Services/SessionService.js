// Cookie sessions for customers, merchant staff and CMS users.
// Cookie `ticketo_session` = random token (HttpOnly, Secure in prod, SameSite=Lax).
// Cookie `XSRF-TOKEN`      = random CSRF token readable by JS; the SPA echoes it in X-XSRF-TOKEN.
// The DB stores only keyed hashes of both (auth_sessions.token_hash / csrf_hash).
const DB = use('laranode/Support/Facades/DB');
const AuthSession = use('App/Models/AuthSession');
const User = use('App/Models/User');
const Hasher = use('App/Security/Hasher');
const IpResolver = use('App/Security/IpResolver');

const cfg = () => config('ticketo.session');
const prod = () => env('APP_ENV') === 'production';
const idleMinutes = (guard) => (guard === 'cms' ? cfg().cmsIdleMinutes : cfg().idleMinutes);
const guardFor = (user) => ({ customer: 'customer', merchant_staff: 'merchant', cms: 'cms' }[user.type]);

function cookieOpts(httpOnly, maxAgeMs) {
    return { httpOnly, secure: prod(), sameSite: 'lax', path: '/', maxAge: maxAgeMs };
}

const SessionService = {
    guardFor,

    /** Issue a fresh session + CSRF cookie on `res` (raw express response). */
    async create(res, user, ctx, { mfaPassed = false } = {}) {
        const token = Hasher.token(32);
        const csrf = Hasher.token(24);
        const guard = guardFor(user);
        const now = new Date();
        const expires = new Date(now.getTime() + cfg().lifetimeDays * 86400000);
        const idle = new Date(now.getTime() + idleMinutes(guard) * 60000);
        const session = await AuthSession.create({
            user_id: user.id, guard, token_hash: Hasher.hash(token, 'session'), csrf_hash: Hasher.hash(csrf, 'csrf'),
            mfa_passed: mfaPassed ? 1 : 0, ip: ctx?.ip ? IpResolver.toBinary(ctx.ip) : null, user_agent: ctx?.userAgent ? String(ctx.userAgent).slice(0, 512) : null,
            device_hash: ctx?.deviceHash || null, created_at: now, last_seen_at: now, idle_expires_at: idle, expires_at: expires,
        });
        const id = session.id;
        res.cookie(cfg().cookie, token, cookieOpts(true, expires.getTime() - now.getTime()));
        res.cookie(cfg().csrfCookie, csrf, cookieOpts(false, expires.getTime() - now.getTime()));
        await User.where('id', user.id).update({ last_login_at: now, last_login_ip: ctx?.ip ? IpResolver.toBinary(ctx.ip) : null, failed_logins: 0, locked_until: null });
        return { id, guard };
    },

    /** Resolve the session from the request cookie. Returns { session, user } or null. */
    async resolve(req) {
        const token = req.cookies?.[cfg().cookie];
        if (!token || token.length > 128) return null;
        const now = new Date();
        const row = await DB.table('auth_sessions as s').join('users as u', 'u.id', '=', 's.user_id')
            .select('s.id as session_id', 's.guard', 's.csrf_hash', 's.mfa_passed', 's.last_seen_at', 's.idle_expires_at', 's.expires_at',
                'u.id', 'u.uuid', 'u.type', 'u.name', 'u.email', 'u.phone', 'u.status', 'u.merchant_id', 'u.mfa_enabled')
            .where('s.token_hash', Hasher.hash(token, 'session')).whereNull('s.revoked_at')
            .where('s.expires_at', '>', now).where('s.idle_expires_at', '>', now).whereNull('u.deleted_at')
            .first();
        if (!row) return null;
        // Slide the idle window at most once a minute to avoid a write per request.
        if (now - new Date(row.last_seen_at) > 60000) {
            const idle = new Date(now.getTime() + idleMinutes(row.guard) * 60000);
            const capped = new Date(Math.min(idle.getTime(), new Date(row.expires_at).getTime())); // never past the absolute lifetime
            await AuthSession.where('id', row.session_id).update({ last_seen_at: now, idle_expires_at: capped });
        }
        const { session_id, guard, csrf_hash, mfa_passed, last_seen_at, idle_expires_at, expires_at, ...user } = row;
        return { session: { id: session_id, guard, csrfHash: csrf_hash, mfaPassed: !!mfa_passed }, user: { ...user, mfa_enabled: !!user.mfa_enabled } };
    },

    /** Double-submit CSRF check; when signed in, the token must also match the session. */
    verifyCsrf(req, session) {
        const header = req.headers['x-xsrf-token'] || req.headers['x-csrf-token'];
        const cookie = req.cookies?.[cfg().csrfCookie];
        if (!header || !cookie || header !== cookie) return false;
        return session ? Hasher.verify(header, session.csrfHash, 'csrf') : true;
    },

    /** Ensure an anonymous visitor has a CSRF cookie (GET requests). */
    ensureCsrfCookie(req, res) {
        if (!req.cookies?.[cfg().csrfCookie]) res.cookie(cfg().csrfCookie, Hasher.token(24), cookieOpts(false, 7 * 86400000));
    },

    async markMfaPassed(sessionId) { await AuthSession.where('id', sessionId).update({ mfa_passed: 1 }); },

    async revoke(sessionId, reason = 'logout') {
        await AuthSession.where('id', sessionId).whereNull('revoked_at').update({ revoked_at: new Date(), revoke_reason: reason });
    },

    /** Revoke every session of a user (password change, block, "sign out everywhere"). */
    async revokeAll(userId, reason, exceptSessionId = null) {
        await AuthSession.where('user_id', userId).whereNull('revoked_at').where('id', '!=', exceptSessionId || 0)
            .update({ revoked_at: new Date(), revoke_reason: reason });
    },

    clearCookies(res) {
        res.clearCookie(cfg().cookie, { path: '/' });
        res.clearCookie(cfg().csrfCookie, { path: '/' });
    },
};

module.exports = SessionService;
