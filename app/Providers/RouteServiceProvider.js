const ServiceProvider = use('laranode/Support/ServiceProvider');
const path = require('path');

class AppRouteServiceProvider extends ServiceProvider {
    register() {}

    boot() {
        const router = this.app.make('router');

        // 1. Payment gateway callbacks — form posts from SSLCOMMERZ / bKash, no CSRF.
        router.group({ prefix: '/api/pg' }, () => this.load('routes/gateway.js'));

        // 2. JSON API (customer, merchant, ops, cms) — CSRF on every mutating request.
        router.group({ prefix: '/api', middleware: ['api'] }, () => this.load('routes/api.js'));

        // 3. SPA shell catch-all. Must be registered LAST (routes mount in order).
        router.group({ middleware: ['web'] }, () => this.load('routes/web.js'));
    }

    load(file) {
        const full = path.join(this.app.make('path.base'), file);
        delete require.cache[require.resolve(full)];
        require(full);
    }
}

module.exports = AppRouteServiceProvider;
