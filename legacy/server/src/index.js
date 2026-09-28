import express from 'express';
import cors from 'cors';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { env, ROOT } from './env.js';
import { loadDb, scheduleSave, flush } from './db.js';
import { hashPassword, verifyPassword, encrypt, decrypt, token, newId } from './security.js';
import { createCore, ApiError } from '../../shared/core.js';
import { ROUTES, checkAccess } from '../../shared/routes.js';
import { sslcommerz } from './gateways/sslcommerz.js';
import { bkash } from './gateways/bkash.js';

const db = loadDb();
const gateways = { sslcommerz: sslcommerz(env), bkash: bkash(env) };
const core = createCore(db, { id: newId, token, hash: hashPassword, verify: verifyPassword, encrypt, decrypt, gateways });
const { api } = core;
const pgEnv = { clientUrl: env.clientUrl, serverUrl: env.serverUrl, fallbackToSimulator: env.fallbackToSimulator };

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(cors({ origin: true, credentials: false }));
app.use('/api/pg', express.urlencoded({ extended: false })); // gateway callbacks are form posts
app.use(express.json({ limit: '8mb' }));

// ---- auth: Authorization: Bearer <token>
app.use((req, _res, next) => {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  req.token = t || null;
  req.user = t ? core.resolveUser(t) : null;
  next();
});

// ---- KYC document upload (base64 JSON → file on disk). Returns fileId stored on the merchant.
const ALLOWED = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
app.post('/api/uploads', (req, res) => {
  const { name = 'file', type, dataUrl } = req.body || {};
  if (!ALLOWED[type] || !/^data:[^;]+;base64,/.test(dataUrl || '')) return res.status(400).json({ error: { message: 'Only PDF, JPG, PNG or WEBP files' } });
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  if (buf.length > 5 * 1024 * 1024) return res.status(400).json({ error: { message: 'Max 5 MB per file' } });
  mkdirSync(env.uploadsDir, { recursive: true });
  const fileId = `${newId('F')}.${ALLOWED[type]}`;
  writeFileSync(path.join(env.uploadsDir, fileId), buf);
  res.json({ fileId, name, type, size: buf.length });
});
app.get('/api/uploads/:fileId', (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).end();
  const f = path.join(env.uploadsDir, path.basename(req.params.fileId));
  if (!existsSync(f)) return res.status(404).end();
  res.sendFile(f);
});

// ---- Payment gateway callbacks -------------------------------------------------------
const orderIdFromTran = (tranId = '') => tranId.slice(0, tranId.lastIndexOf('-'));
const redirectTo = (res, o, ok, reason) => res.redirect(303, ok ? `${env.clientUrl}/booking/${o.id}?new=1` : `${env.clientUrl}/payment/${o.id}?failed=${encodeURIComponent(reason || 'failed')}`);

async function finishSslcommerz(orderId, valId) {
  const o = core.orderBy(orderId);
  if (!o) throw new ApiError(404, 'Order not found');
  const { creds } = core.gatewayCreds(orderId, 'sslcommerz');
  const v = await gateways.sslcommerz.validate({ valId, creds });
  const ok = v.valid && v.tranId === o.payment?.tranId && v.currency === 'BDT' && v.amount + 0.001 >= o.amounts.total;
  const r = await api.completePayment({ orderId, gateway: 'sslcommerz', success: ok, amount: v.amount, ref: valId, bankTranId: v.bankTranId, cardType: v.cardType, error: ok ? null : `Validation ${v.status}`, raw: { status: v.status, risk: v.riskLevel } }, { user: null });
  scheduleSave(db);
  return r;
}
app.post('/api/pg/sslcommerz/success/:orderId', async (req, res) => {
  try {
    const o = await finishSslcommerz(req.params.orderId, req.body.val_id);
    redirectTo(res, o, o.status === 'paid', 'validation');
  } catch (e) { console.error('[sslcommerz success]', e.message); res.redirect(303, `${env.clientUrl}/payment/${req.params.orderId}?failed=${encodeURIComponent(e.message)}`); }
});
for (const kind of ['fail', 'cancel']) {
  app.post(`/api/pg/sslcommerz/${kind}/:orderId`, async (req, res) => {
    const o = core.orderBy(req.params.orderId);
    if (o && o.status === 'pending_payment') { await api.completePayment({ orderId: o.id, gateway: 'sslcommerz', success: false, error: kind === 'cancel' ? 'Cancelled by customer' : (req.body.error || 'Declined') }, { user: null }); scheduleSave(db); }
    res.redirect(303, `${env.clientUrl}/payment/${req.params.orderId}?failed=${kind}`);
  });
}
// Server-to-server IPN (needs a public URL). Idempotent with the success redirect.
app.post('/api/pg/sslcommerz/ipn', async (req, res) => {
  try {
    const orderId = req.body.value_a || orderIdFromTran(req.body.tran_id);
    if (req.body.status === 'VALID' && req.body.val_id) await finishSslcommerz(orderId, req.body.val_id);
    res.json({ received: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/pg/bkash/callback/:orderId', async (req, res) => {
  const o = core.orderBy(req.params.orderId);
  if (!o) return res.status(404).send('Order not found');
  const { paymentID, status } = req.query;
  if (status !== 'success') { await api.completePayment({ orderId: o.id, gateway: 'bkash', success: false, error: status === 'cancel' ? 'Cancelled by customer' : 'bKash payment failed' }, { user: null }); scheduleSave(db); return redirectTo(res, o, false, status); }
  try {
    const { creds } = core.gatewayCreds(o.id, 'bkash');
    const r = await gateways.bkash.execute({ paymentId: paymentID, creds });
    const done = await api.completePayment({ orderId: o.id, gateway: 'bkash', success: r.success, amount: r.amount, ref: paymentID, bankTranId: r.trxId, error: r.success ? null : r.message }, { user: null });
    done.payment && (core.orderBy(o.id).payment.paymentId = paymentID);
    scheduleSave(db);
    redirectTo(res, done, done.status === 'paid', 'bkash');
  } catch (e) { redirectTo(res, o, false, e.message); }
});

// ---- REST API generated from shared/routes.js -----------------------------------------
const verb = { GET: 'get', POST: 'post', PUT: 'put', PATCH: 'patch', DELETE: 'delete' };
for (const r of ROUTES) {
  if (r.name === 'completePayment') continue; // never exposed publicly
  app[verb[r.method]](`/api${r.path}`, async (req, res) => {
    const denied = checkAccess(r, req.user);
    if (denied) return res.status(denied.status).json({ error: { message: denied.message, code: 'auth' } });
    try {
      const args = { ...req.query, ...(req.body || {}), ...req.params };
      const out = await api[r.name](args, { user: req.user }, { ...pgEnv, token: req.token });
      if (r.method !== 'GET' || r.name === 'getAvailability') scheduleSave(db);
      res.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof ApiError) return res.status(e.status).json({ error: { message: e.message, code: e.code } });
      console.error(`[${r.name}]`, e);
      res.status(500).json({ error: { message: 'Something went wrong on our side', code: 'server' } });
    }
  });
}
app.get('/api/health', (_req, res) => res.json({ ok: true, events: db.events.length, time: new Date().toISOString() }));
app.use('/api', (_req, res) => res.status(404).json({ error: { message: 'Unknown API route' } }));

// ---- Serve the built React app in production -------------------------------------------
const dist = path.resolve(ROOT, '../client/dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
  app.get('*', (_req, res) => res.type('html').send(html));
}

app.listen(env.port, () => {
  console.log(`Ticketo API  → ${env.serverUrl}/api`);
  console.log(`Customer app → ${env.clientUrl}`);
  console.log(`Gateway: SSLCOMMERZ ${db.config.payment.gateways.sslcommerz.sandbox ? 'SANDBOX' : 'LIVE'} store "${db.config.payment.gateways.sslcommerz.storeId}"${env.fallbackToSimulator ? ' · simulator fallback ON' : ''}`);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flush(db); process.exit(0); });
