// Outbound SMS through the gateway configured in integration_credentials (provider 'sms').
// Public config (sid, endpoint) is plain; the API token is Envelope-encrypted and decrypted only here,
// at the moment of sending. Each use is a `secret_used` security event (without the value).
const IntegrationCredential = use('App/Models/IntegrationCredential');
const Envelope = use('App/Security/Envelope');
const SecurityEventService = use('App/Services/SecurityEventService');
const SslSmsGateway = use('App/Gateways/SslSmsGateway');
const Db = use('App/Support/Db');

const aad = 'integration:sms';

const SmsService = {
    /** Decrypted credentials, or null when no SMS gateway is enabled. */
    async credentials(ctx) {
        const c = await IntegrationCredential.select('is_enabled', 'public_config', 'secret_ciphertext').where('provider', 'sms').first();
        if (!c?.is_enabled || !c.secret_ciphertext) return null;
        const secrets = Envelope.decryptJson(c.secret_ciphertext, aad);
        SecurityEventService.record(ctx, 'secret_used', { details: { scope: 'integration', provider: 'sms' } });
        return { ...(Db.json(c.public_config) || {}), ...secrets };
    },

    async configured() {
        const c = await IntegrationCredential.select('is_enabled', 'secret_ciphertext').where('provider', 'sms').first();
        return !!(c?.is_enabled && c.secret_ciphertext);
    },

    /** @returns {{ ok: boolean, error?: string }} */
    async send(ctx, { to, text, reference }) {
        const creds = await SmsService.credentials(ctx);
        if (!creds) return { ok: false, error: 'not_configured' };
        try { return await SslSmsGateway.send({ creds, msisdn: to, text, csmsId: reference }); } catch (e) { return { ok: false, error: e.name === 'TimeoutError' ? 'timeout' : 'unreachable' }; }
    },
};

module.exports = SmsService;
