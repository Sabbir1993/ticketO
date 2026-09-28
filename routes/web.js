const Route = use('laranode/Support/Facades/Route');

// Every non-API path renders the React SPA (customer site, /merchant, /admin, /pos, /gate).
// Registered last by RouteServiceProvider so it never shadows /api routes.
Route.get('/', 'SpaController@show');
Route.get('/{*path}', 'SpaController@show');
