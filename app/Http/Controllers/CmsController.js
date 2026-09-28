const Controller = use('App/Http/Controllers/Controller');
const OverviewService = use('App/Services/Cms/OverviewService');
const MerchantAdminService = use('App/Services/Cms/MerchantAdminService');
const CatalogAdminService = use('App/Services/Cms/CatalogAdminService');
const ConfigAdminService = use('App/Services/Cms/ConfigAdminService');
const OrderAdminService = use('App/Services/Cms/OrderAdminService');
const StaffAdminService = use('App/Services/Cms/StaffAdminService');

// Thin HTTP layer for the admin console. Auth + permission are declared per route (routes/api.js);
// services re-check payload-dependent permissions. CMS responses are never cached.
const json = (res, data) => { res.header('Cache-Control', 'no-store'); return res.json(data); };

class CmsController extends Controller {
    async overview(req, res) { return json(res, await OverviewService.overview()); }
    async audit(req, res) { return json(res, await OverviewService.audit(req.query())); }

    async merchants(req, res) { return json(res, await MerchantAdminService.list()); }
    async reviewMerchant(id, req, res) { return json(res, await MerchantAdminService.review(req.ctx, id, req.only(['action', 'note', 'commissionPct']))); }

    async events(req, res) { return json(res, await CatalogAdminService.events({ status: req.query('status') })); }
    async reviewEvent(id, req, res) { return json(res, await CatalogAdminService.reviewEvent(req.ctx, id, req.only(['action', 'note']))); }

    async config(req, res) { return json(res, await ConfigAdminService.get()); }
    async updateConfig(section, req, res) { return json(res, await ConfigAdminService.update(req.ctx, section, req.input('value'))); }

    async templates(req, res) { return json(res, await CatalogAdminService.templates(req.ctx, { viewType: req.query('viewType') })); }
    async template(id, req, res) { return json(res, await CatalogAdminService.template(req.ctx, id)); }
    async saveTemplate(req, res) { return json(res, await CatalogAdminService.saveTemplate(req.ctx, req.input('template'))); }
    async deleteTemplate(id, req, res) { return json(res, await CatalogAdminService.deleteTemplate(req.ctx, id)); }

    async venues(req, res) { return json(res, await CatalogAdminService.venues()); }
    async saveVenue(req, res) { return json(res, await CatalogAdminService.saveVenue(req.ctx, req.input('venue'))); }

    async orders(req, res) { return json(res, await OrderAdminService.list(req.ctx, { status: req.query('status') })); }
    // Staff users & roles
    async staffUsers(req, res) { return json(res, await StaffAdminService.users()); }
    async inviteStaff(req, res) { return json(res, await StaffAdminService.invite(req.ctx, req.only(['name', 'email', 'roleIds']))); }
    async updateStaff(id, req, res) { return json(res, await StaffAdminService.update(req.ctx, id, req.only(['name', 'status', 'roleIds']))); }
    async resetStaffAccess(id, req, res) { return json(res, await StaffAdminService.resetAccess(req.ctx, id, req.only(['resetMfa']))); }
    async roles(req, res) { return json(res, await StaffAdminService.roles()); }
    async role(id, req, res) { return json(res, await StaffAdminService.role(id)); }
    async permissions(req, res) { return json(res, await StaffAdminService.catalogue()); }
    async saveRole(req, res) { return json(res, await StaffAdminService.saveRole(req.ctx, req.only(['id', 'name', 'description', 'permissions']))); }
    async deleteRole(id, req, res) { return json(res, await StaffAdminService.deleteRole(req.ctx, id)); }

    async reviewRefund(ref, req, res) { return json(res, await OrderAdminService.reviewRefund(req.ctx, ref, req.only(['action', 'note']))); }
}

module.exports = CmsController;
