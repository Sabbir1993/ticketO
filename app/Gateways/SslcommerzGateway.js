// SSLCOMMERZ v4 hosted checkout (cards, bKash, Nagad, internet banking) — PCI-DSS SAQ A: card data
// is only ever entered on SSLCOMMERZ's page. https://developer.sslcommerz.com/doc/v4/
//
//   1. init       POST {SSLCZ_INIT_URL}        (…/gwprocess/v4/api.php)          → GatewayPageURL
//   2. customer pays on SSLCOMMERZ; it POSTs back to success / fail / cancel (browser) and ipn_url (server)
//   3. validate   GET  {SSLCZ_VALIDATION_URL}  (…/validator/api/validationserverAPI.php?val_id=…)
//      — the ONLY source of truth for "paid"; callback bodies are never trusted on their own
//   4. IPN bodies are additionally checked with verify_sign / verify_key (MD5 scheme of the official SDKs)
//
// Sandbox vs live is decided by the two URLs in the environment (config/ticketo.js), so switching
// dev ↔ live is an env change. Credentials arrive decrypted in memory and are never logged.
const crypto = require('crypto');

const TIMEOUT_MS = 20000;
const MIN_AMOUNT = 10; // BDT, SSLCOMMERZ limits
const MAX_AMOUNT = 500000;

function endpoints() {
    const c = config('ticketo').sslcommerz;
    for (const [name, url] of [['SSLCZ_INIT_URL', c.initUrl], ['SSLCZ_VALIDATION_URL', c.validationUrl]]) {
        let u;
        try { u = new URL(url); } catch { throw new Error(`${name} is not a valid URL`); }
        // The store password is sent to these URLs: only SSLCOMMERZ over HTTPS is allowed.
        if (u.protocol !== 'https:' || !(u.hostname === 'sslcommerz.com' || u.hostname.endsWith('.sslcommerz.com'))) throw new Error(`${name} must be an https://*.sslcommerz.com URL`);
    }
    return c;
}

const mode = () => (new URL(endpoints().initUrl).hostname.startsWith('sandbox.') ? 'sandbox' : 'live');

async function readJson(res) {
    const text = await res.text();
    try { return JSON.parse(text); } catch { throw new Error(`Unexpected response from SSLCOMMERZ (HTTP ${res.status})`); }
}

// Gateway calls go to storage/logs (laranode.log). Never the password; the Store ID only masked.
const maskId = (id) => { const v = String(id || ''); return v.length > 6 ? `${v.slice(0, 3)}…${v.slice(-2)} (${v.length} chars)` : `${'•'.repeat(v.length)} (${v.length} chars)`; };
function log(level, message, context) {
    try { use('laranode/Support/Facades/Log')[level](`[sslcommerz] ${message}`, { mode: mode(), ...context }); } catch { /* logging must never break a payment */ }
}

const md5 = (s) => crypto.createHash('md5').update(String(s), 'utf8').digest('hex');

const SslcommerzGateway = {
    MIN_AMOUNT, MAX_AMOUNT,
    mode,
    endpoints: () => ({ initUrl: endpoints().initUrl, validationUrl: endpoints().validationUrl, mode: mode() }),

    /** @returns {{ url, sessionKey }} — throws with SSLCOMMERZ's own failedreason on rejection. */
    async init({ creds, tranId, amount, contact, productName, itemCount, urls, method, refs }) {
        const total = Number(amount);
        if (!(total >= MIN_AMOUNT && total <= MAX_AMOUNT)) throw new Error(`Amount must be between ৳${MIN_AMOUNT} and ৳${MAX_AMOUNT.toLocaleString()}`);
        const params = {
            store_id: creds.storeId, store_passwd: creds.storePassword,
            total_amount: total.toFixed(2), currency: 'BDT', tran_id: tranId,
            success_url: urls.success, fail_url: urls.fail, cancel_url: urls.cancel,
            ...(urls.ipn ? { ipn_url: urls.ipn } : {}),
            cus_name: String(contact.name || 'Customer').slice(0, 50), cus_email: contact.email || 'no-reply@ticketo.com.bd',
            cus_phone: String(contact.phone || '').replace(/^\+88/, ''), cus_add1: 'Dhaka', cus_city: 'Dhaka', cus_postcode: '1000', cus_country: 'Bangladesh',
            shipping_method: 'NO', num_of_item: Math.max(1, Number(itemCount) || 1),
            product_name: String(productName || 'Event ticket').slice(0, 250), product_category: 'Event Ticket', product_profile: 'non-physical-goods',
            value_a: refs.order, value_b: refs.merchant, value_c: refs.event, // opaque ids (UUIDs), echoed back and re-checked
            ...(method?.multiCardName ? { multi_card_name: method.multiCardName } : {}),
        };
        const res = await fetch(endpoints().initUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: new URLSearchParams(params), signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        let r;
        try { r = await readJson(res); } catch (e) { log('error', 'init: unreadable response', { endpoint: endpoints().initUrl, tran_id: tranId, store: maskId(creds.storeId), http: res.status }); throw e; }
        if (String(r.status).toUpperCase() !== 'SUCCESS' || !r.GatewayPageURL) {
            log('warning', 'init rejected', { endpoint: endpoints().initUrl, tran_id: tranId, store: maskId(creds.storeId), amount: total.toFixed(2), http: res.status, status: r.status || null, failedreason: r.failedreason || null });
            throw new Error(r.failedreason || 'Could not create payment session');
        }
        log('info', 'init ok', { tran_id: tranId, store: maskId(creds.storeId), amount: total.toFixed(2) });
        return { url: r.GatewayPageURL, sessionKey: r.sessionkey || null };
    },

    /** Order Validation API. amount / currency are the customer-side values (currency_amount / currency_type). */
    async validate({ valId, creds }) {
        const q = new URLSearchParams({ val_id: valId, store_id: creds.storeId, store_passwd: creds.storePassword, v: '1', format: 'json' });
        const res = await fetch(`${endpoints().validationUrl}?${q}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        const r = await readJson(res);
        const status = String(r.status || r.APIConnect || '').toUpperCase();
        log(status === 'VALID' || status === 'VALIDATED' ? 'info' : 'warning', 'validation', { val_id: valId, store: maskId(creds.storeId), http: res.status, status, tran_id: r.tran_id || null, amount: r.amount || null, risk_level: r.risk_level ?? null });
        return {
            valid: status === 'VALID' || status === 'VALIDATED', status, tranId: r.tran_id, orderRef: r.value_a || null,
            amount: Number(r.currency_amount ?? r.amount), currency: r.currency_type || r.currency,
            storeAmount: r.store_amount !== undefined ? Number(r.store_amount) : null,
            bankTranId: r.bank_tran_id || null, cardBrand: r.card_brand || r.card_type || null,
            riskLevel: r.risk_level ?? null, riskTitle: r.risk_title || null,
        };
    },

    /**
     * IPN / callback signature: md5 over "k1=v1&k2=v2…" of the fields listed in verify_key plus
     * store_passwd = md5(store password), keys sorted ascending (as in SSLCOMMERZ's official SDKs).
     */
    verifySignature(body, storePassword) {
        if (!body?.verify_sign || !body?.verify_key || !storePassword) return false;
        const data = {};
        for (const k of String(body.verify_key).split(',').map((s) => s.trim()).filter(Boolean)) data[k] = body[k] ?? '';
        data.store_passwd = md5(storePassword);
        const text = Object.keys(data).sort().map((k) => `${k}=${data[k]}`).join('&');
        const expected = Buffer.from(md5(text));
        const given = Buffer.from(String(body.verify_sign).toLowerCase());
        return expected.length === given.length && crypto.timingSafeEqual(expected, given);
    },

    /** Credential check: opens a ৳10 session (nothing is charged). @returns {{ ok, message, mode }} */
    async test(creds, { callbackBase, merchantRef = 'platform' }) {
        try {
            await SslcommerzGateway.init({
                creds, tranId: `TEST-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, amount: MIN_AMOUNT, itemCount: 1, productName: 'Ticketo connection test',
                contact: { name: 'Ticketo test', email: 'no-reply@ticketo.com.bd', phone: '01700000000' },
                urls: { success: `${callbackBase}/test`, fail: `${callbackBase}/test`, cancel: `${callbackBase}/test` }, refs: { order: 'connection-test', merchant: merchantRef, event: 'none' },
            });
            return { ok: true, mode: mode(), message: `Connected — the SSLCOMMERZ ${mode()} store accepted the credentials.` };
        } catch (e) {
            const why = e.name === 'TimeoutError' ? 'no response within 20 s' : String(e.message).slice(0, 160);
            if (e.name === 'TimeoutError' || !/rejected|credential|de-?active/i.test(why)) log('error', 'connection test failed', { store: maskId(creds.storeId), error: why });
            const hint = /credential|de-?active/i.test(why) ? ` Check the Store ID / password, and that it is a ${mode()} store (${mode() === 'sandbox' ? 'sandbox' : 'live'} URLs are set in SSLCZ_INIT_URL / SSLCZ_VALIDATION_URL).` : '';
            return { ok: false, mode: mode(), message: `SSLCOMMERZ (${mode()}) rejected the request: ${why}.${hint}` };
        }
    },
};

module.exports = SslcommerzGateway;
