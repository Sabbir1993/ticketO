// Who may use the mobile app: customers, and merchant staff who are ONLY box-office / gate staff.
// CMS / super-admin, merchant owners, managers and any role holding other merchant permissions are refused.
const RbacService = use('App/Services/RbacService');

const STAFF_OPS = ['pos.sell', 'gate.scan'];
const STAFF_ALLOWED = new Set([...STAFF_OPS, 'merchant.orders.view', 'merchant.dashboard.view']);

const MobileAccessService = {
    /** @param rbac { permissions:Set<string> } — from RbacService.forUser */
    allowed(user, rbac) {
        if (!user) return false;
        if (user.type === 'customer') return true;
        if (user.type !== 'merchant_staff') return false; // cms / anything else
        const perms = [...(rbac?.permissions || [])];
        if (!perms.some((p) => STAFF_OPS.includes(p))) return false;
        return perms.every((p) => STAFF_ALLOWED.has(p));
    },

    async allowedUser(user) {
        return MobileAccessService.allowed(user, await RbacService.forUser(user));
    },
};

module.exports = MobileAccessService;
