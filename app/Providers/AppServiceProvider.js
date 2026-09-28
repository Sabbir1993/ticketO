const ServiceProvider = use('laranode/Support/ServiceProvider');

class AppServiceProvider extends ServiceProvider {
    register() {}

    boot() {
        // Refuse to boot production without the bootstrap secrets (never fall back to defaults).
        if (env('APP_ENV') === 'production') {
            const weak = ['APP_KEY', 'ENCRYPTION_KEKS', 'TICKET_SIGNING_KEY', 'SESSION_PEPPER']
                .filter((k) => !process.env[k] || process.env[k].includes('PLACEHOLDER') || process.env[k].length < 32);
            if (weak.length) throw new Error(`Refusing to start: missing or weak ${weak.join(', ')}`);
            if (String(env('APP_DEBUG')) === 'true') throw new Error('Refusing to start: APP_DEBUG must be false in production');
        }
    }
}

module.exports = AppServiceProvider;
