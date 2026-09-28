// Bridge to the browser-shared seat geometry (resources/js/shared/*.mjs). The React seat map,
// the layout designer and the server all compute seats from the SAME code, so inventory,
// booking and tickets always match the drawing.
const path = require('path');
const { pathToFileURL } = require('url');

let mods = null;
async function load() {
    if (!mods) {
        const dir = path.join(base_path('resources/js/shared'));
        const [geometry, templates] = await Promise.all([
            import(pathToFileURL(path.join(dir, 'geometry.mjs')).href),
            import(pathToFileURL(path.join(dir, 'templates.mjs')).href),
        ]);
        mods = { ...geometry, VIEW_TYPES: templates.VIEW_TYPES, seedTemplates: templates.seedTemplates };
    }
    return mods;
}

module.exports = { load };
