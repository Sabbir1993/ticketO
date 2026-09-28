// Permission catalogue + system roles. Seeded idempotently by RbacSeeder.
// CMS roles can be created in the CMS and combined from any of these permissions.
const P = (scope, group, list) => list.map(([slug, name, description], i) => ({ scope, group_name: group, slug, name, description, sort_order: i }));

const cms = [
    ...P('cms', 'Dashboard', [['cms.dashboard.view', 'View dashboard', 'Overview KPIs and charts']]),
    ...P('cms', 'Merchants', [
        ['merchants.view', 'View merchants', 'List and open merchant accounts'],
        ['merchants.approve', 'Approve / reject merchants', 'KYC decisions'],
        ['merchants.suspend', 'Suspend / reactivate merchants', 'Pauses all their live events'],
        ['merchants.commission', 'Set commission', 'Change commission %'],
        ['kyc.documents.view', 'View KYC documents', 'Open private KYC files (access is logged)'],
    ]),
    ...P('cms', 'Events', [
        ['events.view', 'View events', 'All events across merchants'],
        ['events.edit', 'Edit any event', 'Edit on behalf of a merchant'],
        ['events.approve', 'Approve / reject events', 'Review queue'],
    ]),
    ...P('cms', 'Seat plans', [
        ['layouts.manage', 'Manage layouts', 'Create and edit platform seat-plan templates'],
        ['layouts.publish', 'Publish layouts', 'Publish new layout versions'],
        ['seats.manage', 'Manage show seats', 'Block, release and re-price seats on any show'],
        ['venues.manage', 'Manage venues', 'Venues, gates and facilities'],
    ]),
    ...P('cms', 'Orders & payments', [
        ['orders.view', 'View orders', 'Order list without customer contact details'],
        ['orders.pii.view', 'View customer details', 'Reveal name, phone and email (access is logged)'],
        ['refunds.review', 'Review refunds', 'Approve or reject refund requests'],
        ['payments.view', 'View payments', 'Payment attempts and gateway events'],
        ['gateways.manage', 'Manage gateways', 'Payment methods and gateway credentials'],
        ['promos.manage', 'Manage promo codes', 'Platform promo codes'],
    ]),
    ...P('cms', 'Content', [
        ['content.manage', 'Manage content', 'Pages, FAQs, navigation, UI text, lookups, banners, home page'],
        ['media.manage', 'Manage media', 'Upload and delete images'],
        ['branding.manage', 'Manage branding', 'Name, colours, logo'],
        ['settings.manage', 'Manage platform rules', 'Fees, limits, approvals'],
        ['integrations.manage', 'Manage integrations', 'SMS / email provider credentials'],
    ]),
    ...P('cms', 'Access control', [
        ['users.view', 'View CMS users', 'List staff accounts'],
        ['users.manage', 'Manage CMS users', 'Invite, edit, disable staff'],
        ['roles.manage', 'Manage roles', 'Create roles and assign permissions'],
        ['customers.view', 'View customers', 'Customer accounts'],
        ['customers.manage', 'Manage customers', 'Suspend or reactivate customers'],
        ['blocks.view', 'View blocklist', 'Blocked users, IPs, devices'],
        ['blocks.manage', 'Manage blocklist', 'Block / unblock and auto-block rules'],
        ['api_clients.manage', 'Manage API clients', 'Issue and revoke API keys'],
    ]),
    ...P('cms', 'Security & logs', [
        ['audit.view', 'View audit log', 'Who changed what, with before/after'],
        ['request_logs.view', 'View request logs', 'Every HTTP request with IP and device'],
        ['security_events.view', 'View security events', 'Failed logins, denials, blocks'],
        ['data_access.view', 'View PII access log', 'Who viewed personal data'],
        ['reports.export', 'Export reports', 'CSV exports'],
    ]),
];

const merchant = [
    ...P('merchant', 'Events', [
        ['merchant.events.manage', 'Create & edit events', 'Draft events, tiers, shows'],
        ['merchant.events.publish', 'Publish events', 'Put events on sale / pause'],
        ['merchant.layouts.manage', 'Manage own layouts', 'Seat-plan designer for own layouts'],
        ['merchant.seats.manage', 'Manage show seats', 'Block, release, re-price seats'],
    ]),
    ...P('merchant', 'Sales', [
        ['merchant.orders.view', 'View orders', 'Own orders'],
        ['merchant.orders.pii.view', 'View customer details', 'Reveal buyer contact (logged)'],
        ['merchant.refunds.review', 'Review refunds', 'Approve / reject refunds'],
        ['merchant.settlement.view', 'View settlement', 'Payouts and commission'],
    ]),
    ...P('merchant', 'Account', [
        ['merchant.dashboard.view', 'View dashboard', 'KPIs'],
        ['merchant.business.manage', 'Manage business & KYC', 'Profile, documents, settlement account'],
        ['merchant.gateway.manage', 'Manage payment gateway', 'Direct-mode gateway credentials'],
        ['merchant.staff.manage', 'Manage staff & roles', 'Invite staff, assign merchant roles'],
    ]),
    ...P('merchant', 'Operations', [
        ['pos.sell', 'Box office (POS)', 'Sell walk-in tickets'],
        ['gate.scan', 'Gate scanning', 'Validate tickets at entry'],
    ]),
];

const ALL_CMS = cms.map((p) => p.slug);
const pick = (...prefixes) => ALL_CMS.filter((s) => prefixes.some((p) => s === p || s.startsWith(p)));

const roles = [
    { scope: 'cms', slug: 'super-admin', name: 'Super Admin', description: 'Full access. Cannot be edited or deleted.', permissions: ALL_CMS },
    { scope: 'cms', slug: 'operations', name: 'Operations', description: 'Merchants, events, seat plans, venues, orders', permissions: pick('cms.dashboard', 'merchants.view', 'merchants.approve', 'merchants.suspend', 'kyc.', 'events.', 'layouts.', 'seats.', 'venues.', 'orders.view', 'refunds.', 'customers.view', 'blocks.view') },
    { scope: 'cms', slug: 'finance', name: 'Finance', description: 'Payments, refunds, commission, gateways', permissions: pick('cms.dashboard', 'merchants.view', 'merchants.commission', 'orders.', 'refunds.', 'payments.', 'gateways.', 'promos.', 'reports.') },
    { scope: 'cms', slug: 'compliance', name: 'Compliance / KYC', description: 'KYC review, customers, blocklist, logs', permissions: pick('cms.dashboard', 'merchants.view', 'merchants.approve', 'kyc.', 'customers.', 'blocks.', 'audit.', 'request_logs.', 'security_events.', 'data_access.') },
    { scope: 'cms', slug: 'content-editor', name: 'Content Editor', description: 'Pages, banners, home page, media, branding', permissions: pick('cms.dashboard', 'content.', 'media.', 'branding.', 'promos.') },
    { scope: 'cms', slug: 'support', name: 'Support', description: 'Look up orders and customers, raise refunds', permissions: pick('cms.dashboard', 'events.view', 'orders.view', 'orders.pii.view', 'refunds.review', 'customers.view', 'merchants.view') },
    { scope: 'cms', slug: 'auditor', name: 'Auditor', description: 'Read-only access to logs and audit trail', permissions: pick('cms.dashboard', 'audit.', 'request_logs.', 'security_events.', 'data_access.', 'blocks.view', 'users.view') },

    // Shared merchant roles (merchant_id NULL), granted per merchant via user_roles.merchant_id.
    // Merchants can also define their own roles (roles.merchant_id set).
    { scope: 'merchant', slug: 'owner', name: 'Owner', description: 'Full merchant access', permissions: merchant.map((p) => p.slug) },
    { scope: 'merchant', slug: 'manager', name: 'Manager', description: 'Events, sales and operations', permissions: merchant.map((p) => p.slug).filter((s) => !['merchant.gateway.manage', 'merchant.staff.manage'].includes(s)) },
    { scope: 'merchant', slug: 'box-office', name: 'Box Office', description: 'POS sales and order lookup', permissions: ['pos.sell', 'merchant.orders.view', 'merchant.dashboard.view'] },
    { scope: 'merchant', slug: 'gate-staff', name: 'Gate Staff', description: 'Ticket scanning only', permissions: ['gate.scan'] },
];

module.exports = { permissions: [...cms, ...merchant], roles };
