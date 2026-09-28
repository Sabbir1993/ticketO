// ---------------------------------------------------------------------------
// Ticketo core service — all business rules live here.
// Pure JavaScript (no Node or browser APIs) so the SAME code runs:
//   • in the Express server (server/index.js)      → real API + payment gateways
//   • in the browser "local" adapter (client)       → offline demo / single-file preview
// Every public method has the signature  async (args, ctx) → result
// where ctx = { user }. Access rules are declared in routes.js.
// ---------------------------------------------------------------------------
import { VIEW_TYPES } from './templates.js';
import { blockCapacity, blockSeatIds, seatExists } from './geometry.js';
import { DEFAULT_CONFIG } from './seed.js';

export class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code || 'error'; }
}
const bad = (m, c) => { throw new ApiError(400, m, c); };
const forbid = (m = 'Not allowed') => { throw new ApiError(403, m, 'forbidden'); };
const missing = (m = 'Not found') => { throw new ApiError(404, m, 'not_found'); };

const DAY = 86400000;
const PHONE_RE = /^(?:\+?88)?(01[3-9]\d{8})$/;
export const normPhone = (p = '') => { const m = String(p).replace(/[\s-]/g, '').match(PHONE_RE); return m ? `+88${m[1]}` : null; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
const pad2 = (n) => String(n).padStart(2, '0');

export function createCore(db, deps) {
  const now = () => (deps.now ? deps.now() : Date.now());
  const iso = () => new Date(now()).toISOString();
  const id = (p) => deps.id(p);
  const cfg = () => db.config;
  const P = () => db.config.platform;

  // ------------------------------------------------------------------ lookups
  const tpl = (tid) => db.templates.find((t) => t.id === tid);
  const venue = (vid) => db.venues.find((v) => v.id === vid);
  const merchantOf = (mid) => db.merchants.find((m) => m.id === mid);
  const eventBy = (key) => db.events.find((e) => e.id === key || e.slug === key);
  const orderBy = (oid) => db.orders.find((o) => o.id === oid);
  const audit = (ctx, action, target, meta) => { db.audit.unshift({ at: iso(), actor: ctx?.user?.email || ctx?.user?.phone || ctx?.user?.id || 'system', role: ctx?.user?.role || 'system', action, target, meta }); db.audit.length = Math.min(db.audit.length, 2000); };

  function eventShows(e) {
    if (e.schedule?.type === 'recurring') {
      const out = []; const t0 = new Date(now()); t0.setHours(0, 0, 0, 0);
      const start = e.releaseDate && new Date(e.releaseDate) > t0 ? Math.ceil((new Date(e.releaseDate) - t0) / DAY) : 0;
      for (let d = start; d < start + (e.schedule.days || 7); d++) {
        e.venueIds.forEach((vid, vi) => e.schedule.times.forEach((t, ti) => {
          const [hh, mm] = t.split(':').map(Number);
          const dt = new Date(t0.getTime() + d * DAY); dt.setHours(hh, mm, 0, 0);
          if (dt.getTime() < now()) return;
          const ymd = `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}`;
          out.push({ id: `${e.id}~${vid}~${ymd}~${t.replace(':', '')}`, eventId: e.id, venueId: vid, date: dt.toISOString(), label: t, format: e.format?.[(ti + vi) % e.format.length] || null });
        }));
      }
      return out;
    }
    return (e.shows || []).map((s) => ({ ...s, eventId: e.id, venueId: s.venueId || e.venueIds[0] })).filter((s) => new Date(s.date).getTime() > now() - 6 * 3600000);
  }
  function findShow(showId) {
    const eid = showId.includes('~') ? showId.split('~')[0] : null;
    const pool = eid ? db.events.filter((e) => e.id === eid) : db.events;
    for (const e of pool) {
      if (!eid && !(e.shows || []).some((s) => s.id === showId)) continue;
      const s = eventShows(e).find((x) => x.id === showId);
      if (s) return { event: e, show: s };
    }
    return missing('Show not found or already over');
  }

  function tierInfo(e, tierId) {
    const t = e.tiers.find((x) => x.id === tierId);
    if (!t) return null;
    const eb = t.earlyBird && new Date(t.earlyBird.until).getTime() > now();
    return { ...t, price: eb ? t.earlyBird.price : t.price, original: t.price, earlyBirdActive: !!eb };
  }
  // An event can carry its own unique layout (customSpec); otherwise it uses the shared template.
  const layoutSpec = (e) => e.customSpec || tpl(e.templateId)?.spec || null;
  function validateSpec(spec) {
    if (!spec?.blocks?.length || !spec?.tiers?.length) bad('Layout needs at least one price tier and one block');
    const tiers = new Set(); spec.tiers.forEach((t) => { if (!t.id || tiers.has(t.id)) bad(`Tier ids must be unique (${t.id})`); tiers.add(t.id); });
    const ids = new Set();
    spec.blocks.forEach((b) => {
      if (!b.id || !b.name) bad('Every block needs an id and a name');
      if (ids.has(b.id)) bad(`Duplicate block id ${b.id}`); ids.add(b.id);
      if (!['seated', 'ga', 'none'].includes(b.sell)) bad(`Block ${b.id}: sell must be seated, ga or none`);
      if (b.sell !== 'none' && !tiers.has(b.tier)) bad(`Block ${b.id} uses unknown tier ${b.tier}`);
      if (b.sell === 'seated' && blockCapacity(b) < 1) bad(`Block ${b.id} has no seats`);
      if (b.sell === 'ga' && !(Number(b.capacity) > 0)) bad(`Block ${b.id} needs a capacity`);
      if (b.shape && !['rect', 'arc', 'polygon', 'circle'].includes(b.shape.type)) bad(`Block ${b.id} has an unknown shape`);
      if (b.shape?.type === 'polygon' && (b.shape.points?.length || 0) < 3) bad(`Block ${b.id} polygon needs 3+ points`);
    });
    return spec;
  }
  function eventBlocks(e) {
    const spec = layoutSpec(e);
    if (!spec) return [];
    return spec.blocks.map((b) => {
      const o = e.blockOverrides?.[b.id] || {};
      const merged = { ...b, ...(o.capacity ? { capacity: Number(o.capacity) } : {}) };
      const tier = tierInfo(e, b.tier);
      const enabled = b.sell !== 'none' && o.enabled !== false && !!tier;
      return { ...merged, enabled, price: tier?.price ?? null, original: tier?.original ?? null, tierName: tier?.name || b.tier, color: tier?.color || '#94a3b8', earlyBird: !!tier?.earlyBirdActive, capacity: blockCapacity(merged) };
    });
  }

  // --------------------------------------------------------------- inventory
  function purgeHolds() {
    const t = now();
    db.holds = db.holds.filter((h) => h.expiresAt > t || (h.orderId && orderBy(h.orderId)?.status === 'paid'));
  }
  function inventory(e, showId, excludeHoldId) {
    const seats = {}; const zones = {};
    const addSeat = (b, s) => { (seats[b] ||= new Set()).add(s); };
    const addZone = (b, q) => { zones[b] = (zones[b] || 0) + q; };
    for (const o of db.orders) {
      if (o.showId !== showId || !['paid', 'refund_requested'].includes(o.status)) continue;
      o.items.forEach((it) => (it.type === 'seat' ? addSeat(it.blockId, it.seat) : addZone(it.blockId, it.qty)));
    }
    const t = now();
    for (const h of db.holds) {
      if (h.showId !== showId || h.id === excludeHoldId || h.expiresAt <= t) continue;
      if (h.orderId && orderBy(h.orderId)?.status === 'paid') continue; // already counted as order
      h.items.forEach((it) => (it.type === 'seat' ? addSeat(it.blockId, it.seat) : addZone(it.blockId, it.qty)));
    }
    // Demo occupancy for seeded events so maps don't look empty.
    const fill = e.demoFill || 0;
    if (fill) {
      for (const b of eventBlocks(e)) {
        if (!b.enabled) continue;
        if (b.sell === 'seated') {
          const f = fill * (0.6 + hash01(showId + b.id) * 0.7);
          blockSeatIds(b).forEach((sid) => { if (hash01(`${showId}:${b.id}:${sid}`) < f) addSeat(b.id, sid); });
        } else if (b.sell === 'ga') addZone(b.id, Math.floor(b.capacity * Math.min(0.97, fill * (0.7 + hash01(showId + b.id) * 0.6))));
      }
    }
    return { seats, zones };
  }

  function availability(e, showId, excludeHoldId) {
    const inv = inventory(e, showId, excludeHoldId);
    const blocks = eventBlocks(e).map((b) => {
      const sold = b.sell === 'seated' ? (inv.seats[b.id]?.size || 0) : Math.min(b.capacity, inv.zones[b.id] || 0);
      return { ...b, sold, available: b.enabled ? Math.max(0, b.capacity - sold) : 0 };
    });
    return { blocks, soldSeats: Object.fromEntries(Object.entries(inv.seats).map(([k, v]) => [k, [...v]])) };
  }

  // -------------------------------------------------------------- summaries
  function priceFrom(e) { const ps = e.tiers.map((t) => tierInfo(e, t.id).price).filter((p) => p !== null && p !== undefined); return ps.length ? Math.min(...ps) : 0; }
  function eventSummary(e) {
    const shows = eventShows(e); const v = venue(e.venueIds[0]); const m = merchantOf(e.merchantId);
    const comingSoon = e.releaseDate && new Date(e.releaseDate).getTime() > now();
    return {
      id: e.id, slug: e.slug, title: e.title, category: e.category, subCategory: e.subCategory, viewType: e.viewType, templateId: e.templateId,
      genres: e.genres || [], language: e.language, certificate: e.certificate, duration: e.duration, format: e.format || [], score: e.score || 0, votes: e.votes || 0,
      palette: e.palette || ['#1E3A8A', '#2D499A'], tags: e.tags || [], releaseDate: e.releaseDate || null, comingSoon: !!comingSoon, status: e.status,
      venue: v ? { id: v.id, name: v.name, city: v.city, address: v.address } : null, cities: [...new Set(e.venueIds.map((x) => venue(x)?.city).filter(Boolean))],
      nextShow: shows[0]?.date || null, showsCount: shows.length, priceFrom: priceFrom(e), merchant: m ? { id: m.id, name: m.name } : null,
      soldOut: shows.length > 0 && shows.every((s) => availability(e, s.id).blocks.every((b) => !b.enabled || b.available === 0)),
    };
  }
  function eventDetail(e) {
    const t = tpl(e.templateId);
    return {
      ...eventSummary(e), description: e.description, cast: e.cast || [], sponsors: e.sponsors || [], policy: e.policy, bookingLimit: e.bookingLimit,
      tiers: e.tiers.map((x) => tierInfo(e, x.id)), shows: eventShows(e), venues: e.venueIds.map(venue).filter(Boolean),
      template: t ? { id: t.id, name: e.customSpec ? `${t.name} (custom)` : t.name, viewType: t.viewType } : null, customLayout: !!e.customSpec, saleStart: e.saleStart || null, saleEnd: e.saleEnd || null,
      interested: e.interested || 0, promos: (e.promos || []).map((p) => ({ code: p.code, type: p.type, value: p.value, desc: p.desc })),
    };
  }

  // ------------------------------------------------------------------ pricing
  function findPromo(e, code) {
    if (!code) return null;
    const c = String(code).trim().toUpperCase();
    const own = (e.promos || []).find((p) => p.code === c);
    if (own) return { scope: 'all', active: true, minOrder: 0, desc: `${own.type === 'flat' ? `৳${own.value}` : `${own.value}%`} off this event`, ...own, eventLevel: true };
    return cfg().promos.find((p) => p.code === c) || null;
  }
  function priceOrder(e, subtotal, promoCode) {
    let discount = 0; let promo = null; let promoError = null;
    if (promoCode) {
      const p = findPromo(e, promoCode);
      if (!p) promoError = 'Invalid promo code';
      else if (!p.active) promoError = 'This code has expired';
      else if (p.scope !== 'all' && p.scope !== e.category) promoError = `Valid only on ${p.scope}`;
      else if (subtotal < (p.minOrder || 0)) promoError = `Minimum order ৳${p.minOrder}`;
      else if (p.limit && p.used >= p.limit) promoError = 'This code has reached its usage limit';
      else { discount = p.type === 'flat' ? Math.min(p.value, subtotal) : Math.min(p.max || Infinity, Math.round((subtotal * p.value) / 100)); promo = p.code; }
    }
    const base = Math.max(0, subtotal - discount);
    const feeRaw = base === 0 ? 0 : (base * P().convenienceFeePct) / 100;
    const vat = (feeRaw * P().vatOnFeePct) / 100;
    const fee = Math.round(feeRaw + vat);
    const m = merchantOf(e.merchantId);
    const commissionPct = m?.commissionPct ?? P().defaultCommissionPct;
    const commission = Math.round((base * commissionPct) / 100);
    return { subtotal, discount, promo, promoError, fee, feeExVat: Math.round(feeRaw), vat: Math.round(vat), total: base + fee, commissionPct, commission, merchantNet: base - commission };
  }

  // -------------------------------------------------------------------- auth
  function issueToken(user) {
    const t = deps.token();
    db.tokens[t] = { userId: user.id, exp: now() + 30 * DAY };
    return t;
  }
  function publicUser(u) { if (!u) return null; const { password, ...rest } = u; return rest; }
  function resolveUser(token) {
    const t = token && db.tokens[token];
    if (!t || t.exp < now()) return null;
    return db.users.find((u) => u.id === t.userId) || null;
  }
  const own = (ctx, e) => { if (ctx.user.role !== 'admin' && e.merchantId !== ctx.user.merchantId) forbid('This event belongs to another merchant'); };
  const myMerchant = (ctx) => merchantOf(ctx.user.merchantId) || forbid('No merchant account');

  // ------------------------------------------------------------ orders & PG
  function issueTickets(o) {
    const codes = new Set(db.orders.flatMap((x) => (x.tickets || []).map((t) => t.code)));
    const mk = () => { let c; do { c = `TKT-${deps.token().replace(/[^A-Z0-9]/gi, '').slice(0, 8).toUpperCase()}`; } while (codes.has(c)); codes.add(c); return c; };
    o.tickets = o.items.flatMap((it) => Array.from({ length: it.type === 'seat' ? 1 : it.qty }, (_, i) => ({
      code: mk(), label: it.type === 'seat' ? `${it.blockName} · ${it.seat}` : `${it.blockName}${it.qty > 1 ? ` #${i + 1}` : ''}`, tier: it.tierName, scanned: false,
    })));
    const hold = db.holds.find((h) => h.id === o.holdId);
    if (hold) hold.expiresAt = Number.MAX_SAFE_INTEGER; // keep seats locked forever (order paid)
  }
  function countPromo(o) { if (o.promo) { const p = cfg().promos.find((x) => x.code === o.promo); if (p) p.used = (p.used || 0) + 1; } }
  function sanitizeOrder(o, withInternal = false) {
    const e = eventBy(o.eventId);
    const out = { ...o, event: e ? eventSummary(e) : null, venue: venue(o.venueId) || null };
    if (!withInternal && out.payment) out.payment = { method: out.payment.method, gateway: out.payment.gateway, tranId: out.payment.tranId, ref: out.payment.ref, paidAt: out.payment.paidAt, cardType: out.payment.cardType, lastError: out.payment.lastError, pgMode: out.payment.pgMode };
    return out;
  }
  function gatewayCreds(o, gatewayId) {
    const m = merchantOf(o.merchantId);
    if (m?.pg?.mode === 'direct' && m.pg[gatewayId]?.storeId || (m?.pg?.mode === 'direct' && m.pg[gatewayId]?.appKey)) {
      const c = { ...m.pg[gatewayId] };
      ['storePassword', 'appSecret', 'password'].forEach((k) => { if (c[k]) c[k] = deps.decrypt(c[k]); });
      return { creds: c, pgMode: 'direct' };
    }
    return { creds: { ...cfg().payment.gateways[gatewayId] }, pgMode: 'platform' };
  }
  function validateSelection(e, show, seats = [], zones = []) {
    if (e.status !== 'published') bad('This event is not on sale');
    if (e.saleStart && new Date(e.saleStart).getTime() > now()) bad('Ticket sales have not started yet');
    if (e.saleEnd && new Date(e.saleEnd).getTime() < now()) bad('Online ticket sales have closed');
    if (new Date(show.date).getTime() < now()) bad('This show has already started');
    const qty = seats.length + zones.reduce((a, z) => a + Number(z.qty || 0), 0);
    if (!qty) bad('Select at least one ticket');
    const limit = Math.min(e.bookingLimit || 10, P().maxTicketsPerOrder || 10);
    if (qty > limit) bad(`Maximum ${limit} tickets per order`);
    return qty;
  }
  function buildItems(e, show, seats, zones, excludeHoldId) {
    const { blocks, soldSeats } = availability(e, show.id, excludeHoldId);
    const B = Object.fromEntries(blocks.map((b) => [b.id, b]));
    const items = []; const seen = new Set(); const perTier = {};
    for (const s of seats) {
      const b = B[s.blockId];
      if (!b || !b.enabled || b.sell !== 'seated') bad(`Block ${s.blockId} is not available`);
      if (!seatExists(b, s.seat)) bad(`Seat ${s.seat} does not exist in ${b.name}`);
      const key = `${b.id}:${s.seat}`;
      if (seen.has(key)) continue; seen.add(key);
      if (soldSeats[b.id]?.includes(s.seat)) throw new ApiError(409, `Seat ${s.seat} in ${b.name} was just taken — please pick another`, 'seat_taken');
      items.push({ type: 'seat', blockId: b.id, blockName: b.name, seat: s.seat, tierId: b.tier, tierName: b.tierName, price: b.price, qty: 1 });
      perTier[b.tier] = (perTier[b.tier] || 0) + 1;
    }
    for (const z of zones) {
      const qty = Number(z.qty || 0); if (!qty) continue;
      const b = B[z.blockId];
      if (!b || !b.enabled || b.sell !== 'ga') bad(`Zone ${z.blockId} is not available`);
      if (qty > b.available) throw new ApiError(409, `Only ${b.available} left in ${b.name}`, 'sold_out');
      items.push({ type: 'zone', blockId: b.id, blockName: b.name, tierId: b.tier, tierName: b.tierName, price: b.price, qty });
      perTier[b.tier] = (perTier[b.tier] || 0) + qty;
    }
    for (const [tierId, n] of Object.entries(perTier)) { const t = e.tiers.find((x) => x.id === tierId); if (t?.limit && n > t.limit) bad(`Max ${t.limit} × ${t.name} per order`); }
    return items;
  }

  // ======================================================================
  const api = {
    // ------------------------------------------------------------- public
    async getConfig() {
      const c = cfg();
      return {
        platform: { name: P().name, currency: P().currency, convenienceFeePct: P().convenienceFeePct, vatOnFeePct: P().vatOnFeePct, holdMinutes: P().holdMinutes, maxTicketsPerOrder: P().maxTicketsPerOrder, allowGuestCheckout: P().allowGuestCheckout, allowMerchantDirectPG: P().allowMerchantDirectPG, merchantAutoApprove: P().merchantAutoApprove, eventRequiresApproval: P().eventRequiresApproval },
        categories: c.categories, viewTypes: VIEW_TYPES, cities: db.cities, banners: c.banners,
        branding: { ...DEFAULT_CONFIG.branding, ...(c.branding || {}) }, home: c.home || DEFAULT_CONFIG.home,
        paymentMethods: c.payment.methods.filter((m) => m.enabled).map(({ id: mid, name, sub, icon, color }) => ({ id: mid, name, sub, icon, color })),
        promos: c.promos.filter((p) => p.active).map(({ code, type, value, max, minOrder, desc, scope }) => ({ code, type, value, max, minOrder, desc, scope })),
        simulator: !!c.payment.gateways.simulator?.enabled,
      };
    },
    async listEvents({ city, category, q, merchantId } = {}) {
      return db.events.filter((e) => e.status === 'published' && (!merchantId || e.merchantId === merchantId) && (!category || e.category === category)
        && (!city || e.venueIds.some((v) => [city, 'online'].includes(venue(v)?.city)))
        && (!q || `${e.title} ${e.genres?.join(' ')} ${e.category} ${e.subCategory || ''} ${e.cast?.map((c) => c.name).join(' ')}`.toLowerCase().includes(String(q).toLowerCase())))
        .map(eventSummary);
    },
    async getEvent({ slug }) {
      const e = eventBy(slug);
      if (!e || !['published', 'paused'].includes(e.status)) missing('Event not found');
      return eventDetail(e);
    },
    async getAvailability({ showId }) {
      purgeHolds();
      const { event: e, show } = findShow(showId);
      const t = tpl(e.templateId);
      const av = availability(e, showId);
      return { event: eventSummary(e), show, venue: venue(show.venueId), template: { id: t?.id, name: e.customSpec ? 'Custom layout' : t?.name, viewType: e.viewType || t?.viewType, spec: layoutSpec(e) }, tiers: e.tiers.map((x) => tierInfo(e, x.id)), bookingLimit: Math.min(e.bookingLimit || 10, P().maxTicketsPerOrder), holdMinutes: P().holdMinutes, ...av };
    },
    async createHold({ showId, seats = [], zones = [] }, ctx) {
      purgeHolds();
      const { event: e, show } = findShow(showId);
      validateSelection(e, show, seats, zones);
      const items = buildItems(e, show, seats, zones);
      const hold = { id: id('HLD'), showId, eventId: e.id, venueId: show.venueId, showDate: show.date, items, subtotal: items.reduce((a, i) => a + i.price * i.qty, 0), createdAt: now(), expiresAt: now() + P().holdMinutes * 60000, userId: ctx.user?.id || null };
      db.holds.push(hold);
      return { ...hold, pricing: priceOrder(e, hold.subtotal) };
    },
    async getHold({ holdId }) {
      const h = db.holds.find((x) => x.id === holdId);
      if (!h || (h.expiresAt <= now() && !h.orderId)) missing('Your seat hold has expired');
      const e = eventBy(h.eventId);
      return { ...h, event: eventSummary(e), venue: venue(h.venueId), policy: e.policy, promos: (e.promos || []).map((p) => ({ code: p.code, type: p.type, value: p.value })), pricing: priceOrder(e, h.subtotal) };
    },
    async releaseHold({ holdId }) {
      const h = db.holds.find((x) => x.id === holdId);
      if (h && !h.orderId) db.holds = db.holds.filter((x) => x.id !== holdId);
      return { ok: true };
    },
    async quote({ holdId, promoCode }) {
      const h = db.holds.find((x) => x.id === holdId) || missing('Hold expired');
      return priceOrder(eventBy(h.eventId), h.subtotal, promoCode);
    },
    async createOrder({ holdId, contact = {}, promoCode }, ctx) {
      purgeHolds();
      const h = db.holds.find((x) => x.id === holdId);
      if (!h || h.expiresAt <= now()) bad('Your seat hold expired — please select seats again', 'hold_expired');
      if (h.orderId) { const ex = orderBy(h.orderId); if (ex && ex.status !== 'failed') return sanitizeOrder(ex); }
      const phone = normPhone(contact.phone);
      if (!contact.name || String(contact.name).trim().length < 2) bad('Enter the ticket holder name');
      if (!phone) bad('Enter a valid Bangladeshi mobile number (01XXXXXXXXX)');
      if (!/\S+@\S+\.\S+/.test(contact.email || '')) bad('Enter a valid email address');
      if (!ctx.user && !P().allowGuestCheckout) throw new ApiError(401, 'Please sign in to continue', 'auth');
      const e = eventBy(h.eventId);
      const pricing = priceOrder(e, h.subtotal, promoCode);
      if (pricing.promoError) bad(pricing.promoError, 'promo');
      const o = {
        id: id('BKG'), holdId, eventId: e.id, merchantId: e.merchantId, showId: h.showId, showDate: h.showDate, venueId: h.venueId, items: h.items,
        amounts: pricing, promo: pricing.promo, contact: { name: String(contact.name).trim(), phone, email: String(contact.email).trim() },
        customerId: ctx.user?.role === 'customer' ? ctx.user.id : null, status: pricing.total === 0 ? 'paid' : 'pending_payment', channel: 'web', createdAt: iso(), tickets: [], payment: null,
      };
      h.orderId = o.id;
      if (o.status === 'paid') { o.payment = { method: 'free', gateway: 'none', paidAt: iso() }; issueTickets(o); countPromo(o); audit(ctx, 'ORDER_PAID', o.id, { total: 0 }); }
      db.orders.unshift(o);
      return sanitizeOrder(o);
    },
    async startPayment({ orderId, method }, ctx, env = {}) {
      const o = orderBy(orderId) || missing('Order not found');
      if (o.status === 'paid') return { alreadyPaid: true, orderId };
      if (o.status !== 'pending_payment') bad(`Order is ${o.status.replace('_', ' ')}`);
      const hold = db.holds.find((h) => h.id === o.holdId);
      if (!hold || hold.expiresAt <= now()) { o.status = 'expired'; bad('Seat hold expired before payment — please book again', 'hold_expired'); }
      const m = cfg().payment.methods.find((x) => x.id === method && x.enabled) || bad('Choose a payment method');
      hold.expiresAt = Math.max(hold.expiresAt, now() + 15 * 60000); // time on the gateway page
      const attempt = (o.payment?.attempts || 0) + 1;
      let gatewayId = m.gateway;
      let { creds, pgMode } = gatewayCreds(o, gatewayId);
      const gw = deps.gateways?.[gatewayId];
      const useSim = !gw || (!creds.enabled && pgMode === 'platform');
      if (useSim) {
        if (!cfg().payment.gateways.simulator?.enabled) bad(`${m.name} is not configured yet`);
        gatewayId = 'simulator'; pgMode = 'platform';
      }
      o.payment = { ...(o.payment || {}), method: m.id, gateway: gatewayId, pgMode, attempts: attempt, tranId: `${o.id}-${attempt}`, startedAt: iso() };
      const e = eventBy(o.eventId);
      if (gatewayId === 'simulator') return { redirectUrl: `${env.clientUrl || ''}/pay/simulate/${o.id}?m=${m.id}`, gateway: 'simulator' };
      try {
        const r = await gw.init({ order: o, event: e, creds, method: m, tranId: o.payment.tranId, env });
        o.payment.sessionKey = r.sessionKey || null; o.payment.paymentId = r.paymentId || null;
        return { redirectUrl: r.url, gateway: gatewayId };
      } catch (err) {
        o.payment.lastError = err.message;
        if (cfg().payment.gateways.simulator?.enabled && env.fallbackToSimulator) {
          o.payment.gateway = 'simulator';
          return { redirectUrl: `${env.clientUrl || ''}/pay/simulate/${o.id}?m=${m.id}&note=${encodeURIComponent(`${gatewayId} unreachable: ${err.message}`)}`, gateway: 'simulator', warning: err.message };
        }
        throw new ApiError(502, `Payment gateway error: ${err.message}`, 'gateway');
      }
    },
    // Called by server callbacks after the gateway confirms (validated server-to-server).
    async completePayment({ orderId, gateway, success, amount, ref, bankTranId, cardType, error, raw }, ctx) {
      const o = orderBy(orderId) || missing('Order not found');
      if (o.status === 'paid') return sanitizeOrder(o);
      if (success && Number(amount) + 0.001 >= o.amounts.total) {
        o.status = 'paid';
        o.payment = { ...(o.payment || {}), gateway, ref, bankTranId: bankTranId || null, cardType: cardType || null, paidAt: iso(), lastError: null, raw: raw || null };
        issueTickets(o); countPromo(o);
        audit(ctx, 'ORDER_PAID', o.id, { gateway, amount });
      } else {
        o.payment = { ...(o.payment || {}), lastError: error || (success ? `Amount mismatch (${amount})` : 'Payment failed'), failures: (o.payment?.failures || 0) + 1 };
        audit(ctx, 'PAYMENT_FAILED', o.id, { gateway, error: o.payment.lastError });
      }
      return sanitizeOrder(o);
    },
    async simulatePayment({ orderId, outcome }, ctx) {
      if (!cfg().payment.gateways.simulator?.enabled) forbid('Simulator disabled');
      const o = orderBy(orderId) || missing('Order not found');
      return api.completePayment({ orderId, gateway: 'simulator', success: outcome === 'success', amount: o.amounts.total, ref: `SIM${String(now()).slice(-9)}`, error: outcome === 'cancel' ? 'Cancelled by customer' : 'Declined by issuer (simulated)' }, ctx);
    },
    async getOrder({ orderId }) { return sanitizeOrder(orderBy(orderId) || missing('Booking not found')); },

    // ------------------------------------------------------------ customer
    async requestOtp({ phone }) {
      const p = normPhone(phone) || bad('Enter a valid Bangladeshi mobile number');
      const code = deps.sendOtp ? await deps.sendOtp(p) : '123456';
      db.otps[p] = { code, exp: now() + 5 * 60000, tries: 0 };
      return { sent: true, demo: !deps.sendOtp };
    },
    async verifyOtp({ phone, otp, name }) {
      const p = normPhone(phone) || bad('Invalid number');
      const o = db.otps[p];
      if (!o || o.exp < now()) bad('OTP expired — request a new one');
      if (++o.tries > 5) bad('Too many attempts');
      if (String(otp) !== o.code) bad('Incorrect OTP');
      delete db.otps[p];
      let u = db.users.find((x) => x.role === 'customer' && x.phone === p);
      if (!u) { u = { id: id('CUS'), role: 'customer', phone: p, name: name || 'Guest', createdAt: iso() }; db.users.push(u); }
      else if (name) u.name = name;
      return { token: issueToken(u), user: publicUser(u), isNew: !name && u.name === 'Guest' };
    },
    async updateProfile({ name, email }, ctx) { const u = db.users.find((x) => x.id === ctx.user.id); if (name) u.name = name; if (email) u.email = email; return publicUser(u); },
    async myOrders(_, ctx) {
      return db.orders.filter((o) => o.status !== 'pending_payment' && o.status !== 'expired' && (o.customerId === ctx.user.id || o.contact.phone === ctx.user.phone)).map((o) => sanitizeOrder(o));
    },
    async requestRefund({ orderId, reason }, ctx) {
      const o = orderBy(orderId) || missing();
      if (ctx.user.role === 'customer' && o.contact.phone !== ctx.user.phone && o.customerId !== ctx.user.id) forbid();
      if (o.status !== 'paid') bad('Only confirmed bookings can be cancelled');
      if (o.tickets.some((t) => t.scanned)) bad('Tickets already used at the gate');
      const e = eventBy(o.eventId); const hrs = (new Date(o.showDate) - now()) / 3600000;
      let fee = 0; let kind;
      if (e.policy?.cancellable && hrs > (e.policy.refundWindowHrs || 0)) { kind = 'cancellation'; fee = Math.round((o.amounts.total * (e.policy.cancellationFeePct || 0)) / 100); }
      else if (e.policy?.refundable && hrs > 0) kind = 'refund';
      else bad('The organiser does not allow cancellation for this booking');
      o.status = 'refund_requested';
      o.refund = { kind, amount: o.amounts.total - fee, fee, reason: reason || 'Requested by customer', requestedAt: iso() };
      audit(ctx, 'REFUND_REQUESTED', o.id, { amount: o.refund.amount });
      return sanitizeOrder(o);
    },
    async transferOrder({ orderId, name, phone }, ctx) {
      const o = orderBy(orderId) || missing();
      if (o.contact.phone !== ctx.user.phone && o.customerId !== ctx.user.id) forbid();
      const e = eventBy(o.eventId);
      if (!e.policy?.transferable) bad('Transfers are not allowed for this event');
      if (o.status !== 'paid' || o.tickets.some((t) => t.scanned)) bad('This booking cannot be transferred');
      const p = normPhone(phone) || bad('Enter a valid mobile number');
      o.transferredFrom = { ...o.contact, at: iso() };
      o.contact = { ...o.contact, name, phone: p };
      issueTickets(o); // fresh codes, old ones stop working
      audit(ctx, 'ORDER_TRANSFERRED', o.id, { to: p });
      return sanitizeOrder(o);
    },

    // ---------------------------------------------------- merchant: account
    async registerMerchant({ owner = {}, business = {}, settlement = {}, pg = {}, docs = [] }) {
      const email = String(owner.email || '').trim().toLowerCase();
      if (!owner.name || owner.name.length < 2) bad('Owner name is required');
      if (!/\S+@\S+\.\S+/.test(email)) bad('A valid email is required');
      if (db.users.some((u) => u.email === email)) bad('An account with this email already exists');
      const phone = normPhone(owner.phone) || bad('A valid mobile number is required');
      if (!owner.password || owner.password.length < 8) bad('Password must be at least 8 characters');
      if (!business.name) bad('Business / brand name is required');
      if (!business.tradeLicense) bad('Trade licence number is required');
      const auto = P().merchantAutoApprove;
      const m = {
        id: id('M'), name: business.name, type: business.type || 'Event organiser', status: auto ? 'active' : 'pending', commissionPct: P().defaultCommissionPct, createdAt: iso(),
        owner: { name: owner.name, email, phone },
        business: { legalName: business.legalName || business.name, tradeLicense: business.tradeLicense, tin: business.tin || '', bin: business.bin || '', address: business.address || '', website: business.website || '' },
        kyc: { status: auto ? 'verified' : 'submitted', docs: docs.map((d) => ({ name: d.name, type: d.type, size: d.size || 0, fileId: d.fileId || null })), submittedAt: iso() },
        settlement: { type: settlement.type || 'bank', bankName: settlement.bankName || '', accountName: settlement.accountName || '', accountNo: settlement.accountNo || '', routing: settlement.routing || '', wallet: settlement.wallet || '', cycle: 'weekly' },
        pg: { mode: 'platform' },
      };
      db.merchants.push(m);
      const u = { id: id('U'), role: 'merchant', merchantId: m.id, name: owner.name, email, phone, password: deps.hash(owner.password), createdAt: iso() };
      db.users.push(u);
      if (pg.mode === 'direct') await api.updatePaymentSettings(pg, { user: u });
      audit({ user: u }, 'MERCHANT_REGISTERED', m.name);
      return { token: issueToken(u), user: publicUser(u), merchant: api._merchantView(m) };
    },
    async login({ email, password }) {
      const u = db.users.find((x) => x.email === String(email || '').trim().toLowerCase() && x.role !== 'customer');
      if (!u || !deps.verify(password || '', u.password)) throw new ApiError(401, 'Wrong email or password', 'auth');
      audit({ user: u }, 'LOGIN', u.email);
      return { token: issueToken(u), user: publicUser(u), merchant: u.merchantId ? api._merchantView(merchantOf(u.merchantId)) : null };
    },
    async logout(_, ctx, env = {}) { if (env.token) delete db.tokens[env.token]; return { ok: true }; },
    async me(_, ctx) { return { user: publicUser(ctx.user), merchant: ctx.user.merchantId ? api._merchantView(merchantOf(ctx.user.merchantId)) : null }; },
    _merchantView(m) {
      if (!m) return null;
      const v = clone(m);
      for (const g of ['sslcommerz', 'bkash']) if (v.pg?.[g]) ['storePassword', 'appSecret', 'password'].forEach((k) => { if (v.pg[g][k]) v.pg[g][k] = '••••••••'; });
      return v;
    },
    async updateMerchant({ business, settlement, owner, type }, ctx) {
      const m = myMerchant(ctx);
      if (business) Object.assign(m.business, business);
      if (settlement) Object.assign(m.settlement, settlement);
      if (owner) Object.assign(m.owner, { name: owner.name || m.owner.name });
      if (type) m.type = type;
      if (business?.name) m.name = business.name;
      audit(ctx, 'MERCHANT_UPDATED', m.name);
      return api._merchantView(m);
    },
    async uploadKycDocs({ docs = [] }, ctx) {
      const m = myMerchant(ctx);
      m.kyc.docs.push(...docs.map((d) => ({ name: d.name, type: d.type, size: d.size || 0, fileId: d.fileId || null })));
      if (m.kyc.status === 'rejected') { m.kyc.status = 'submitted'; m.status = 'pending'; }
      return api._merchantView(m);
    },
    async updatePaymentSettings({ mode, sslcommerz, bkash }, ctx) {
      const m = myMerchant(ctx);
      if (mode === 'direct' && !P().allowMerchantDirectPG) bad('Direct gateway connection is disabled by the platform');
      m.pg = m.pg || { mode: 'platform' };
      if (mode) m.pg.mode = mode;
      const put = (g, v, secretKeys) => {
        if (!v) return;
        const cur = m.pg[g] || {};
        const next = { ...cur, ...v };
        secretKeys.forEach((k) => { if (v[k] && v[k] !== '••••••••') next[k] = deps.encrypt(v[k]); else next[k] = cur[k] || ''; });
        next.verifiedAt = null;
        m.pg[g] = next;
      };
      put('sslcommerz', sslcommerz, ['storePassword']);
      put('bkash', bkash, ['appSecret', 'password']);
      audit(ctx, 'PG_SETTINGS_UPDATED', m.name, { mode: m.pg.mode });
      return api._merchantView(m);
    },
    async testPaymentConnection({ gateway = 'sslcommerz' }, ctx, env = {}) {
      const m = myMerchant(ctx);
      const c = { ...(m.pg?.[gateway] || {}) };
      ['storePassword', 'appSecret', 'password'].forEach((k) => { if (c[k]) c[k] = deps.decrypt(c[k]); });
      if (gateway === 'sslcommerz' && (!c.storeId || !c.storePassword)) bad('Enter Store ID and Store Password first');
      const gw = deps.gateways?.[gateway];
      if (!gw?.test) return { ok: false, message: 'Connection test runs on the server. Start the Node backend to verify credentials.' };
      const r = await gw.test(c, env);
      if (r.ok) { m.pg[gateway].verifiedAt = iso(); audit(ctx, 'PG_VERIFIED', m.name, { gateway }); }
      return r;
    },

    // ---------------------------------------------------- merchant: events
    async listTemplates({ viewType } = {}, ctx = {}) {
      const u = ctx.user;
      return db.templates.filter((t) => (!viewType || t.viewType === viewType) && (!t.ownerId || u?.role === 'admin' || t.ownerId === u?.merchantId))
        .map((t) => ({ ...t, mine: !!t.ownerId && t.ownerId === u?.merchantId }));
    },
    async getTemplate({ id: tid }) { return tpl(tid) || missing('Template not found'); },
    async listVenues() { return db.venues; },
    async merchantEvents(_, ctx) {
      const mid = ctx.user.merchantId;
      return db.events.filter((e) => ctx.user.role === 'admin' || e.merchantId === mid).map((e) => ({ ...eventSummary(e), reviewNote: e.reviewNote || null, updatedAt: e.updatedAt || e.createdAt, stats: api._eventStats(e) }));
    },
    async getMerchantEvent({ id: eid }, ctx) { const e = eventBy(eid) || missing(); own(ctx, e); return clone(e); },
    _eventStats(e) {
      const shows = eventShows(e);
      let capacity = 0; let sold = 0;
      shows.slice(0, 20).forEach((s) => { const av = availability(e, s.id); av.blocks.forEach((b) => { if (b.enabled) { capacity += b.capacity; sold += b.sold; } }); });
      const paid = db.orders.filter((o) => o.eventId === e.id && o.status === 'paid');
      const revenue = paid.reduce((a, o) => a + o.amounts.subtotal - o.amounts.discount, 0);
      const avg = e.tiers.length ? e.tiers.reduce((a, t) => a + t.price, 0) / e.tiers.length : 0;
      const liveTickets = paid.reduce((a, o) => a + o.tickets.length, 0);
      return { capacity, sold, liveTickets, revenue: revenue + Math.round((sold - liveTickets) * avg * 0.8), onlineRevenue: revenue, orders: paid.length };
    },
    async saveEvent({ event: input }, ctx) {
      const m = ctx.user.role === 'admin' ? merchantOf(input.merchantId) : myMerchant(ctx);
      if (!input?.title || input.title.trim().length < 3) bad('Event name is required');
      const cat = cfg().categories.find((c) => c.id === input.category) || bad('Choose a category');
      const t = tpl(input.templateId) || bad('Choose a venue layout');
      if (!input.venueIds?.length || !venue(input.venueIds[0])) bad('Choose a venue');
      const specTiers = (input.customSpec || t.spec).tiers;
      const tierIds = specTiers.map((x) => x.id);
      const tiers = (input.tiers || []).filter((x) => tierIds.includes(x.id)).map((x) => ({
        id: x.id, name: x.name || specTiers.find((y) => y.id === x.id).name, color: x.color || specTiers.find((y) => y.id === x.id).color,
        price: Math.max(0, Number(x.price) || 0), limit: x.limit ? Number(x.limit) : null,
        earlyBird: x.earlyBird?.price && x.earlyBird?.until ? { price: Number(x.earlyBird.price), until: new Date(x.earlyBird.until).toISOString() } : null,
      }));
      const shows = (input.shows || []).filter((s) => s.date).map((s, i) => ({ id: s.id || `${input.id || 'new'}-s${i + 1}-${deps.token().slice(0, 4)}`, date: new Date(s.date).toISOString(), label: s.label || `Show ${i + 1}` }));
      const base = {
        title: input.title.trim(), category: cat.id, subCategory: input.subCategory || null, viewType: t.viewType, templateId: t.id, venueIds: input.venueIds,
        genres: (input.genres || []).filter(Boolean), language: input.language || 'Bangla', duration: input.duration || '', certificate: input.certificate || 'All ages',
        description: input.description || '', cast: input.cast || [], sponsors: input.sponsors || [], palette: input.palette || ['#7b2cbf', '#ff006e'],
        tiers, shows, blockOverrides: input.blockOverrides || {}, policy: { ...{ refundable: true, cancellable: true, transferable: true, refundWindowHrs: 24, cancellationFeePct: 10 }, ...(input.policy || {}) },
        bookingLimit: Math.max(1, Math.min(Number(input.bookingLimit) || 8, P().maxTicketsPerOrder)), saleStart: input.saleStart || null, saleEnd: input.saleEnd || null,
        customSpec: input.customSpec ? validateSpec(clone(input.customSpec)) : null,
        promos: (input.promos || []).filter((p) => p.code).map((p) => ({ code: String(p.code).toUpperCase().replace(/\s/g, ''), type: p.type === 'flat' ? 'flat' : 'pct', value: Number(p.value) || 0 })), updatedAt: iso(),
      };
      let e = input.id ? eventBy(input.id) : null;
      if (e) { own(ctx, e); Object.assign(e, base); if (e.status === 'rejected') e.status = 'draft'; audit(ctx, 'EVENT_UPDATED', e.title); }
      else {
        const eid = id('EV');
        let slug = slugify(base.title); if (db.events.some((x) => x.slug === slug)) slug = `${slug}-${eid.slice(-4).toLowerCase()}`;
        e = { id: eid, slug, merchantId: m.id, status: 'draft', score: 0, votes: 0, tags: ['new'], demoFill: 0, createdAt: iso(), ...base };
        e.shows = e.shows.map((s, i) => ({ ...s, id: `${eid}-s${i + 1}` }));
        db.events.push(e); audit(ctx, 'EVENT_CREATED', e.title);
      }
      return clone(e);
    },
    async publishEvent({ id: eid }, ctx) {
      const e = eventBy(eid) || missing(); own(ctx, e);
      const m = merchantOf(e.merchantId);
      if (m.status !== 'active') bad(m.status === 'pending' ? 'Your merchant account is still under KYC review. You can publish once it is approved.' : `Merchant account is ${m.status}`, 'merchant_inactive');
      if (m.pg?.mode === 'direct' && !m.pg.sslcommerz?.verifiedAt && !m.pg.bkash?.verifiedAt) bad('Verify your payment gateway connection (Settings → Payment gateway) before publishing', 'pg_unverified');
      if (!e.tiers.length) bad('Set a price for at least one ticket category');
      if (!eventShows(e).length) bad('Add at least one upcoming show date');
      const enabledBlocks = eventBlocks(e).filter((b) => b.enabled);
      if (!enabledBlocks.length) bad('No sellable blocks — enable at least one block/zone and price its category');
      e.status = P().eventRequiresApproval && ctx.user.role !== 'admin' ? 'pending_review' : 'published';
      if (e.status === 'published') e.publishedAt = iso();
      audit(ctx, e.status === 'published' ? 'EVENT_PUBLISHED' : 'EVENT_SUBMITTED', e.title);
      return clone(e);
    },
    async setEventStatus({ id: eid, status }, ctx) {
      const e = eventBy(eid) || missing(); own(ctx, e);
      if (!['paused', 'published', 'draft', 'cancelled'].includes(status)) bad('Invalid status');
      if (status === 'published' && !['paused'].includes(e.status)) return api.publishEvent({ id: eid }, ctx);
      e.status = status; audit(ctx, `EVENT_${status.toUpperCase()}`, e.title);
      return clone(e);
    },
    async deleteEvent({ id: eid }, ctx) {
      const e = eventBy(eid) || missing(); own(ctx, e);
      if (db.orders.some((o) => o.eventId === eid && o.status === 'paid')) bad('Event has paid orders — pause or cancel it instead');
      db.events = db.events.filter((x) => x.id !== eid); audit(ctx, 'EVENT_DELETED', e.title); return { ok: true };
    },
    async merchantDashboard(_, ctx) {
      const m = myMerchant(ctx);
      const evs = db.events.filter((e) => e.merchantId === m.id);
      const stats = evs.filter((e) => ['published', 'paused'].includes(e.status)).map((e) => ({ id: e.id, title: e.title, ...api._eventStats(e) }));
      const orders = db.orders.filter((o) => o.merchantId === m.id && o.status !== 'pending_payment' && o.status !== 'expired');
      const byDay = {};
      for (let i = 13; i >= 0; i--) { const d = new Date(now() - i * DAY); byDay[d.toISOString().slice(0, 10)] = 0; }
      orders.filter((o) => o.status === 'paid').forEach((o) => { const k = o.createdAt.slice(0, 10); if (k in byDay) byDay[k] += o.amounts.subtotal - o.amounts.discount; });
      const baseline = stats.reduce((a, s) => a + s.revenue, 0) / 60;
      const series = Object.entries(byDay).map(([date, v], i) => ({ date, revenue: Math.round(v + baseline * (0.7 + 0.5 * hash01(m.id + date)) * (0.6 + i / 26)) }));
      return { merchant: api._merchantView(m), events: { total: evs.length, published: evs.filter((e) => e.status === 'published').length, draft: evs.filter((e) => e.status === 'draft').length, pending: evs.filter((e) => e.status === 'pending_review').length }, stats, series, recentOrders: orders.slice(0, 8).map((o) => sanitizeOrder(o)) };
    },
    async merchantOrders({ eventId } = {}, ctx) {
      return db.orders.filter((o) => (ctx.user.role === 'admin' || o.merchantId === ctx.user.merchantId) && (!eventId || o.eventId === eventId) && o.status !== 'expired').map((o) => sanitizeOrder(o));
    },
    async merchantSettlement(_, ctx) {
      const m = myMerchant(ctx);
      const paid = db.orders.filter((o) => o.merchantId === m.id && ['paid', 'refunded', 'refund_requested'].includes(o.status));
      const rows = paid.map((o) => ({ id: o.id, date: o.createdAt, event: eventBy(o.eventId)?.title, pgMode: o.payment?.pgMode || 'platform', gross: o.amounts.subtotal - o.amounts.discount, fee: o.amounts.fee, commission: o.amounts.commission, net: o.amounts.merchantNet, status: o.status }));
      const sum = (arr, k) => arr.reduce((a, r) => a + r[k], 0);
      const platformRows = rows.filter((r) => r.pgMode === 'platform' && r.status !== 'refunded');
      const directRows = rows.filter((r) => r.pgMode === 'direct' && r.status !== 'refunded');
      return {
        mode: m.pg?.mode || 'platform', commissionPct: m.commissionPct, rows,
        payableToMerchant: sum(platformRows, 'net'), // platform collected → owes merchant
        receivableFromMerchant: sum(directRows, 'commission'), // merchant collected directly → owes platform commission
        directCollected: sum(directRows, 'gross'),
      };
    },
    async posSale({ showId, seats = [], zones = [], method = 'cash', phone, name }, ctx) {
      const { event: e, show } = findShow(showId);
      own(ctx, e);
      validateSelection(e, show, seats, zones);
      const items = buildItems(e, show, seats, zones);
      const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
      const pricing = { ...priceOrder(e, subtotal), fee: 0, feeExVat: 0, vat: 0 }; pricing.total = subtotal;
      const h = { id: id('HLD'), showId, eventId: e.id, venueId: show.venueId, showDate: show.date, items, subtotal, createdAt: now(), expiresAt: Number.MAX_SAFE_INTEGER };
      db.holds.push(h);
      const o = { id: id('BKG'), holdId: h.id, eventId: e.id, merchantId: e.merchantId, showId, showDate: show.date, venueId: show.venueId, items, amounts: pricing, promo: null,
        contact: { name: name || 'Walk-in customer', phone: normPhone(phone) || '', email: '' }, status: 'paid', channel: 'pos', operator: ctx.user.email, createdAt: iso(),
        payment: { method, gateway: 'pos', pgMode: 'direct', ref: `POS${String(now()).slice(-8)}`, paidAt: iso() }, tickets: [] };
      h.orderId = o.id; issueTickets(o); db.orders.unshift(o);
      audit(ctx, 'POS_SALE', o.id, { total: subtotal, method });
      return sanitizeOrder(o);
    },
    async scanTicket({ code, gate = 'Gate 1', eventId }, ctx) {
      const c = String(code || '').trim().toUpperCase();
      let o = null; let t = null;
      for (const x of db.orders) { const f = (x.tickets || []).find((y) => y.code === c); if (f) { o = x; t = f; break; } }
      const log = (status) => { db.scans.unshift({ at: iso(), code: c, gate, status, eventId: o?.eventId || eventId || null, merchantId: o?.merchantId || ctx.user.merchantId || null, by: ctx.user.email }); db.scans.length = Math.min(db.scans.length, 5000); };
      if (!o) { log('invalid'); return { status: 'invalid', code: c }; }
      if (ctx.user.role !== 'admin' && o.merchantId !== ctx.user.merchantId) { log('invalid'); return { status: 'invalid', code: c, message: 'Ticket belongs to another organiser' }; }
      if (eventId && o.eventId !== eventId) { log('wrong_event'); return { status: 'wrong_event', code: c, booking: sanitizeOrder(o), ticket: t }; }
      if (o.status !== 'paid') { log('void'); return { status: 'void', code: c, booking: sanitizeOrder(o), ticket: t }; }
      if (t.scanned) { log('duplicate'); return { status: 'duplicate', code: c, booking: sanitizeOrder(o), ticket: t }; }
      t.scanned = true; t.scannedAt = iso(); t.gate = gate; log('valid');
      return { status: 'valid', code: c, booking: sanitizeOrder(o), ticket: t };
    },
    async gateStats({ eventId } = {}, ctx) {
      const orders = db.orders.filter((o) => o.status === 'paid' && (ctx.user.role === 'admin' || o.merchantId === ctx.user.merchantId) && (!eventId || o.eventId === eventId));
      const issued = orders.reduce((a, o) => a + o.tickets.length, 0);
      const inside = orders.reduce((a, o) => a + o.tickets.filter((t) => t.scanned).length, 0);
      const scans = db.scans.filter((s) => (ctx.user.role === 'admin' || s.merchantId === ctx.user.merchantId) && (!eventId || s.eventId === eventId)).slice(0, 50);
      const byGate = {}; scans.forEach((s) => { if (s.status === 'valid') byGate[s.gate] = (byGate[s.gate] || 0) + 1; });
      const recentTickets = orders.slice(0, 6).flatMap((o) => o.tickets.map((t) => ({ ...t, event: eventBy(o.eventId)?.title }))).slice(0, 10);
      return { issued, inside, byGate, scans, recentTickets };
    },

    // ------------------------------------------------------------- admin
    async adminOverview() {
      const paid = db.orders.filter((o) => o.status === 'paid');
      const evStats = db.events.filter((e) => e.status === 'published').map((e) => ({ id: e.id, title: e.title, category: e.category, merchant: merchantOf(e.merchantId)?.name, ...api._eventStats(e) }));
      const byCat = {}; evStats.forEach((s) => { byCat[s.category] = (byCat[s.category] || 0) + s.revenue; });
      const series = []; for (let i = 13; i >= 0; i--) { const d = new Date(now() - i * DAY).toISOString().slice(0, 10); const live = paid.filter((o) => o.createdAt.slice(0, 10) === d).reduce((a, o) => a + o.amounts.total, 0); series.push({ date: d, revenue: Math.round(live + 380000 + Math.sin(i / 2) * 90000 + (13 - i) * 18000) }); }
      return {
        gmv: evStats.reduce((a, s) => a + s.revenue, 0), onlineGmv: paid.reduce((a, o) => a + o.amounts.total, 0), commission: paid.reduce((a, o) => a + o.amounts.commission + o.amounts.feeExVat, 0),
        ticketsSold: evStats.reduce((a, s) => a + s.sold, 0), liveOrders: paid.length,
        pending: { merchants: db.merchants.filter((m) => m.status === 'pending').length, events: db.events.filter((e) => e.status === 'pending_review').length, refunds: db.orders.filter((o) => o.status === 'refund_requested').length },
        merchants: { total: db.merchants.length, active: db.merchants.filter((m) => m.status === 'active').length, direct: db.merchants.filter((m) => m.pg?.mode === 'direct').length },
        byCategory: Object.entries(byCat).map(([k, v]) => ({ label: cfg().categories.find((c) => c.id === k)?.name || k, value: v })).sort((a, b) => b.value - a.value),
        topEvents: evStats.sort((a, b) => b.revenue - a.revenue).slice(0, 8), series, scansToday: db.scans.filter((s) => s.status === 'valid').length,
      };
    },
    async adminMerchants() { return db.merchants.map((m) => ({ ...api._merchantView(m), events: db.events.filter((e) => e.merchantId === m.id).length, gmv: db.orders.filter((o) => o.merchantId === m.id && o.status === 'paid').reduce((a, o) => a + o.amounts.total, 0) })); },
    async reviewMerchant({ id: mid, action, note, commissionPct }, ctx) {
      const m = merchantOf(mid) || missing();
      if (commissionPct !== undefined && commissionPct !== null && commissionPct !== '') m.commissionPct = Number(commissionPct);
      if (action === 'approve') { m.status = 'active'; m.kyc.status = 'verified'; m.kyc.reviewedAt = iso(); }
      else if (action === 'reject') { m.status = 'rejected'; m.kyc.status = 'rejected'; m.kyc.note = note || 'Documents incomplete'; }
      else if (action === 'suspend') { m.status = 'suspended'; db.events.filter((e) => e.merchantId === m.id && e.status === 'published').forEach((e) => { e.status = 'paused'; }); }
      else if (action === 'reactivate') m.status = 'active';
      audit(ctx, `MERCHANT_${String(action || 'updated').toUpperCase()}`, m.name, { note, commissionPct: m.commissionPct });
      return api._merchantView(m);
    },
    async adminEvents({ status } = {}) { return db.events.filter((e) => !status || e.status === status).map((e) => ({ ...eventSummary(e), reviewNote: e.reviewNote || null, description: e.description, tiers: e.tiers, shows: eventShows(e), updatedAt: e.updatedAt || e.createdAt })); },
    async reviewEvent({ id: eid, action, note }, ctx) {
      const e = eventBy(eid) || missing();
      if (action === 'approve') { e.status = 'published'; e.publishedAt = iso(); }
      else if (action === 'reject') e.status = 'rejected';
      else if (action === 'suspend') e.status = 'paused';
      e.reviewNote = note || null;
      audit(ctx, `EVENT_${String(action).toUpperCase()}`, e.title, { note });
      return eventSummary(e);
    },
    async getAdminConfig() {
      const c = clone(cfg());
      c.branding = { ...DEFAULT_CONFIG.branding, ...(c.branding || {}) }; c.home = c.home || DEFAULT_CONFIG.home;
      Object.values(c.payment.gateways).forEach((g) => ['storePassword', 'appSecret', 'password'].forEach((k) => { if (g[k]) g[k] = '••••••••'; }));
      return c;
    },
    async updateConfig({ section, value }, ctx) {
      const c = cfg();
      if (section === 'platform') Object.assign(c.platform, value);
      else if (section === 'categories') {
        (value || []).forEach((cat) => { if (!VIEW_TYPES.some((v) => v.id === cat.viewType)) bad(`Unknown view type ${cat.viewType}`); (cat.subCategories || []).forEach((s) => { if (!VIEW_TYPES.some((v) => v.id === s.viewType)) bad(`Unknown view type ${s.viewType}`); }); });
        c.categories = value;
      } else if (section === 'methods') c.payment.methods = value;
      else if (section === 'gateways') {
        for (const [g, v] of Object.entries(value || {})) {
          const cur = c.payment.gateways[g] || {};
          const next = { ...cur, ...v };
          ['storePassword', 'appSecret', 'password'].forEach((k) => { if (v[k] === '••••••••' || v[k] === undefined) next[k] = cur[k]; });
          c.payment.gateways[g] = next;
        }
      } else if (section === 'promos') c.promos = value;
      else if (section === 'banners') c.banners = value;
      else if (section === 'branding') c.branding = { ...DEFAULT_CONFIG.branding, ...(c.branding || {}), ...value };
      else if (section === 'home') { if (!Array.isArray(value)) bad('Home sections must be a list'); c.home = value; }
      else bad('Unknown config section');
      audit(ctx, 'CONFIG_UPDATED', section);
      return api.getAdminConfig();
    },
    async saveTemplate({ template }, ctx) {
      if (!template?.name || String(template.name).trim().length < 3) bad('Give the layout a name');
      if (!VIEW_TYPES.some((v) => v.id === template.viewType)) bad('Unknown view type');
      validateSpec(template.spec);
      const isAdmin = ctx.user.role === 'admin';
      let t = template.id ? tpl(template.id) : null;
      if (t && !isAdmin && t.ownerId !== ctx.user.merchantId) t = null; // merchants never overwrite platform layouts — save a copy
      if (t) { Object.assign(t, { name: template.name, viewType: template.viewType, spec: clone(template.spec), updatedAt: iso() }); audit(ctx, 'LAYOUT_UPDATED', t.name); return t; }
      const base = slugify(template.name).slice(0, 30) || 'layout';
      let nid = `tpl-${isAdmin ? '' : 'm-'}${base}`; while (tpl(nid)) nid = `${nid}-${deps.token().slice(0, 3).toLowerCase()}`;
      const nt = { id: nid, name: template.name.trim(), viewType: template.viewType, spec: clone(template.spec), ownerId: isAdmin ? (template.ownerId || null) : ctx.user.merchantId, createdAt: iso() };
      db.templates.push(nt); audit(ctx, 'LAYOUT_CREATED', nt.name);
      return nt;
    },
    async deleteTemplate({ id: tid }, ctx) {
      const t = tpl(tid) || missing();
      if (ctx.user.role !== 'admin' && t.ownerId !== ctx.user.merchantId) forbid();
      if (db.events.some((e) => e.templateId === tid)) bad('Template is used by events');
      db.templates = db.templates.filter((t) => t.id !== tid); audit(ctx, 'TEMPLATE_DELETED', tid); return { ok: true };
    },
    async saveVenue({ venue: v }, ctx) {
      if (!v?.name || !v.city) bad('Venue name and city are required');
      if (v.id) { const cur = venue(v.id) || missing(); Object.assign(cur, v); audit(ctx, 'VENUE_UPDATED', v.name); return cur; }
      const nv = { facilities: [], templateIds: [], type: 'hall', address: '', ...v, id: id('V') };
      db.venues.push(nv); audit(ctx, 'VENUE_CREATED', v.name); return nv;
    },
    async adminOrders({ status } = {}) { return db.orders.filter((o) => (!status || o.status === status) && o.status !== 'expired').slice(0, 500).map((o) => ({ ...sanitizeOrder(o, true), merchantName: merchantOf(o.merchantId)?.name })); },
    async reviewRefund({ orderId, action, note }, ctx) {
      const o = orderBy(orderId) || missing();
      if (ctx.user.role === 'merchant' && o.merchantId !== ctx.user.merchantId) forbid();
      if (o.status !== 'refund_requested') bad('No pending refund on this booking');
      if (action === 'approve') {
        let ref = `RF${String(now()).slice(-8)}`; let gatewayNote = 'Manual refund';
        const gw = deps.gateways?.[o.payment?.gateway];
        if (gw?.refund && o.payment?.bankTranId) {
          const { creds } = gatewayCreds(o, o.payment.gateway);
          try { const r = await gw.refund({ order: o, creds, amount: o.refund.amount, remarks: note || o.refund.reason }); ref = r.refId || ref; gatewayNote = r.message || 'Refund initiated at gateway'; }
          catch (err) { bad(`Gateway refund failed: ${err.message}`); }
        }
        o.status = 'refunded'; Object.assign(o.refund, { processedAt: iso(), ref, note: gatewayNote, by: ctx.user.email });
        const h = db.holds.find((x) => x.id === o.holdId); if (h) db.holds = db.holds.filter((x) => x !== h); // release inventory
      } else { o.status = 'paid'; Object.assign(o.refund, { processedAt: iso(), rejected: true, note: note || 'Outside policy', by: ctx.user.email }); }
      audit(ctx, action === 'approve' ? 'REFUND_APPROVED' : 'REFUND_REJECTED', o.id, { amount: o.refund.amount });
      return sanitizeOrder(o);
    },
    async auditLog({ limit = 200 } = {}) { return db.audit.slice(0, Number(limit)); },
  };

  return { api, resolveUser, purgeHolds, gatewayCreds: (orderId, g) => gatewayCreds(orderBy(orderId), g), orderBy, db };
}
