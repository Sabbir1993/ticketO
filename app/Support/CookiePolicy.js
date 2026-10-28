// Cookie attributes for every Ticketo cookie. With embeds enabled, the site is framed by partner apps, so cookies
// must be sent cross-site: SameSite=None; Secure (HTTPS only). Otherwise keep SameSite=Lax.
const crossSite = () => config('ticketo.embed').enabled;

function cookieBase(httpOnly, maxAge) {
    const base = crossSite()
        ? { secure: true, sameSite: 'none' }
        : { secure: env('APP_ENV') === 'production', sameSite: 'lax' };
    return { httpOnly, ...base, path: '/', maxAge };
}

module.exports = { cookieBase, crossSite };
