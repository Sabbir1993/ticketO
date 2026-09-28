// Gateway accounts belong to merchants. For an event, in order:
//   1. the event's own store (event_gateway_credentials, is_active = 1) — set in the event editor
//   2. the merchant's default store (merchant_gateway_credentials) — Settings → Payment gateway
// There is no platform or environment store. CMS → Payment gateways can still switch a gateway off
// for everyone. Secrets are Envelope-encrypted, write-only (the UI only ever sees a mask), decrypted in
// memory at the moment of use; each use is a `secret_used` security event (without the value).
const Db = use('App/Support/Db');
const GatewaySetting = use('App/Models/GatewaySetting');
const MerchantGatewayCredential = use('App/Models/MerchantGatewayCredential');
const EventGatewayCredential = use('App/Models/EventGatewayCredential');
const Envelope = use('App/Security/Envelope');
const SecurityEventService = use('App/Services/SecurityEventService');

const MASK = '••••••••';
const GATEWAYS = {
    sslcommerz: { publicId: 'storeId', secrets: ['storePassword'] },
    bkash: { publicId: 'appKey', secrets: ['appSecret', 'username', 'password'] },
};
const SCOPES = {
    merchant: { Model: MerchantGatewayCredential, key: 'merchant_id', aad: (id, g) => `merchant_gateway:${id}:${g}` },
    event: { Model: EventGatewayCredential, key: 'event_id', aad: (id, g) => `event_gateway:${id}:${g}` },
};

const find = (scope, ownerId, gateway) => SCOPES[scope].Model.where(SCOPES[scope].key, ownerId).where('gateway', gateway).first();
const usable = (row, scope) => row?.public_id && row.secret_ciphertext && (scope !== 'event' || row.is_active);

const GatewayCredentialService = {
    GATEWAYS, MASK,

    async enabled(gateway) {
        const g = await GatewaySetting.select('is_enabled').where('gateway', gateway).first();
        return !g || !!g.is_enabled;
    },

    /** UI view of one stored account: public id, masked secrets, verification. Never a secret value. */
    view(row, gateway) {
        if (!row) return null;
        const f = GATEWAYS[gateway];
        const out = { [f.publicId]: row.public_id || '', verifiedAt: row.verified_at || null };
        for (const k of f.secrets) out[k] = row.secret_ciphertext ? MASK : '';
        return out;
    },

    async viewOf(scope, ownerId, gateway) { return GatewayCredentialService.view(await find(scope, ownerId, gateway), gateway); },

    /**
     * Stores an account. Only typed secrets replace stored ones (the mask / blank keeps them). Any change
     * clears verified_at so it has to be tested again. Returns the changed secret field names.
     */
    async save(ctx, { scope, ownerId, merchantId, gateway, values = {} }) {
        const f = GATEWAYS[gateway]; const s = SCOPES[scope];
        const cur = await find(scope, ownerId, gateway);
        const publicId = String(values[f.publicId] ?? '').trim().slice(0, 120);
        const typed = f.secrets.filter((k) => typeof values[k] === 'string' && values[k].trim() !== '' && values[k] !== MASK);
        if (!cur && !publicId && !typed.length) return [];
        const patch = { public_id: publicId || cur?.public_id || null, updated_by: ctx.user?.id || null };
        if (scope === 'event') patch.is_active = 1;
        if (typed.length) {
            const secrets = cur?.secret_ciphertext ? Envelope.decryptJson(cur.secret_ciphertext, s.aad(ownerId, gateway)) : {};
            for (const k of typed) secrets[k] = String(values[k]).trim().slice(0, 500); // pasted values often carry spaces
            const { ciphertext, keyVersion } = Envelope.encryptJson(secrets, s.aad(ownerId, gateway));
            Object.assign(patch, { secret_ciphertext: ciphertext, key_version: keyVersion, secret_last4: null });
        }
        if (typed.length || patch.public_id !== cur?.public_id || (scope === 'event' && !cur?.is_active)) patch.verified_at = null;
        if (cur) await s.Model.where('id', cur.id).update({ ...patch, updated_at: new Date() });
        else await s.Model.create({ [s.key]: ownerId, ...(scope === 'event' ? { merchant_id: merchantId } : {}), gateway, ...patch });
        if (typed.length) SecurityEventService.record(ctx, 'secret_rotated', { details: { scope: `${scope}_gateway`, gateway, merchant_id: merchantId, event_id: scope === 'event' ? ownerId : undefined, fields: typed } });
        return typed.map((k) => `${gateway}.${k}`);
    },

    /** The event goes back to the merchant default. The row stays (inactive) for payments already in flight. */
    async useDefault(eventId, gateway) {
        await EventGatewayCredential.where('event_id', eventId).where('gateway', gateway).update({ is_active: 0, updated_at: new Date() });
    },

    async markVerified(source, ownerId, gateway) {
        const s = SCOPES[source];
        await s.Model.where(s.key, ownerId).where('gateway', gateway).update({ verified_at: new Date(), updated_at: new Date() });
    },

    /**
     * Account for a payment. `source` forces one scope (validation of a session opened with that account).
     * Returns { source: 'event'|'merchant', ownerId, verified, pgMode: 'direct', creds } or null.
     */
    async resolve(ctx, { gateway, merchantId, eventId = null, source = null, checkEnabled = true }) {
        if (!GATEWAYS[gateway]) return null;
        if (checkEnabled && !(await GatewayCredentialService.enabled(gateway))) return null;
        const tries = source ? [source] : ['event', 'merchant'];
        for (const scope of tries) {
            const ownerId = scope === 'event' ? eventId : merchantId;
            if (!ownerId) continue;
            const row = await find(scope, ownerId, gateway);
            // Forced source: an event account switched back to default still validates its open sessions.
            if (!(source ? row?.public_id && row.secret_ciphertext : usable(row, scope))) continue;
            const secrets = Envelope.decryptJson(row.secret_ciphertext, SCOPES[scope].aad(ownerId, gateway));
            SecurityEventService.record(ctx, 'secret_used', { details: { scope: `${scope}_gateway`, gateway, merchant_id: merchantId, event_id: eventId || undefined } });
            return {
                source: scope, ownerId, verified: !!row.verified_at, pgMode: 'direct',
                creds: { [GATEWAYS[gateway].publicId]: row.public_id, ...(Db.json(row.public_config) || {}), ...secrets },
            };
        }
        return null;
    },
};

module.exports = GatewayCredentialService;
