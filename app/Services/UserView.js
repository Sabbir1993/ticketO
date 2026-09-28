// Safe outward shapes for users/merchants — never includes hashes, secrets or internal ids.

const ROLE = { customer: 'customer', merchant_staff: 'merchant', cms: 'admin' };

const UserView = {
    user(u, ctx) {
        if (!u) return null;
        return {
            id: u.uuid, name: u.name, email: u.email, phone: u.phone, role: ROLE[u.type] || u.type,
            ...(u.type !== 'customer' ? { roles: ctx?.roles || [], permissions: [...(ctx?.permissions || [])], superAdmin: !!ctx?.isSuperAdmin, mfaEnabled: !!u.mfa_enabled } : {}),
        };
    },

    // Portal shape (owner, business, KYC docs, masked settlement, write-only gateway fields).
    merchant(merchantId) { return use('App/Services/MerchantAccountService').view(merchantId); },
};

module.exports = UserView;
