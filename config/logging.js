module.exports = {
    /*
    |--------------------------------------------------------------------------
    | Default Log Channel
    |--------------------------------------------------------------------------
    |
    | This option defines the default log channel that gets used when writing
    | messages to the logs. The name specified in this option should match
    | one of the channels defined in the "channels" configuration array.
    |
    */

    default: env('LOG_CHANNEL', 'stack'),

    /*
    |--------------------------------------------------------------------------
    | Log Viewer Settings
    |--------------------------------------------------------------------------
    |
    | Configuration for the built-in stunning Log Viewer interface.
    |
    */
    // The vendor registration stays off; Ticketo mounts /logs itself (routes/web.js → LogViewerController:
    // CMS staff only, never in production, Tailwind served locally instead of the CDN).
    allow_log_viewer: false,

    log_viewer: {
        middleware: ['auth:cms', 'permission:request_logs.view'],
        endpoint: '/logs'
    },

    /*
    |--------------------------------------------------------------------------
    | Log Channels
    |--------------------------------------------------------------------------
    |
    | Here you may configure the log channels for your application. Out of
    | the box, LaraNode uses the "single" channel, which writes to a single
    | log file. But you are free to configure other channels.
    |
    */

    channels: {
        stack: {
            driver: 'stack',
            channels: ['single'],
            ignore_exceptions: false,
        },

        single: {
            driver: 'single',
            path: base_path('storage/logs/laranode.log'),
            level: env('LOG_LEVEL', 'debug'),
        },

        daily: {
            driver: 'daily',
            path: base_path('storage/logs/laranode.log'),
            level: env('LOG_LEVEL', 'debug'),
            days: 14,
        },

        hourly: {
            driver: 'hourly',
            path: base_path('storage/logs/laranode.log'),
            level: env('LOG_LEVEL', 'debug'),
        }
    },
};
