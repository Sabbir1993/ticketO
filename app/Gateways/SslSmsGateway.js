// SSL Wireless SMS (ISMS API v3). Credentials (API token + SID) come decrypted in memory from
// SmsService; the message text (it carries the OTP) is never logged or stored.
const URL_V3 = 'https://smsplus.sslwireless.com/api/v3/send-sms';
const TIMEOUT_MS = 15000;

const SslSmsGateway = {
    /** @returns {{ ok: boolean, reference?: string, error?: string }} */
    async send({ creds, msisdn, text, csmsId }) {
        const res = await fetch(creds.endpoint || URL_V3, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ api_token: creds.apiToken, sid: creds.sid, msisdn: String(msisdn).replace(/^\+/, ''), sms: text, csms_id: csmsId }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        let r = {};
        try { r = await res.json(); } catch { /* non-JSON */ }
        if (res.ok && String(r.status || '').toUpperCase() === 'SUCCESS') return { ok: true, reference: r.smsinfo?.[0]?.reference_id || null };
        return { ok: false, error: String(r.error_message || r.status || `HTTP ${res.status}`).slice(0, 120) };
    },
};

module.exports = SslSmsGateway;
