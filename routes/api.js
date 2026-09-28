const Route = use('laranode/Support/Facades/Route');

// Mounted under /api with the `api` group (CSRF on mutating requests).
// Groups: /public (no auth), /me (customer), /merchant, /ops, /cms — see docs/ARCHITECTURE.md.

Route.get('/health', 'HealthController@show');

// Public bootstrap + session
Route.get('/config', 'ConfigController@show');
Route.get('/auth/me', 'AuthController@me');

// Catalogue
Route.get('/events', 'EventController@index');
Route.get('/events/{slug}', 'EventController@show');

// Partner & staff sign-in (merchant staff + CMS). Throttled per IP; login-scope blocks apply
// (IP/device/email); failures feed security_events → auto-block rules.
Route.post('/auth/login', 'AuthController@login').middleware(['block:login', 'throttle:10,15']);
Route.post('/auth/mfa', 'AuthController@mfa').middleware(['block:login', 'throttle:6,5,user']);
Route.post('/auth/logout', 'AuthController@logout');

// Customer sign-in by SMS code. IP- and phone-throttled on top of the per-phone cooldown in the service;
// wrong codes feed the otp_failed auto-block rules.
Route.post('/auth/otp', 'AuthController@otp').middleware(['block:login', 'throttle:10,15', 'throttle:5,15,phone']);
Route.post('/auth/otp/verify', 'AuthController@otpVerify').middleware(['block:login', 'throttle:20,15', 'throttle:10,15,phone']);

// The signed-in user's own profile and bookings.
Route.patch('/me', 'MeController@update').middleware(['auth', 'throttle:20,1']);
Route.get('/me/orders', 'MeController@orders').middleware(['auth:customer']);
Route.post('/orders/{orderId}/refund-request', 'MeController@refund').middleware(['auth:customer,cms', 'throttle:10,1']);
Route.post('/orders/{orderId}/transfer', 'MeController@transfer').middleware(['auth:customer', 'throttle:10,1']);

// Seat map
Route.get('/shows/{showId}/availability', 'ShowController@availability').middleware(['throttle:120,1']);

// Seat-plan layouts & venues — readable by the booking UI and merchant portal (results depend on the viewer).
Route.get('/templates', 'CmsController@templates');
Route.get('/templates/{id}', 'CmsController@template');
Route.get('/venues', 'CmsController@venues');
Route.put('/templates', 'CmsController@saveTemplate').middleware(['auth:cms,merchant', 'permission:layouts.manage,merchant.layouts.manage']);
Route.delete('/templates/{id}', 'CmsController@deleteTemplate').middleware(['auth:cms,merchant', 'permission:layouts.manage,merchant.layouts.manage']);
Route.post('/orders/{ref}/refund-review', 'CmsController@reviewRefund').middleware(['auth:cms,merchant', 'permission:refunds.review,merchant.refunds.review']);

// CMS (admin console): CMS users only, MFA passed, and a permission on every route.
const CONFIG_PERMS = 'permission:settings.manage,branding.manage,content.manage,gateways.manage,promos.manage';
Route.group({ prefix: '/admin', middleware: ['auth:cms'] }, () => {
    Route.get('/overview', 'CmsController@overview').middleware(['permission:cms.dashboard.view']);
    Route.get('/merchants', 'CmsController@merchants').middleware(['permission:merchants.view']);
    Route.post('/merchants/{id}/review', 'CmsController@reviewMerchant').middleware(['permission:merchants.approve,merchants.suspend,merchants.commission']);
    Route.get('/events', 'CmsController@events').middleware(['permission:events.view']);
    Route.post('/events/{id}/review', 'CmsController@reviewEvent').middleware(['permission:events.approve']);
    Route.get('/config', 'CmsController@config').middleware([CONFIG_PERMS]);
    Route.put('/config/{section}', 'CmsController@updateConfig').middleware([CONFIG_PERMS]);
    Route.post('/config/gateways/{gateway}/test', 'CmsController@testGateway').middleware(['permission:gateways.manage', 'throttle:10,10,user']);
    Route.put('/venues', 'CmsController@saveVenue').middleware(['permission:venues.manage']);
    Route.get('/orders', 'CmsController@orders').middleware(['permission:orders.view']);
    Route.get('/audit', 'CmsController@audit').middleware(['permission:audit.view']);
    Route.get('/kyc/{docId}', 'UploadController@kycDocument').middleware(['permission:kyc.documents.view']);
});

// Seat holds (seat map → checkout). Checkout-scope blocks apply; creation and promo checks are rate limited.
Route.post('/holds', 'HoldController@store').middleware(['block:checkout', 'throttle:20,1']);
Route.get('/holds/{holdId}', 'HoldController@show');
Route.delete('/holds/{holdId}', 'HoldController@destroy');
Route.post('/holds/{holdId}/quote', 'HoldController@quote').middleware(['throttle:30,1']);

// Orders & payment. Access is checked per order (buyer / holder cookie / guest key / staff).
Route.post('/orders', 'OrderController@store').middleware(['block:checkout', 'throttle:10,1']);
Route.get('/orders/{orderId}', 'OrderController@show').middleware(['throttle:120,1']);
Route.post('/orders/{orderId}/pay', 'OrderController@pay').middleware(['block:checkout', 'throttle:10,1']);
// Sandbox payment page — only registered when PAYMENT_SIMULATOR is on, and never in production.
if (config('ticketo').paymentSimulator && env('APP_ENV') !== 'production') {
    Route.post('/orders/{orderId}/simulate', 'OrderController@simulate').middleware(['throttle:20,1']);
}

// Private uploads (KYC documents) — anonymous during merchant sign-up, so tightly throttled.
Route.post('/uploads', 'UploadController@store').middleware(['block:login', 'throttle:12,10']);

// Merchant sign-up (public). Creates a pending merchant + owner account and signs the owner in.
Route.post('/merchants/register', 'MerchantController@register').middleware(['block:login', 'throttle:5,60']);

// Merchant portal: merchant staff + active-or-pending merchant (MerchantScope) + a permission per route.
Route.group({ prefix: '/merchant', middleware: ['auth:merchant', 'merchant'] }, () => {
    Route.patch('/', 'MerchantController@update').middleware(['permission:merchant.business.manage']);
    Route.post('/kyc', 'MerchantController@kyc').middleware(['permission:merchant.business.manage']);
    Route.put('/payment-settings', 'MerchantController@paymentSettings').middleware(['permission:merchant.gateway.manage']);
    Route.post('/payment-settings/test', 'MerchantController@testPayment').middleware(['permission:merchant.gateway.manage', 'throttle:10,10,user']);
    Route.get('/dashboard', 'MerchantController@dashboard').middleware(['permission:merchant.dashboard.view']);
    Route.get('/events', 'MerchantController@events').middleware(['permission:merchant.events.manage,merchant.dashboard.view,pos.sell,gate.scan']);
    Route.post('/events', 'MerchantController@saveEvent').middleware(['permission:merchant.events.manage', 'throttle:60,1,user']);
    Route.get('/events/{id}', 'MerchantController@event').middleware(['permission:merchant.events.manage']);
    Route.post('/events/{id}/publish', 'MerchantController@publish').middleware(['permission:merchant.events.publish']);
    Route.post('/events/{id}/status', 'MerchantController@status').middleware(['permission:merchant.events.publish']);
    Route.delete('/events/{id}', 'MerchantController@destroy').middleware(['permission:merchant.events.manage']);
    Route.get('/orders', 'MerchantController@orders').middleware(['permission:merchant.orders.view']);
    Route.get('/settlement', 'MerchantController@settlement').middleware(['permission:merchant.settlement.view']);
});

// Box office and gate (merchant staff).
Route.post('/pos/sales', 'OpsController@posSale').middleware(['auth:merchant', 'merchant', 'permission:pos.sell', 'throttle:60,1,user']);
Route.post('/gate/scan', 'OpsController@scan').middleware(['auth:merchant', 'merchant', 'permission:gate.scan', 'throttle:240,1,user']);
Route.get('/gate/stats', 'OpsController@gateStats').middleware(['auth:merchant', 'merchant', 'permission:gate.scan']);
