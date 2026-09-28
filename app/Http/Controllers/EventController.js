const Controller = use('App/Http/Controllers/Controller');
const CatalogService = use('App/Services/CatalogService');

class EventController extends Controller {
    // GET /api/events?city=&category=&q=&merchant=
    async index(req, res) {
        const { city, category, q, merchant } = req.query(); // framework method, not Express's object
        return res.json(await CatalogService.list({ city, category, q, merchant }));
    }

    // GET /api/events/:slug
    async show(slug, req, res) {
        return res.json(await CatalogService.detail(slug));
    }
}

module.exports = EventController;
