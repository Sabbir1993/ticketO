const Route = use('laranode/Support/Facades/Route');

// Every non-API path renders the React SPA (customer site, /merchant, /admin, /pos, /gate).
// Registered last by RouteServiceProvider so it never shadows /api routes.
// Framework log viewer: local / staging only, CMS staff with request_logs.view (LOG_VIEWER=false turns it off).
if (env('APP_ENV') !== 'production' && String(env('LOG_VIEWER', 'true')) === 'true') {
    Route.group({ middleware: ['auth:cms', 'permission:request_logs.view'] }, () => {
        Route.get('/logs', 'LogViewerController@index');
        Route.get('/logs/api', 'LogViewerController@api');
        Route.delete('/logs/api', 'LogViewerController@deleteFile');
        Route.post('/logs/api/clear', 'LogViewerController@clearFile');
    });
}

Route.get('/', 'SpaController@show');
Route.get('/{*path}', 'SpaController@show');
