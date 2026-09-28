const Controller = use('App/Http/Controllers/Controller');
const UserView = use('App/Services/UserView');
const StaffAuthService = use('App/Services/StaffAuthService');
const CustomerAuthService = use('App/Services/CustomerAuthService');

// Session state for the SPA. Responses are never cached; cookies are set on the raw Express response.
class AuthController extends Controller {
    async body(req, res, user) {
        res.header('Cache-Control', 'no-store');
        return res.json({ user: UserView.user(user, req.ctx), merchant: user ? await UserView.merchant(user.merchant_id) : null });
    }

    // GET /api/auth/me — 200 with user:null when signed out (no 401 noise on boot).
    // A session still waiting for its authenticator code is reported as signed out + mfaPending.
    async me(req, res) {
        const { user, session } = req.ctx;
        if (user && !session.mfaPassed && await StaffAuthService.needsMfa(user)) {
            res.header('Cache-Control', 'no-store');
            return res.json({ user: null, merchant: null, mfaPending: true });
        }
        return this.body(req, res, user);
    }

    // POST /api/auth/login { email, password } — partner & staff sign-in.
    async login(req, res) {
        const r = await StaffAuthService.login(req.ctx, res.res, req.only(['email', 'password']));
        if (r.done) {
            // req.ctx still describes the signed-out request; load the new user's roles for the response.
            const rbac = await use('App/Services/RbacService').forUser(r.user);
            const view = { ...req.ctx, ...rbac, isSuperAdmin: r.user.type === 'cms' && rbac.roles.includes('super-admin') };
            res.header('Cache-Control', 'no-store');
            return res.json({ user: UserView.user(r.user, view), merchant: await UserView.merchant(r.user.merchant_id) });
        }
        res.header('Cache-Control', 'no-store');
        // Enrolment returns the new seed exactly once so the user can scan it; it is stored only encrypted.
        return res.json({ mfaRequired: true, mfa: r.mfa, ...(r.mfa === 'enroll' ? { otpauthUrl: r.otpauthUrl, secret: r.secret } : {}) });
    }

    // POST /api/auth/otp { phone } — customer sign-in, step 1.
    async otp(req, res) {
        res.header('Cache-Control', 'no-store');
        return res.json(await CustomerAuthService.requestOtp(req.ctx, req.only(['phone'])));
    }

    // POST /api/auth/otp/verify { phone, otp } — step 2; sets the session cookies.
    async setPassword(req, res) {
        res.header('Cache-Control', 'no-store');
        return res.json(await use('App/Services/Cms/StaffAdminService').setPassword(req.ctx, req.only(['token', 'password'])));
    }

    async otpVerify(req, res) {
        const r = await CustomerAuthService.verifyOtp(req.ctx, res.res, req.only(['phone', 'otp']));
        res.header('Cache-Control', 'no-store');
        return res.json({ user: UserView.user(r.user, req.ctx), merchant: null, isNew: r.isNew });
    }

    // POST /api/auth/mfa { code }
    async mfa(req, res) {
        const r = await StaffAuthService.verifyMfa(req.ctx, req.only(['code']));
        return this.body(req, res, r.user);
    }

    // POST /api/auth/logout
    async logout(req, res) {
        res.header('Cache-Control', 'no-store');
        return res.json(await StaffAuthService.logout(req.ctx, res.res));
    }
}

module.exports = AuthController;
