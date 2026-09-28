// Per-request forensic log, buffered in memory and batch-inserted so logging adds no latency.
// Flushed every second, when the buffer is full, and on shutdown.
const Db = use('App/Support/Db');
const DB = use('laranode/Support/Facades/DB');
const cfg = () => config('ticketo.logging', { flushEveryMs: 1000, flushBatch: 200 });

const COLUMNS = ['occurred_at', 'request_id', 'method', 'route', 'path', 'query', 'status', 'duration_ms', 'ip', 'remote_addr', 'remote_port',
    'x_forwarded_for', 'cf_connecting_ip', 'x_real_ip', 'via_proxy', 'host', 'user_agent', 'referer', 'origin', 'accept_language', 'device_hash',
    'user_id', 'user_type', 'auth_session_id', 'api_client_id', 'merchant_id', 'req_bytes', 'res_bytes', 'headers', 'body', 'error_code', 'error_message', 'blocked'];

let buffer = [];
let timer = null;
let flushing = null;

async function flush() {
    if (flushing) return flushing;
    if (!buffer.length) return;
    const batch = buffer.splice(0, buffer.length);
    flushing = (async () => {
        try {
            // Fixed column list so every row of the multi-row insert has the same shape.
            const rows = batch.map((r) => Object.fromEntries(COLUMNS.map((c) => [c, r[c] ?? null])));
            await Db.outside(async () => {
                for (let i = 0; i < rows.length; i += 200) await DB.table('request_logs').insert(rows.slice(i, i + 200));
            });
        } catch (e) {
            // Never crash the app for logging; keep a bounded backlog to retry.
            console.error('[request_logs] flush failed:', String(e.message).split('\n')[0]);
            if (buffer.length < 5000) buffer.unshift(...batch.slice(0, 5000 - buffer.length));
        } finally { flushing = null; }
    })();
    return flushing;
}

function schedule() {
    if (timer) return;
    timer = setInterval(() => { flush(); }, cfg().flushEveryMs || 1000);
    timer.unref();
}

const RequestLogService = {
    push(record) {
        buffer.push(record);
        schedule();
        if (buffer.length >= (cfg().flushBatch || 200)) flush();
    },
    flush,
    pending: () => buffer.length,
};

for (const sig of ['SIGINT', 'SIGTERM', 'beforeExit']) {
    process.once(sig, async () => { await flush(); if (sig !== 'beforeExit') process.exit(0); });
}

module.exports = RequestLogService;
