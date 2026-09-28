// Merchant self-service: sign-up (POST /api/merchants/register), business & KYC, settlement account
// and direct-mode payment gateway. Secrets never leave the server:
//   · owner password → bcrypt only
//   · settlement account / wallet number → Envelope ciphertext + last 4 (shown masked)
//   · gateway secrets (SSLCOMMERZ store password, bKash app secret / username / password) → Envelope JSON,
//     write-only (the UI gets '••••••••'); typing a new value replaces it, the mask keeps it
const bcrypt = require('bcryptjs');
const Db = use('App/Support/Db');
const DB = use('laranode/Support/Facades/DB');
const Merchant = use('App/Models/Merchant');
const User = use('App/Models/User');
const Role = use('App/Models/Role');
const UserRole = use('App/Models/UserRole');
const Bank = use('App/Models/Bank');
const Lookup = use('App/Models/Lookup');
const KycDocumentType = use('App/Models/KycDocumentType');
const MerchantKycDocument = use('App/Models/MerchantKycDocument');
const MerchantSettlementAccount = use('App/Models/MerchantSettlementAccount');
const MerchantGatewayCredential = use('App/Models/MerchantGatewayCredential');
const MerchantAgreementAcceptance = use('App/Models/MerchantAgreementAcceptance');
const CmsPage = use('App/Models/CmsPage');
const Envelope = use('App/Security/Envelope');
const IpResolver = use('App/Security/IpResolver');
const SettingsService = use('App/Services/SettingsService');
const SessionService = use('App/Services/SessionService');
const MediaService = use('App/Services/MediaService');
const BlockService = use('App/Services/BlockService');
const AuditService = use('App/Services/AuditService');
const SecurityEventService = use('App/Services/SecurityEventService');
const Access = use('App/Support/Access');
const { uuid, slugify } = use('App/Support/Ids');
const { bad, forbid, missing } = use('App/Support/HttpError');

const MASK = '••••••••';
const masked = (last4) => (last4 ? `••••${last4}` : '');
const isMask = (v) => typeof v === 'string' && v.startsWith('••••');
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const settleAad = (merchantId) => `settlement:${merchantId}`;
const gwAad = (merchantId, gateway) => `merchant_gateway:${merchantId}:${gateway}`;
const GATEWAYS = {
    sslcommerz: { publicId: 'storeId', secrets: ['storePassword'] },
    bkash: { publicId: 'appKey', secrets: ['appSecret', 'username', 'password'] },
};

async function lookupCode(group, label, fallback) {
    const l = String(label || '').trim();
    if (!l) return fallback;
    const hit = await Lookup.select('code').where('lookup_group', group).whereRaw('(LOWER(label) = ? OR code = ?)', [l.toLowerCase(), l]).first();
    return hit?.code || fallback;
}

function businessPatch(business = {}) {
    const p = {};
    if (business.name !== undefined) { p.name = str(business.name, 190); if (p.name.length < 2) bad('Business / brand name is required'); }
    if (business.legalName !== undefined) p.legal_name = str(business.legalName, 190) || null;
    if (business.tradeLicense !== undefined) { p.trade_license = str(business.tradeLicense, 80); if (!p.trade_license) bad('Trade licence number is required'); }
    if (business.tin !== undefined) p.tin = str(business.tin, 40) || null;
    if (business.bin !== undefined) p.bin = str(business.bin, 40) || null;
    if (business.address !== undefined) p.address = str(business.address, 255) || null;
    if (business.website !== undefined) {
        const w = str(business.website, 190);
        if (w && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(w)) bad('Website must start with http:// or https://');
        p.website = w || null;
    }
    return p;
}

/** Validate + encrypt a settlement account. `current` keeps the stored number when the UI sends the mask. */
async function settlementRow(merchantId, s = {}, current = null) {
    const type = s.type === 'mfs' ? 'mfs' : 'bank';
    const row = { type, key_version: current?.key_version || null };
    if (type === 'bank') {
        const name = str(s.bankName, 120);
        // Tolerant match: 'BRAC Bank', 'brac bank plc' and 'BRAC' all find 'BRAC Bank PLC'.
        const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(plc|ltd|limited|bank|the)\b/g, ' ').replace(/\s+/g, ' ').trim();
        const bank = name ? (await Bank.select('id', 'name', 'short_name').where('is_active', 1).where('kind', 'bank').get()).find((x) => norm(x.name) === norm(name) || norm(x.short_name) === norm(name)) : null;
        if (!bank) bad(name ? `Unknown bank "${name}" — use the bank’s full or short name (e.g. BRAC Bank)` : 'Bank name is required');
        row.bank_id = bank.id;
        row.account_name = str(s.accountName, 150) || bad('Account name is required');
        row.routing = str(s.routing, 20) || null;
        row.branch = str(s.branch, 120) || null;
    } else {
        row.bank_id = null; row.account_name = str(s.accountName, 150) || null; row.routing = null; row.branch = null;
    }
    const raw = type === 'bank' ? s.accountNo : s.wallet;
    if (isMask(raw) && current?.account_no_ciphertext && current.type === type) return row; // unchanged
    const number = String(raw || '').replace(/[\s-]/g, '');
    if (type === 'bank' && !/^\d{6,20}$/.test(number)) bad('Enter a valid bank account number (digits only)');
    if (type === 'mfs' && !BlockService.normPhone(number)) bad('Enter a valid wallet number (01XXXXXXXXX)');
    const plain = type === 'mfs' ? BlockService.normPhone(number) : number;
    const { ciphertext, keyVersion } = Envelope.encrypt(plain, settleAad(merchantId));
    return { ...row, account_no_ciphertext: ciphertext, account_no_last4: plain.slice(-4), key_version: keyVersion };
}

async function saveSettlement(merchantId, s, current) {
    const row = await settlementRow(merchantId, s, current);
    if (current) await MerchantSettlementAccount.where('id', current.id).update({ ...row, updated_at: new Date() });
    else await MerchantSettlementAccount.create({ merchant_id: merchantId, ...row, is_primary: 1 });
}

/** Store direct-mode credentials; returns the list of changed secret fields (names only). */
async function saveGateway(ctx, merchantId, gateway, v = {}) {
    const f = GATEWAYS[gateway];
    const cur = await MerchantGatewayCredential.where('merchant_id', merchantId).where('gateway', gateway).first();
    const publicId = str(v[f.publicId], 120);
    const typed = f.secrets.filter((k) => typeof v[k] === 'string' && v[k] !== '' && v[k] !== MASK);
    if (!cur && !publicId && !typed.length) return [];
    const patch = { public_id: publicId || cur?.public_id || null, sandbox: v.sandbox === false ? 0 : 1, updated_by: ctx.user?.id || null };
    if (typed.length) {
        const secrets = cur?.secret_ciphertext ? Envelope.decryptJson(cur.secret_ciphertext, gwAad(merchantId, gateway)) : {};
        for (const k of typed) secrets[k] = String(v[k]).slice(0, 500);
        const { ciphertext, keyVersion } = Envelope.encryptJson(secrets, gwAad(merchantId, gateway));
        Object.assign(patch, { secret_ciphertext: ciphertext, key_version: keyVersion, secret_last4: null });
    }
    // Any change to the account invalidates an earlier successful connection test.
    if (typed.length || patch.public_id !== cur?.public_id || Number(patch.sandbox) !== Number(cur?.sandbox ?? 1)) patch.verified_at = null;
    if (cur) await MerchantGatewayCredential.where('id', cur.id).update({ ...patch, updated_at: new Date() });
    else await MerchantGatewayCredential.create({ merchant_id: merchantId, gateway, ...patch });
    if (typed.length) SecurityEventService.record(ctx, 'secret_rotated', { details: { scope: 'merchant_gateway', gateway, merchant_id: merchantId, fields: typed } });
    return typed.map((k) => `${gateway}.${k}`);
}

async function attachDocs(ctx, merchantId, docs = []) {
    if (!docs.length) return 0;
    const media = await MediaService.claimable(ctx, docs.map((d) => d.fileId));
    const byUuid = new Map(media.map((m) => [m.uuid, m]));
    const types = await KycDocumentType.select('id', 'code', 'name').where('is_active', 1).get();
    const fallback = types.find((t) => t.code === 'additional') || types[types.length - 1];
    for (const d of docs) {
        const t = types.find((x) => x.name === d.type || x.code === d.type) || fallback;
        await MerchantKycDocument.create({ merchant_id: merchantId, document_type_id: t.id, media_id: byUuid.get(String(d.fileId)).id, status: 'submitted' });
    }
    await DB.table('media').whereIn('id', media.map((m) => m.id)).update({ merchant_id: merchantId, updated_at: new Date() });
    return docs.length;
}

const MerchantAccountService = {
    MASK,

    /** The merchant as the portal sees it — masked settlement number, write-only gateway secrets. */
    async view(merchantId) {
        if (!merchantId) return null;
        const m = await Merchant.where('id', merchantId).first();
        if (!m) return null;
        const [typeLabel, account, docs, creds] = await Promise.all([
            Lookup.select('label').where('lookup_group', 'business_types').where('code', m.business_type || '').first(),
            DB.table('merchant_settlement_accounts as a').leftJoin('banks as b', 'b.id', '=', 'a.bank_id')
                .select('a.type', 'a.account_name', 'a.account_no_last4', 'a.routing', 'a.branch', 'b.name as bank_name').where('a.merchant_id', m.id).where('a.is_primary', 1).first(),
            DB.table('merchant_kyc_documents as d').join('kyc_document_types as t', 't.id', '=', 'd.document_type_id').join('media as md', 'md.id', '=', 'd.media_id')
                .select('d.id', 'd.status', 't.name as type', 'md.original_name as name', 'md.bytes').where('d.merchant_id', m.id).orderBy('d.id').get(),
            MerchantGatewayCredential.select('gateway', 'public_id', 'secret_ciphertext', 'sandbox', 'verified_at').where('merchant_id', m.id).get(),
        ]);
        const gw = (g) => {
            const c = creds.find((x) => x.gateway === g);
            if (!c) return undefined;
            const base = { [GATEWAYS[g].publicId]: c.public_id || '', sandbox: !!c.sandbox, verifiedAt: c.verified_at || null };
            for (const k of GATEWAYS[g].secrets) base[k] = c.secret_ciphertext ? MASK : '';
            return base;
        };
        return {
            id: m.uuid, name: m.name, slug: m.slug, type: typeLabel?.label || m.business_type, businessType: m.business_type,
            status: m.status, statusNote: m.status_note, commissionPct: Number(m.commission_pct), kycStatus: m.kyc_status, settlementCycle: m.settlement_cycle,
            owner: { name: m.contact_name, email: m.contact_email, phone: m.contact_phone },
            business: { name: m.name, legalName: m.legal_name || '', tradeLicense: m.trade_license || '', tin: m.tin || '', bin: m.bin || '', address: m.address || '', website: m.website || '' },
            kyc: { status: m.kyc_status, note: m.kyc_note, submittedAt: m.kyc_submitted_at, docs: docs.map((d) => ({ id: d.id, type: d.type, name: d.name, size: Number(d.bytes), status: d.status })) },
            settlement: account ? {
                type: account.type, bankName: account.bank_name || '', accountName: account.account_name || '', routing: account.routing || '', branch: account.branch || '',
                accountNo: account.type === 'bank' ? masked(account.account_no_last4) : '', wallet: account.type === 'mfs' ? masked(account.account_no_last4) : '', cycle: m.settlement_cycle,
            } : { type: 'bank', cycle: m.settlement_cycle },
            pg: { mode: m.pg_mode, sslcommerz: gw('sslcommerz'), bkash: gw('bkash') },
        };
    },

    async register(ctx, expressRes, { owner = {}, business = {}, settlement = {}, pg = {}, docs = [] } = {}) {
        const name = str(owner.name, 150);
        const email = BlockService.normEmail(owner.email).slice(0, 190);
        const phone = BlockService.normPhone(owner.phone);
        const password = String(owner.password || '');
        if (name.length < 2) bad('Owner name is required');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) bad('A valid email is required');
        if (!phone) bad('A valid mobile number is required (01XXXXXXXXX)');
        if (password.length < 8 || password.length > 200) bad('Password must be at least 8 characters');
        if (password.toLowerCase().includes(email.split('@')[0]) && email.split('@')[0].length >= 4) bad('Password must not contain your email name');
        const biz = businessPatch({ ...business, name: business.name ?? '', tradeLicense: business.tradeLicense ?? '' });
        if (!Array.isArray(docs) || docs.length > 10) bad('Invalid documents');
        const block = await BlockService.find(ctx, { scope: 'login', email, phone });
        if (block) { await BlockService.hit(block, ctx).catch(() => {}); forbid('Registration from this account or network is restricted. Contact support.', 'blocked'); }
        if (await User.withTrashed().where('type', 'merchant_staff').where('email', email).exists()) bad('An account with this email already exists — sign in instead');

        const [auto, commission, allowDirect, ownerRole, agreement] = await Promise.all([
            SettingsService.get('platform', 'merchant_auto_approve', false),
            SettingsService.get('platform', 'default_commission_pct', 8),
            SettingsService.get('platform', 'allow_merchant_direct_pg', true),
            Role.select('id').where('scope', 'merchant').where('slug', 'owner').whereNull('merchant_id').first(),
            CmsPage.select('current_version_id').where('slug', 'merchant-agreement').first(),
        ]);
        if (!ownerRole) throw new Error('Merchant owner role is missing — run the RBAC seeder');
        if (pg.mode === 'direct' && !allowDirect) bad('Direct gateway connection is disabled by the platform');
        const businessType = await lookupCode('business_types', business.type, 'event-organiser');
        const hash = await bcrypt.hash(password, 12);
        const now = new Date();

        const { merchant, user } = await Db.transaction(async () => {
            let slug = slugify(biz.name, 110);
            if (await Merchant.withTrashed().where('slug', slug).exists()) slug = `${slug}-${uuid().slice(0, 6)}`;
            const m = await Merchant.create({
                uuid: uuid(), name: biz.name, slug, business_type: businessType, status: auto ? 'active' : 'pending', commission_pct: Number(commission),
                legal_name: biz.legal_name || biz.name, trade_license: biz.trade_license, tin: biz.tin || null, bin: biz.bin || null, address: biz.address || null, website: biz.website || null,
                contact_name: name, contact_email: email, contact_phone: phone, pg_mode: 'platform',
                kyc_status: auto ? 'verified' : 'submitted', kyc_submitted_at: now, settlement_cycle: 'weekly',
            });
            const u = await User.create({ uuid: uuid(), type: 'merchant_staff', name, email, password_hash: hash, status: 'active', merchant_id: m.id });
            await UserRole.create({ user_id: u.id, role_id: ownerRole.id, merchant_id: m.id, granted_by: null, granted_at: now });
            await saveSettlement(m.id, settlement, null);
            await attachDocs(ctx, m.id, docs); // uploads made by this visitor (signed-out uploads have no owner)
            if (pg.mode === 'direct') {
                await saveGateway({ ...ctx, user: u }, m.id, 'sslcommerz', pg.sslcommerz);
                await saveGateway({ ...ctx, user: u }, m.id, 'bkash', pg.bkash);
                await Merchant.where('id', m.id).update({ pg_mode: 'direct' });
            }
            if (agreement?.current_version_id) {
                await MerchantAgreementAcceptance.create({ merchant_id: m.id, user_id: u.id, page_version_id: agreement.current_version_id, accepted_at: now, ip: ctx.ip ? IpResolver.toBinary(ctx.ip) : null, user_agent: ctx.userAgent ? String(ctx.userAgent).slice(0, 512) : null });
            }
            return { merchant: m, user: u };
        });

        if (ctx.session) await SessionService.revoke(ctx.session.id, 'relogin');
        await SessionService.create(expressRes, user, ctx, { mfaPassed: true });
        const actor = { ...ctx, user };
        await AuditService.record(actor, 'MERCHANT_REGISTERED', { type: 'merchant', id: merchant.id, label: merchant.name }, { meta: { status: merchant.status, docs: docs.length, pg: pg.mode || 'platform' }, merchantId: merchant.id });
        return { user, merchant: await MerchantAccountService.view(merchant.id) };
    },

    async update(ctx, { business, settlement, owner, type } = {}) {
        Access.need(ctx, 'merchant.business.manage');
        const m = await Merchant.where('id', ctx.merchantId).first() || missing('Merchant not found');
        const patch = business ? businessPatch(business) : {};
        if (type !== undefined) patch.business_type = await lookupCode('business_types', type, m.business_type);
        if (owner?.name !== undefined) { patch.contact_name = str(owner.name, 150); if (patch.contact_name.length < 2) bad('Owner name is required'); }
        const before = { name: m.name, legal_name: m.legal_name, trade_license: m.trade_license, tin: m.tin, bin: m.bin, address: m.address, website: m.website };
        await Db.transaction(async () => {
            if (Object.keys(patch).length) await Merchant.where('id', m.id).update({ ...patch, updated_at: new Date() });
            if (settlement) {
                const current = await MerchantSettlementAccount.where('merchant_id', m.id).where('is_primary', 1).first();
                await saveSettlement(m.id, settlement, current);
            }
        });
        await AuditService.record(ctx, 'MERCHANT_UPDATED', { type: 'merchant', id: m.id, label: patch.name || m.name }, { before, after: patch, meta: { settlementChanged: !!settlement }, merchantId: m.id });
        return MerchantAccountService.view(m.id);
    },

    async addKycDocs(ctx, { docs = [] } = {}) {
        Access.need(ctx, 'merchant.business.manage');
        if (!Array.isArray(docs) || !docs.length || docs.length > 10) bad('Choose a document to upload');
        const m = await Merchant.where('id', ctx.merchantId).first() || missing('Merchant not found');
        await Db.transaction(async () => {
            await attachDocs(ctx, m.id, docs);
            // New documents after a rejection send the account back to review.
            if (m.kyc_status === 'rejected') await Merchant.where('id', m.id).update({ kyc_status: 'submitted', status: m.status === 'rejected' ? 'pending' : m.status, kyc_submitted_at: new Date(), updated_at: new Date() });
        });
        await AuditService.record(ctx, 'KYC_DOCUMENTS_ADDED', { type: 'merchant', id: m.id, label: m.name }, { meta: { count: docs.length }, merchantId: m.id });
        return MerchantAccountService.view(m.id);
    },

    async updatePaymentSettings(ctx, { mode, sslcommerz, bkash } = {}) {
        Access.need(ctx, 'merchant.gateway.manage');
        const m = await Merchant.where('id', ctx.merchantId).first() || missing('Merchant not found');
        if (mode && !['platform', 'direct'].includes(mode)) bad('Unknown collection mode');
        if (mode === 'direct' && !(await SettingsService.get('platform', 'allow_merchant_direct_pg', true))) bad('Direct gateway connection is disabled by the platform');
        const changed = [];
        await Db.transaction(async () => {
            if (sslcommerz) changed.push(...await saveGateway(ctx, m.id, 'sslcommerz', sslcommerz));
            if (bkash) changed.push(...await saveGateway(ctx, m.id, 'bkash', bkash));
            if (mode === 'direct') {
                const c = await MerchantGatewayCredential.where('merchant_id', m.id).where('gateway', 'sslcommerz').first();
                if (!c?.public_id || !c.secret_ciphertext) bad('Enter your SSLCOMMERZ Store ID and Store Password to collect directly');
            }
            if (mode && mode !== m.pg_mode) await Merchant.where('id', m.id).update({ pg_mode: mode, updated_at: new Date() });
        });
        await AuditService.record(ctx, 'PG_SETTINGS_UPDATED', { type: 'merchant', id: m.id, label: m.name }, { before: { mode: m.pg_mode }, after: { mode: mode || m.pg_mode }, meta: { secretsChanged: changed }, merchantId: m.id });
        return MerchantAccountService.view(m.id);
    },

    /** Opens a real (sandbox or live) session with the merchant's own credentials; nothing is charged. */
    async testConnection(ctx, { gateway = 'sslcommerz' } = {}) {
        Access.need(ctx, 'merchant.gateway.manage');
        if (gateway !== 'sslcommerz') return { ok: false, message: 'bKash direct checkout is not available yet — use SSLCOMMERZ (it includes bKash).' };
        const m = await Merchant.where('id', ctx.merchantId).first() || missing('Merchant not found');
        const resolved = await use('App/Services/GatewayCredentialService').resolve(ctx, { gateway, merchantId: m.id, pgMode: 'direct' });
        if (!resolved) bad('Enter Store ID and Store Password first');
        const cb = `${config('ticketo').publicUrl}/api/pg/sslcommerz`;
        let result;
        try {
            await use('App/Gateways/SslcommerzGateway').init({
                creds: resolved.creds, tranId: `TEST-${m.uuid.slice(0, 8)}-${Date.now()}`, amount: 10, itemCount: 1, productName: 'Ticketo connection test',
                contact: { name: m.contact_name || m.name, email: m.contact_email || 'test@example.com', phone: m.contact_phone || '01700000000' },
                urls: { success: `${cb}/test`, fail: `${cb}/test`, cancel: `${cb}/test`, ipn: null }, refs: { order: 'connection-test', merchant: m.uuid, event: 'none' },
            });
            await MerchantGatewayCredential.where('merchant_id', m.id).where('gateway', gateway).update({ verified_at: new Date(), updated_at: new Date() });
            result = { ok: true, message: `Connected — SSLCOMMERZ ${resolved.creds.sandbox !== false ? 'sandbox' : 'live'} store accepted the credentials.` };
        } catch (e) {
            result = { ok: false, message: `SSLCOMMERZ rejected the credentials: ${use('App/Security/Redactor').errorMessage(e.message).slice(0, 160)}` };
        }
        await AuditService.record(ctx, result.ok ? 'PG_VERIFIED' : 'PG_VERIFY_FAILED', { type: 'merchant', id: m.id, label: m.name }, { meta: { gateway }, merchantId: m.id });
        return result;
    },
};

module.exports = MerchantAccountService;
