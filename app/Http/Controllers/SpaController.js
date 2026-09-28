// Serves the React SPA shell for every non-API route (customer site, merchant portal, CMS, ops).
// Dev: loads modules from the Vite dev server. Prod: reads public/build/.vite/manifest.json.
const fs = require('fs');
const path = require('path');
const Controller = use('App/Http/Controllers/Controller');
const SettingsService = use('App/Services/SettingsService');

const ENTRY = 'resources/js/main.jsx';
let manifest = null;

function assetTags() {
    if (env('APP_ENV') !== 'production' && !fs.existsSync(path.join(process.cwd(), 'public/build/.vite/manifest.json'))) {
        const vite = config('ticketo.viteDevUrl');
        return [
            `<script type="module">import RefreshRuntime from "${vite}/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(t)=>t;window.__vite_plugin_react_preamble_installed__=true;</script>`,
            `<script type="module" src="${vite}/@vite/client"></script>`,
            `<script type="module" src="${vite}/${ENTRY}"></script>`,
        ].join('\n    ');
    }
    if (!manifest) manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/build/.vite/manifest.json'), 'utf8'));
    const chunk = manifest[ENTRY];
    const css = (chunk.css || []).map((f) => `<link rel="stylesheet" href="/build/${f}" />`);
    const preload = (chunk.imports || []).map((k) => manifest[k]?.file).filter(Boolean).map((f) => `<link rel="modulepreload" href="/build/${f}" />`);
    return [...css, ...preload, `<script type="module" src="/build/${chunk.file}"></script>`].join('\n    ');
}

class SpaController extends Controller {
    // Route params come first; `/` has none and `/{*path}` has one → take the last two args.
    async show(...args) {
        const [req, res] = args.slice(-2);
        // Unmatched API paths must not fall through to the HTML shell
        if (/^\/api(\/|\?|$)/.test(req.originalUrl)) { // req.path is a framework method here
            throw use('App/Support/HttpError').missing('Not found');
        }
        const branding = await SettingsService.group('branding').catch(() => ({}));
        return res.view('app', {
            locale: 'en',
            title: `${branding.name || 'Ticketo'} — ${branding.title_suffix || 'Movies, Cricket, Concerts & Events'}`,
            themeColor: branding.primary || '#2D499A',
            assetTags: assetTags(),
        });
    }
}

module.exports = SpaController;
