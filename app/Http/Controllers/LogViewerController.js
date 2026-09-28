// Framework log viewer (/logs), mounted by routes/web.js for CMS staff with request_logs.view, never in production.
// The vendor page pulls Tailwind from cdn.tailwindcss.com at runtime; here it gets a locally built stylesheet
// instead (npm run build:logviewer → public/vendor/log-viewer.css), so no third-party script runs next to raw logs.
const Vendor = require('../../../vendor/laranode/framework/src/Log/LogViewerController');

const CDN_TAG = '<script src="https://cdn.tailwindcss.com"></script>';
const LOCAL_CSS = '<link rel="stylesheet" href="/vendor/log-viewer.css" />';
const vendor = new Vendor();

class LogViewerController {
    async index(req, res) {
        let html = '';
        await vendor.index(req, { status: () => ({ send: (h) => { html = String(h); } }) });
        res.header('Cache-Control', 'no-store');
        return res.status(200).send(html.replace(CDN_TAG, LOCAL_CSS));
    }

    async api(req, res) { res.header('Cache-Control', 'no-store'); return vendor.api(req, res); }
    async deleteFile(req, res) { return vendor.deleteFile(req, res); }
    async clearFile(req, res) { return vendor.clearFile(req, res); }
}

module.exports = LogViewerController;
