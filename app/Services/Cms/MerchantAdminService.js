// CMS merchant governance: list (GET /api/admin/merchants) and review actions
// (POST /api/admin/merchants/:id/review). Settlement account numbers and gateway secrets are never
// returned — only last-4 / public ids. Each action needs its own permission.
const Db = use('App/Support/Db');
const DB = use('laranode/Support/Facades/DB');
const Merchant = use('App/Models/Merchant');
const Event = use('App/Models/Event');
const AuditService = use('App/Services/AuditService');
const Access = use('App/Support/Access');
const { missing, bad } = use('App/Support/HttpError');

const mask = (last4) => (last4 ? `••••${last4}` : null);
const ACTIONS = {
    approve: 'merchants.approve', reject: 'merchants.approve',
    suspend: 'merchants.suspend', reactivate: 'merchants.suspend',
    update: 'merchants.commission',
};

async function views(merchantId = null) {
    const q = DB.table('merchants as m')
        .leftJoin('lookups as l', (j) => j.on('l.code', '=', 'm.business_type').where('l.lookup_group', '=', 'business_types'))
        .select('m.*', 'l.label as type_label').whereNull('m.deleted_at');
    if (merchantId) q.where('m.id', merchantId);
    const rows = await q.orderBy('m.created_at', 'desc').get();
    if (!rows.length) return [];
    const ids = rows.map((m) => m.id);
    const [eventCounts, gmvs] = await Promise.all([
        DB.table('events').select('merchant_id').selectRaw('COUNT(*) as n').whereIn('merchant_id', ids).whereNull('deleted_at').groupBy('merchant_id').get(),
        DB.table('orders').select('merchant_id').selectRaw('COALESCE(SUM(total), 0) as n').whereIn('merchant_id', ids).whereIn('status', ['paid', 'refund_requested']).groupBy('merchant_id').get(),
    ]);
    const EC = new Map(eventCounts.map((r) => [r.merchant_id, Number(r.n)]));
    const GM = new Map(gmvs.map((r) => [r.merchant_id, Number(r.n)]));
    for (const r of rows) { r.events_count = EC.get(r.id) || 0; r.gmv = GM.get(r.id) || 0; }
    const [owners, accounts, docs, gateways] = await Promise.all([
        DB.table('user_roles as ur').join('roles as r', 'r.id', '=', 'ur.role_id').join('users as u', 'u.id', '=', 'ur.user_id')
            .select('ur.merchant_id', 'u.name', 'u.email', 'u.phone')
            .where('r.slug', 'owner').where('r.scope', 'merchant').whereNull('u.deleted_at').whereIn('ur.merchant_id', ids).orderBy('ur.granted_at').get(),
        DB.table('merchant_settlement_accounts as a').leftJoin('banks as b', 'b.id', '=', 'a.bank_id')
            .select('a.merchant_id', 'a.type', 'a.account_name', 'a.account_no_last4', 'a.routing', 'a.branch', 'b.name as bank_name')
            .whereIn('a.merchant_id', ids).where('a.is_primary', 1).get(),
        DB.table('merchant_kyc_documents as d').join('kyc_document_types as t', 't.id', '=', 'd.document_type_id').join('media as md', 'md.id', '=', 'd.media_id')
            .select('d.merchant_id', 'd.id', 'd.status', 't.name as type', 'md.original_name as name', 'md.mime', 'md.bytes')
            .whereIn('d.merchant_id', ids).orderBy('d.id').get(),
        // Never the ciphertext itself — only whether one is stored.
        DB.table('merchant_gateway_credentials').select('merchant_id', 'gateway', 'public_id', 'sandbox', 'verified_at')
            .selectRaw('secret_ciphertext IS NOT NULL as has_secret').whereIn('merchant_id', ids).get(),
    ]);
    const by = (list) => { const m = new Map(); for (const r of list) { if (!m.has(r.merchant_id)) m.set(r.merchant_id, []); m.get(r.merchant_id).push(r); } return m; };
    const O = by(owners); const A = by(accounts); const D = by(docs); const G = by(gateways);

    return rows.map((m) => {
        const owner = O.get(m.id)?.[0];
        const acct = A.get(m.id)?.[0];
        const gw = Object.fromEntries((G.get(m.id) || []).map((g) => [g.gateway, {
            ...(g.gateway === 'sslcommerz' ? { storeId: g.public_id } : { appKey: g.public_id }),
            sandbox: !!g.sandbox, verifiedAt: g.verified_at, hasSecret: !!Number(g.has_secret),
        }]));
        return {
            id: m.uuid, name: m.name, slug: m.slug, type: m.type_label || m.business_type || '—', businessType: m.business_type,
            status: m.status, statusNote: m.status_note, commissionPct: Number(m.commission_pct), createdAt: m.created_at,
            owner: { name: owner?.name || m.contact_name || '—', email: owner?.email || m.contact_email || '', phone: owner?.phone || m.contact_phone || '—' },
            business: { legalName: m.legal_name, tradeLicense: m.trade_license, tin: m.tin, bin: m.bin, address: m.address, website: m.website },
            settlement: acct
                ? { type: acct.type, bankName: acct.bank_name, accountName: acct.account_name, accountNo: mask(acct.account_no_last4), wallet: acct.type === 'mfs' ? mask(acct.account_no_last4) : null, routing: acct.routing, branch: acct.branch, cycle: m.settlement_cycle }
                : { type: 'bank', bankName: '—', accountName: '—', accountNo: '—', cycle: m.settlement_cycle },
            kyc: { status: m.kyc_status, submittedAt: m.kyc_submitted_at, reviewedAt: m.kyc_reviewed_at, note: m.kyc_note, docs: (D.get(m.id) || []).map((d) => ({ id: d.id, type: d.type, name: d.name, status: d.status, mime: d.mime, bytes: d.bytes })) },
            pg: { mode: m.pg_mode, ...gw },
            events: Number(m.events_count), gmv: Number(m.gmv),
        };
    });
}

const MerchantAdminService = {
    list: () => views(),

    async review(ctx, uuid, { action, note, commissionPct } = {}) {
        const perm = ACTIONS[action] || bad('Unknown action');
        Access.need(ctx, perm);
        const m = await Merchant.where('uuid', String(uuid)).first() || missing('Merchant not found');
        const now = new Date();
        const patch = { updated_at: now };
        let pausedEvents = 0;

        if (commissionPct !== undefined && commissionPct !== null && commissionPct !== '' && Number(commissionPct) !== Number(m.commission_pct)) {
            Access.need(ctx, 'merchants.commission');
            const pct = Number(commissionPct);
            if (!Number.isFinite(pct) || pct < 0 || pct > 50) bad('Commission must be between 0 and 50%');
            patch.commission_pct = Math.round(pct * 100) / 100;
        }
        const clean = note ? String(note).trim().slice(0, 255) : null;
        if (action === 'approve') Object.assign(patch, { status: 'active', kyc_status: 'verified', kyc_reviewed_at: now, kyc_reviewed_by: ctx.user.id, kyc_note: clean, status_note: null });
        else if (action === 'reject') Object.assign(patch, { status: 'rejected', kyc_status: 'rejected', kyc_reviewed_at: now, kyc_reviewed_by: ctx.user.id, kyc_note: clean || 'Documents incomplete', status_note: clean || 'Documents incomplete' });
        else if (action === 'suspend') { if (m.status !== 'active') bad('Only active merchants can be suspended'); Object.assign(patch, { status: 'suspended', status_note: clean }); }
        else if (action === 'reactivate') { if (m.status !== 'suspended') bad('Merchant is not suspended'); Object.assign(patch, { status: 'active', status_note: null }); }

        await Db.independent(async () => {
            await Merchant.where('id', m.id).update(patch);
            // Suspension pauses every live event (customers can no longer buy); reactivation leaves them paused for review.
            if (action === 'suspend') {
                pausedEvents = await Event.where('merchant_id', m.id).where('status', 'published').update({ status: 'paused', review_note: 'Merchant suspended', updated_at: now });
            }
        });
        const before = { status: m.status, kyc_status: m.kyc_status, commission_pct: Number(m.commission_pct) };
        const after = { status: patch.status ?? m.status, kyc_status: patch.kyc_status ?? m.kyc_status, commission_pct: Number(patch.commission_pct ?? m.commission_pct) };
        await AuditService.record(ctx, `MERCHANT_${action.toUpperCase()}`, { type: 'merchant', id: m.id, label: m.name }, { before, after, meta: { note: clean, pausedEvents }, merchantId: m.id });
        use('App/Services/BootstrapService').invalidate();
        return (await views(m.id))[0];
    },
};

module.exports = MerchantAdminService;
