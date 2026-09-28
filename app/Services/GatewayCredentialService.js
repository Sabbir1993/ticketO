// Resolves the gateway account for an order: the merchant's own (direct mode) or the platform's.
// Platform SSLCOMMERZ credentials, in order:
//   1. CMS → Payment gateways (Envelope-encrypted in gateway_settings)
//   2. environment fallback SSLCZ_STORE_ID / SSLCZ_STORE_PASSWORD (process env only — e.g. injected by
//      the host's secret manager; read at the moment of use, never copied into config, the DB or logs)
// Turning SSLCOMMERZ off in the CMS also disables the env fallback. Secrets are decrypted in memory
// only; each use is a `secret_used` security event (without the value). Returns null if not configured.
const Db = use('App/Support/Db');
const GatewaySetting = use('App/Models/GatewaySetting');
const MerchantGatewayCredential = use('App/Models/MerchantGatewayCredential');
const Envelope = use('App/Security/Envelope');
const SecurityEventService = use('App/Services/SecurityEventService');

const FIELDS = { sslcommerz: 'storeId', bkash: 'appKey' };
const ENV_FALLBACK = {
    sslcommerz: () => {
        const storeId = String(process.env.SSLCZ_STORE_ID || '').trim();
        const storePassword = String(process.env.SSLCZ_STORE_PASSWORD || '').trim();
        return storeId && storePassword ? { storeId, storePassword } : null;
    },
    bkash: () => null,
};

const GatewayCredentialService = {
    /** Where the platform account would come from right now: 'cms' | 'env' | null (no secret values). */
    async platformSource(gateway) {
        const g = await GatewaySetting.select('is_enabled', 'public_id', 'secret_ciphertext').where('gateway', gateway).first();
        if (g && !g.is_enabled) return null;
        if (g?.public_id && g.secret_ciphertext) return 'cms';
        return ENV_FALLBACK[gateway]?.() ? 'env' : null;
    },

    async resolve(ctx, { gateway, merchantId, pgMode }) {
        if (!FIELDS[gateway]) return null;
        if (pgMode === 'direct') {
            const c = await MerchantGatewayCredential.select('id', 'public_id', 'public_config', 'secret_ciphertext').where('merchant_id', merchantId).where('gateway', gateway).first();
            if (c?.public_id && c.secret_ciphertext) {
                const secrets = Envelope.decryptJson(c.secret_ciphertext, `merchant_gateway:${merchantId}:${gateway}`);
                SecurityEventService.record(ctx, 'secret_used', { details: { scope: 'merchant_gateway', gateway, merchant_id: merchantId } });
                return { pgMode: 'direct', source: 'merchant', creds: { [FIELDS[gateway]]: c.public_id, ...(Db.json(c.public_config) || {}), ...secrets } };
            }
            return null; // direct merchant without working credentials: do not silently use the platform account
        }
        const g = await GatewaySetting.select('is_enabled', 'public_id', 'public_config', 'secret_ciphertext').where('gateway', gateway).first();
        if (g && !g.is_enabled) return null;
        if (g?.public_id && g.secret_ciphertext) {
            const secrets = Envelope.decryptJson(g.secret_ciphertext, `gateway_settings:${gateway}`);
            SecurityEventService.record(ctx, 'secret_used', { details: { scope: 'platform_gateway', gateway, source: 'cms' } });
            return { pgMode: 'platform', source: 'cms', creds: { [FIELDS[gateway]]: g.public_id, ...(Db.json(g.public_config) || {}), ...secrets } };
        }
        const fromEnv = ENV_FALLBACK[gateway]?.();
        if (!fromEnv) return null;
        SecurityEventService.record(ctx, 'secret_used', { details: { scope: 'platform_gateway', gateway, source: 'env' } });
        return { pgMode: 'platform', source: 'env', creds: fromEnv };
    },
};

module.exports = GatewayCredentialService;
