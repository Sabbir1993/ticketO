const Controller = use('App/Http/Controllers/Controller');
const BootstrapService = use('App/Services/BootstrapService');

class ConfigController extends Controller {
    // GET /api/config — public, CMS-managed UI data (no secrets, only is_public settings).
    async show(req, res) {
        res.header('Cache-Control', 'public, max-age=30');
        return res.json(await BootstrapService.get());
    }
}

module.exports = ConfigController;
