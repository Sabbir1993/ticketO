// Frontend API contract: page-facing method names → LaraNode /api routes.
// Access control is enforced server-side (auth guards + RBAC permissions).
export const ROUTES = [
  // public
  ['getConfig', 'GET', '/config', null],
  ['listEvents', 'GET', '/events', null],
  ['getEvent', 'GET', '/events/:slug', null],
  ['getAvailability', 'GET', '/shows/:showId/availability', null],
  ['createHold', 'POST', '/holds', null],
  ['getHold', 'GET', '/holds/:holdId', null],
  ['releaseHold', 'DELETE', '/holds/:holdId', null],
  ['quote', 'POST', '/holds/:holdId/quote', null],
  ['createOrder', 'POST', '/orders', null],
  ['getOrder', 'GET', '/orders/:orderId', null],
  ['startPayment', 'POST', '/orders/:orderId/pay', null],
  ['simulatePayment', 'POST', '/orders/:orderId/simulate', null],
  ['listTemplates', 'GET', '/templates', null],
  ['getTemplate', 'GET', '/templates/:id', null],
  ['listVenues', 'GET', '/venues', null],
  // auth
  ['requestOtp', 'POST', '/auth/otp', null],
  ['verifyOtp', 'POST', '/auth/otp/verify', null],
  ['login', 'POST', '/auth/login', null],
  ['verifyMfa', 'POST', '/auth/mfa', null],
  ['logout', 'POST', '/auth/logout', 'any'],
  ['me', 'GET', '/auth/me', 'any'],
  ['registerMerchant', 'POST', '/merchants/register', null],
  // customer
  ['updateProfile', 'PATCH', '/me', 'any'],
  ['myOrders', 'GET', '/me/orders', ['customer']],
  ['requestRefund', 'POST', '/orders/:orderId/refund-request', ['customer', 'admin']],
  ['transferOrder', 'POST', '/orders/:orderId/transfer', ['customer']],
  // merchant
  ['updateMerchant', 'PATCH', '/merchant', ['merchant']],
  ['uploadKycDocs', 'POST', '/merchant/kyc', ['merchant']],
  ['updatePaymentSettings', 'PUT', '/merchant/payment-settings', ['merchant']],
  ['testPaymentConnection', 'POST', '/merchant/payment-settings/test', ['merchant']],
  ['saveEventPayment', 'PUT', '/merchant/events/:id/payment', ['merchant']],
  ['testEventPayment', 'POST', '/merchant/events/:id/payment/test', ['merchant']],
  ['merchantDashboard', 'GET', '/merchant/dashboard', ['merchant']],
  ['merchantEvents', 'GET', '/merchant/events', ['merchant', 'admin']],
  ['getMerchantEvent', 'GET', '/merchant/events/:id', ['merchant', 'admin']],
  ['saveEvent', 'POST', '/merchant/events', ['merchant', 'admin']],
  ['publishEvent', 'POST', '/merchant/events/:id/publish', ['merchant', 'admin']],
  ['setEventStatus', 'POST', '/merchant/events/:id/status', ['merchant', 'admin']],
  ['deleteEvent', 'DELETE', '/merchant/events/:id', ['merchant', 'admin']],
  ['merchantOrders', 'GET', '/merchant/orders', ['merchant', 'admin']],
  ['merchantSettlement', 'GET', '/merchant/settlement', ['merchant']],
  ['posSale', 'POST', '/pos/sales', ['merchant', 'admin']],
  ['scanTicket', 'POST', '/gate/scan', ['merchant', 'admin']],
  ['gateStats', 'GET', '/gate/stats', ['merchant', 'admin']],
  // admin
  ['adminOverview', 'GET', '/admin/overview', ['admin']],
  ['adminMerchants', 'GET', '/admin/merchants', ['admin']],
  ['reviewMerchant', 'POST', '/admin/merchants/:id/review', ['admin']],
  ['adminEvents', 'GET', '/admin/events', ['admin']],
  ['reviewEvent', 'POST', '/admin/events/:id/review', ['admin']],
  ['getAdminConfig', 'GET', '/admin/config', ['admin']],
  ['updateConfig', 'PUT', '/admin/config/:section', ['admin']],
  ['saveTemplate', 'PUT', '/templates', ['admin', 'merchant']],
  ['deleteTemplate', 'DELETE', '/templates/:id', ['admin', 'merchant']],
  ['saveVenue', 'PUT', '/admin/venues', ['admin']],
  ['adminOrders', 'GET', '/admin/orders', ['admin']],
  ['reviewRefund', 'POST', '/orders/:orderId/refund-review', ['admin', 'merchant']],
  ['auditLog', 'GET', '/admin/audit', ['admin']],
].map(([name, method, path, roles]) => ({ name, method, path, roles }));


export function buildPath(route, args = {}) {
  const used = new Set();
  const path = route.path.replace(/:(\w+)/g, (_, k) => { used.add(k); return encodeURIComponent(args[k]); });
  const rest = Object.fromEntries(Object.entries(args).filter(([k, v]) => !used.has(k) && v !== undefined && v !== null && v !== ''));
  return { path, rest };
}
