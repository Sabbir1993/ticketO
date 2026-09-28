const Route = use('laranode/Support/Facades/Route');

// Mounted under /api/pg WITHOUT CSRF — SSLCOMMERZ / bKash post back from their own domains.
// Every callback is re-validated server-to-server before an order is marked paid.

Route.post('/sslcommerz/success/{orderId}', 'PaymentGatewayController@success').middleware(['throttle:60,1']);
Route.post('/sslcommerz/fail/{orderId}', 'PaymentGatewayController@fail').middleware(['throttle:60,1']);
Route.post('/sslcommerz/cancel/{orderId}', 'PaymentGatewayController@cancel').middleware(['throttle:60,1']);
Route.post('/sslcommerz/ipn', 'PaymentGatewayController@ipn').middleware(['throttle:300,1']);
