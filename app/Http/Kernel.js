const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const BaseKernel = require('../../vendor/laranode/framework/src/Foundation/Http/Kernel');
const Pipeline = require('../../vendor/laranode/framework/src/Pipeline/Pipeline');
const HttpContext = require('../../vendor/laranode/framework/src/Foundation/Http/HttpContext');

/**
 * Ticketo HTTP kernel.
 *
 * Overrides the framework's handle() because its defaults conflict with our security rules:
 *  - it stores every POST body (passwords included) in a file-backed session via flash → removed;
 *  - it sets `trust proxy` unconditionally (spoofable IPs) → IPs come from App/Security/IpResolver;
 *  - it has no CSP / CORS allow-list → added here.
 * Route mounting, middleware resolution and controller execution are inherited unchanged.
 */
class HttpKernel extends BaseKernel {
    constructor(app, router) {
        super(app, router);

        // Global middleware, in order. Runs for every non-static request.
        this.middleware = [
            require('./Middleware/RequestContext'),
            require('./Middleware/RequestLogger'),
            require('./Middleware/BlockGuard'),
        ];

        this.middlewareGroups = {
            web: [],
            api: ['csrf'],
        };

        this.routeMiddleware = {
            auth: require('./Middleware/Authenticate'),
            permission: require('./Middleware/Permission'),
            csrf: require('./Middleware/VerifyCsrf'),
            throttle: require('./Middleware/Throttle'),
            block: require('./Middleware/BlockGuard'),
            merchant: require('./Middleware/MerchantScope'),
            bindings: require('../../vendor/laranode/framework/src/Http/Middleware/SubstituteBindings'),
        };
    }

    async handle() {
        await this.bootstrap();
        const app = this.expressApp;
        const sec = config('ticketo.security');
        const isProd = env('APP_ENV') === 'production';
        const viteDev = config('ticketo.viteDevUrl');

        app.disable('x-powered-by');
        app.set('trust proxy', false);

        app.use(helmet({
            contentSecurityPolicy: {
                useDefaults: true,
                directives: {
                    'default-src': ["'self'"],
                    'script-src': ["'self'", ...(isProd ? [] : [viteDev, "'unsafe-inline'"])],
                    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                    'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
                    'img-src': ["'self'", 'data:', 'blob:'],
                    'connect-src': ["'self'", ...(isProd ? [] : [viteDev, viteDev.replace(/^http/, 'ws')])],
                    'form-action': ["'self'", 'https://sandbox.sslcommerz.com', 'https://securepay.sslcommerz.com'],
                    'frame-ancestors': ["'none'"],
                    'upgrade-insecure-requests': isProd ? [] : null,
                },
            },
            strictTransportSecurity: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
            crossOriginEmbedderPolicy: false,
        }));

        // CORS: explicit allow-list only (same-origin SPA needs none).
        app.use((req, res, next) => {
            const origin = req.headers.origin;
            if (origin && sec.corsOrigins.includes(origin)) {
                res.setHeader('Access-Control-Allow-Origin', origin);
                res.setHeader('Vary', 'Origin');
                res.setHeader('Access-Control-Allow-Credentials', 'true');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-XSRF-TOKEN, X-Device-Id, X-Request-Id');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
            }
            if (req.method === 'OPTIONS') return res.status(origin && sec.corsOrigins.includes(origin) ? 204 : 403).end();
            next();
        });

        app.use(cookieParser());
        app.use('/build', express.static(path.join(process.cwd(), 'public/build'), { index: false, maxAge: isProd ? '30d' : 0, immutable: isProd }));
        app.use(express.static(path.join(process.cwd(), 'public'), { index: false, maxAge: isProd ? '1h' : 0 }));
        app.use('/api/uploads', express.json({ limit: '8mb' }));      // base64 KYC documents
        app.use('/api/cms/media', express.json({ limit: '12mb' }));   // CMS media library
        app.use(express.json({ limit: sec.bodyLimit }));
        app.use(express.urlencoded({ extended: false, limit: '256kb' })); // gateway callbacks are form posts

        // Global Ticketo middleware (context → logging → blocklist)
        app.use(async (req, res, next) => {
            try {
                await new Pipeline(this.app).send({ req, res, app: this.app }).through(this.middleware).then(async () => next());
            } catch (err) { next(err); }
        });

        this.mountRoutes();

        app.use((req, res, next) => {
            const error = new Error(`The route [${req.method} ${req.path}] could not be found.`);
            error.status = 404;
            next(error);
        });

        app.use((err, req, res, next) => {
            HttpContext.run({ req, res }, () => {
                const Handler = use('App/Exceptions/Handler');
                const handler = new Handler(this.app);
                handler.register();
                handler.report(err, req);
                handler.render(err, req, res);
            });
        });

        return app;
    }
}

module.exports = HttpKernel;
