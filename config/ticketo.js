// Non-secret application settings. Business rules live in the `settings` table (CMS-editable).
const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

module.exports = {
    publicUrl: String(env('PUBLIC_URL', env('APP_URL', 'http://localhost:3333'))).replace(/\/$/, ''),
    ipnBaseUrl: String(env('IPN_BASE_URL', '') || '').replace(/\/$/, ''),
    viteDevUrl: String(env('VITE_DEV_URL', 'http://localhost:5173')).replace(/\/$/, ''),

    // Simulator is never available in production, whatever the env says.
    paymentSimulator: env('APP_ENV') !== 'production' && String(env('PAYMENT_SIMULATOR', 'true')) === 'true',
    // SSLCOMMERZ endpoints — sandbox or live is decided here (env), not per store.
    // Credentials: CMS → Payment gateways (encrypted) first; SSLCZ_STORE_ID / SSLCZ_STORE_PASSWORD as fallback.
    sslcommerz: {
        initUrl: String(env('SSLCZ_INIT_URL', 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php')).trim(),
        validationUrl: String(env('SSLCZ_VALIDATION_URL', 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php')).trim(),
    },

    // Without an SMS gateway (CMS → integrations), dev/staging accepts the published demo code 123456.
    // Never in production: there, OTP login needs a configured SMS gateway.
    otpSimulator: env('APP_ENV') !== 'production' && String(env('OTP_SIMULATOR', 'true')) === 'true',

    security: {
        trustedProxies: list(env('TRUSTED_PROXIES', '127.0.0.1,::1')),
        corsOrigins: list(env('CORS_ALLOWED_ORIGINS', '')),
        bodyLimit: '2mb', // layout specs can be large
    },

    session: {
        cookie: env('SESSION_COOKIE', 'ticketo_session'),
        csrfCookie: 'XSRF-TOKEN',
        lifetimeDays: Number(env('SESSION_LIFETIME_DAYS', 30)),
        idleMinutes: Number(env('SESSION_IDLE_MINUTES', 720)),
        cmsIdleMinutes: Number(env('CMS_SESSION_IDLE_MINUTES', 30)),
    },

    logging: {
        bodyMaxBytes: 8192, // cap for redacted request body stored per request
        flushEveryMs: 1000,
        flushBatch: 200,
    },
};
