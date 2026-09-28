const Controller = use('App/Http/Controllers/Controller');
const CatalogService = use('App/Services/CatalogService');

class ShowController extends Controller {
    // GET /api/shows/:showId/availability — polled every 15 s by the seat map; never cached.
    async availability(showId, req, res) {
        res.header('Cache-Control', 'no-store');
        return res.json(await CatalogService.availability(showId));
    }
}

module.exports = ShowController;
