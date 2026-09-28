// SSLCOMMERZ v4 — hosted checkout (cards, bKash, Nagad, internet banking via one integration).
// Flow: init session → redirect customer to GatewayPageURL → SSLCOMMERZ POSTs back to
// success/fail/cancel (browser) and IPN (server-to-server) → we ALWAYS re-validate with the
// Validation API before marking an order paid.
const base = (sandbox) => (sandbox ? 'https://sandbox.sslcommerz.com' : 'https://securepay.sslcommerz.com');

async function post(url, params) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error(`Unexpected response from SSLCOMMERZ (${res.status})`); }
}

export function sslcommerz(env) {
  return {
    async init({ order, event, creds, method, tranId }) {
      const cb = `${env.serverUrl}/api/pg/sslcommerz`;
      const params = {
        store_id: creds.storeId, store_passwd: creds.storePassword,
        total_amount: order.amounts.total.toFixed(2), currency: 'BDT', tran_id: tranId,
        success_url: `${cb}/success/${order.id}`, fail_url: `${cb}/fail/${order.id}`, cancel_url: `${cb}/cancel/${order.id}`,
        ...(env.ipnBaseUrl ? { ipn_url: `${env.ipnBaseUrl}/api/pg/sslcommerz/ipn` } : {}),
        cus_name: order.contact.name, cus_email: order.contact.email, cus_phone: order.contact.phone.replace('+88', ''),
        cus_add1: 'Dhaka', cus_city: 'Dhaka', cus_postcode: '1000', cus_country: 'Bangladesh',
        shipping_method: 'NO', num_of_item: order.items.reduce((a, i) => a + i.qty, 0),
        product_name: `${event.title}`.slice(0, 250), product_category: 'Event Ticket', product_profile: 'non-physical-goods',
        value_a: order.id, value_b: order.merchantId, value_c: order.eventId,
        ...(method.multiCardName ? { multi_card_name: method.multiCardName } : {}),
      };
      const r = await post(`${base(creds.sandbox !== false)}/gwprocess/v4/api.php`, params);
      if (r.status !== 'SUCCESS' || !r.GatewayPageURL) throw new Error(r.failedreason || 'Could not create payment session');
      return { url: r.GatewayPageURL, sessionKey: r.sessionkey };
    },

    async validate({ valId, creds }) {
      const q = new URLSearchParams({ val_id: valId, store_id: creds.storeId, store_passwd: creds.storePassword, v: '1', format: 'json' });
      const res = await fetch(`${base(creds.sandbox !== false)}/validator/api/validationserverAPI.php?${q}`, { signal: AbortSignal.timeout(20000) });
      const r = await res.json();
      return {
        valid: r.status === 'VALID' || r.status === 'VALIDATED', status: r.status, tranId: r.tran_id, amount: Number(r.amount),
        currency: r.currency, bankTranId: r.bank_tran_id, cardType: r.card_type, riskLevel: r.risk_level, raw: r,
      };
    },

    async refund({ order, creds, amount, remarks }) {
      const q = new URLSearchParams({ bank_tran_id: order.payment.bankTranId, refund_amount: Number(amount).toFixed(2), refund_remarks: remarks || 'Customer refund', refe_id: order.id, store_id: creds.storeId, store_passwd: creds.storePassword, format: 'json' });
      const res = await fetch(`${base(creds.sandbox !== false)}/validator/api/merchantTransIDvalidationAPI.php?${q}`, { signal: AbortSignal.timeout(20000) });
      const r = await res.json();
      if (r.APIConnect !== 'DONE' || !['success', 'processing'].includes(String(r.status).toLowerCase())) throw new Error(r.errorReason || r.status || 'Refund rejected');
      return { refId: r.refund_ref_id, message: `SSLCOMMERZ refund ${r.status}` };
    },

    // Credential check: open a ৳10 session. SUCCESS ⇒ store id/password are valid (session is never paid).
    async test(creds) {
      try {
        const r = await post(`${base(creds.sandbox !== false)}/gwprocess/v4/api.php`, {
          store_id: creds.storeId, store_passwd: creds.storePassword, total_amount: '10.00', currency: 'BDT', tran_id: `TEST-${Date.now()}`,
          success_url: `${env.serverUrl}/`, fail_url: `${env.serverUrl}/`, cancel_url: `${env.serverUrl}/`,
          cus_name: 'Connection Test', cus_email: 'test@ticketo.local', cus_phone: '01700000000', cus_add1: 'Dhaka', cus_city: 'Dhaka', cus_country: 'Bangladesh',
          shipping_method: 'NO', num_of_item: 1, product_name: 'Connection test', product_category: 'Test', product_profile: 'non-physical-goods',
        });
        return r.status === 'SUCCESS' ? { ok: true, message: `Connected to SSLCOMMERZ ${creds.sandbox !== false ? 'sandbox' : 'live'} store "${creds.storeId}"` } : { ok: false, message: r.failedreason || 'Store credentials rejected' };
      } catch (e) { return { ok: false, message: `Could not reach SSLCOMMERZ: ${e.message}` }; }
    },
  };
}
