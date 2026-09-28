// Auth / permission refusals. API calls get JSON; a browser opening a server page (e.g. /logs) gets a
// redirect to the right sign-in page (401) or a readable "no access" page (403) instead of raw JSON.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pathOf = (req) => String((typeof req.path === 'function' ? req.path() : req.path) || '');

function wantsPage(req) {
    return req.method === 'GET' && !pathOf(req).startsWith('/api') && String(req.headers?.accept || '').includes('text/html');
}

// Only same-site paths go into ?next= (no open redirect).
const nextOf = (req) => { const u = String(req.originalUrl || '/'); return u.startsWith('/') && !u.startsWith('//') ? u : '/'; };

function page({ title, message, actions }) {
    const btn = ([href, label, primary]) => `<a href="${esc(href)}" class="${primary ? 'p' : 's'}">${esc(label)}</a>`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Ticketo</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6f7fb;color:#0f172a;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:16px}
.c{background:#fff;border:1px solid #eceef3;border-radius:16px;box-shadow:0 8px 30px rgba(15,23,42,.06);max-width:420px;width:100%;padding:32px;text-align:center}
.i{width:52px;height:52px;border-radius:50%;background:#fdecee;color:#ee3240;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:24px;font-weight:700}
h1{font-size:20px;margin:0 0 8px}p{color:#64748b;font-size:14px;line-height:1.6;margin:0 0 24px}
a{display:block;border-radius:10px;padding:11px 16px;font-weight:600;font-size:14px;text-decoration:none;margin-top:10px}
.p{background:#2d499a;color:#fff}.s{border:1px solid #2d499a;color:#2d499a}
@media (prefers-color-scheme:dark){body{background:#0f172a;color:#e2e8f0}.c{background:#111827;border-color:#1f2937}p{color:#94a3b8}.s{color:#93a5e0;border-color:#93a5e0}}
</style></head><body><main class="c"><div class="i" aria-hidden="true">!</div><h1>${esc(title)}</h1><p>${esc(message)}</p>${actions.map(btn).join('')}</main></body></html>`;
}

const Deny = {
    /** 401 — not signed in (or MFA pending). `guards` decide which sign-in page a browser is sent to. */
    unauthenticated(req, res, body, guards = []) {
        if (!wantsPage(req)) return res.status(401).json(body);
        const raw = res.res || res;
        const staff = !guards.length || guards.some((g) => g !== 'customer');
        return raw.redirect(302, `${staff ? '/partner/login' : '/login'}?next=${encodeURIComponent(nextOf(req))}`);
    },

    /** 403 — signed in, but this account may not open it. */
    forbidden(req, res, body) {
        if (!wantsPage(req)) return res.status(403).json(body);
        const user = req.ctx?.user;
        const home = user?.type === 'cms' ? ['/admin', 'Go to Admin console', true] : user?.type === 'merchant_staff' ? ['/merchant', 'Go to Merchant portal', true] : ['/', 'Go to home page', true];
        const raw = res.res || res;
        raw.status(403).type('html').set('Cache-Control', 'no-store');
        return raw.send(page({
            title: 'You don’t have access to this page',
            message: `${body?.error?.message || 'Your role does not allow this.'} Ask a platform admin to grant the permission, or sign in with another account.`,
            actions: [home, [`/partner/login?switch=1&next=${encodeURIComponent(nextOf(req))}`, 'Sign in with another account']],
        }));
    },
};

module.exports = Deny;
