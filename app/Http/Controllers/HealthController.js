const Controller = use('App/Http/Controllers/Controller');
const Db = use('App/Support/Db');
const Setting = use('App/Models/Setting');

class HealthController extends Controller {
    // Public liveness/readiness probe — reveals no configuration.
    async show(req, res) {
        let db = 'ok';
        try { await Db.outside(() => Setting.select('id').first()); } catch { db = 'error'; }
        return res.status(db === 'ok' ? 200 : 503).json({ status: db === 'ok' ? 'ok' : 'degraded', db, time: new Date().toISOString() });
    }
}

module.exports = HealthController;
