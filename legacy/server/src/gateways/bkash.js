// bKash Tokenized Checkout (v1.2.0-beta) — direct wallet integration.
// Flow: grant token → create payment (returns bkashURL) → customer approves in bKash →
// bKash redirects to callbackURL?paymentID&status → execute payment → Completed.
const base = (sandbox) => (sandbox ? 'https://tokenized.sandbox.bka.sh/v1.2.0-beta' : 'https://tokenized.pay.bka.sh/v1.2.0-beta');
const tokens = new Map(); // appKey → { idToken, exp }

async function call(url, headers, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const r = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(r.statusMessage || r.message || `bKash HTTP ${res.status}`);
  return r;
}
async function grant(creds) {
  const cached = tokens.get(creds.appKey);
  if (cached && cached.exp > Date.now()) return cached.idToken;
  const r = await call(`${base(creds.sandbox !== false)}/tokenized/checkout/token/grant`, { username: creds.username, password: creds.password }, { app_key: creds.appKey, app_secret: creds.appSecret });
  if (!r.id_token) throw new Error(r.statusMessage || 'bKash token grant failed');
  tokens.set(creds.appKey, { idToken: r.id_token, exp: Date.now() + (Number(r.expires_in || 3600) - 60) * 1000 });
  return r.id_token;
}
const auth = async (creds) => ({ Authorization: await grant(creds), 'X-APP-Key': creds.appKey });

export function bkash(env) {
  return {
    async init({ order, creds, tranId }) {
      const r = await call(`${base(creds.sandbox !== false)}/tokenized/checkout/create`, await auth(creds), {
        mode: '0011', payerReference: order.contact.phone.replace('+88', ''), callbackURL: `${env.serverUrl}/api/pg/bkash/callback/${order.id}`,
        amount: order.amounts.total.toFixed(2), currency: 'BDT', intent: 'sale', merchantInvoiceNumber: tranId,
      });
      if (!r.bkashURL) throw new Error(r.statusMessage || 'bKash create payment failed');
      return { url: r.bkashURL, paymentId: r.paymentID };
    },
    async execute({ paymentId, creds }) {
      const r = await call(`${base(creds.sandbox !== false)}/tokenized/checkout/execute`, await auth(creds), { paymentID: paymentId });
      return { success: r.transactionStatus === 'Completed', amount: Number(r.amount), trxId: r.trxID, raw: r, message: r.statusMessage };
    },
    async refund({ order, creds, amount, remarks }) {
      const r = await call(`${base(creds.sandbox !== false)}/tokenized/checkout/payment/refund`, await auth(creds), { paymentID: order.payment.paymentId, trxID: order.payment.bankTranId, amount: Number(amount).toFixed(2), sku: order.eventId, reason: remarks || 'Refund' });
      if (!r.refundTrxID) throw new Error(r.statusMessage || 'bKash refund failed');
      return { refId: r.refundTrxID, message: 'bKash refund completed' };
    },
    async test(creds) {
      try { tokens.delete(creds.appKey); await grant(creds); return { ok: true, message: 'bKash token granted — credentials are valid' }; }
      catch (e) { return { ok: false, message: e.message }; }
    },
  };
}
