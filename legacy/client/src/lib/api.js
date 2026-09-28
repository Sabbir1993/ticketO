// API client with two interchangeable adapters:
//   http  → Node/Express server (routes generated from shared/routes.js)
//   local → the same shared core running in the browser (offline demo / single-file preview)
import { ROUTES, checkAccess, buildPath } from '@shared/routes.js';

export const MODE = __API_MODE__; // eslint-disable-line no-undef
const BY_NAME = Object.fromEntries(ROUTES.map((r) => [r.name, r]));
const TOKEN_KEY = 'ticketo:token';
const DB_KEY = 'ticketo:db:v3';
let memToken = null;
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };
export const getToken = () => memToken ?? ls.get(TOKEN_KEY);
export const setToken = (t) => { memToken = t; ls.set(TOKEN_KEY, t); };

export class ApiError extends Error { constructor(message, status, code) { super(message); this.status = status; this.code = code; } }

// ---------------- local adapter ----------------
let localCore = null;
async function getLocal() {
  if (localCore) return localCore;
  const [{ createCore }, { buildSeed }] = await Promise.all([import('@shared/core.js'), import('@shared/seed.js')]);
  const rnd = () => Math.random().toString(36).slice(2, 10);
  const h = (s) => { let x = 5381; for (const c of s) x = (x * 33) ^ c.charCodeAt(0); return (x >>> 0).toString(16); };
  const deps = {
    id: (p) => `${p}-${Date.now().toString(36).slice(-4).toUpperCase()}${rnd().slice(0, 4).toUpperCase()}`,
    token: () => rnd() + rnd() + rnd(), hash: (p) => `demo$${h(p)}`, verify: (p, s) => s === `demo$${h(p)}`,
    encrypt: (x) => (x ? `b64:${btoa(unescape(encodeURIComponent(x)))}` : ''), decrypt: (x) => (x?.startsWith('b64:') ? decodeURIComponent(escape(atob(x.slice(4)))) : x || ''),
    gateways: {}, // no real gateway in the browser → payment simulator
  };
  let db = null;
  try { const raw = ls.get(DB_KEY); if (raw) db = JSON.parse(raw); } catch {}
  if (!db || db.version !== 2) db = buildSeed(deps);
  const core = createCore(db, deps);
  localCore = { core, db, save: () => ls.set(DB_KEY, JSON.stringify(db)) };
  localCore.save();
  return localCore;
}
export async function resetLocalDemo() { ls.set(DB_KEY, null); ls.set(TOKEN_KEY, null); memToken = null; localCore = null; }

async function call(name, args = {}) {
  const route = BY_NAME[name];
  if (!route) throw new Error(`Unknown API ${name}`);
  const token = getToken();
  if (MODE === 'local') {
    const { core, save } = await getLocal();
    const user = core.resolveUser(token);
    const denied = checkAccess(route, user);
    if (denied) throw new ApiError(denied.message, denied.status, 'auth');
    try {
      const out = await core.api[name](JSON.parse(JSON.stringify(args)), { user }, { clientUrl: '', token, fallbackToSimulator: true });
      if (route.method !== 'GET' || name === 'getAvailability') save();
      return out === undefined ? { ok: true } : JSON.parse(JSON.stringify(out));
    } catch (e) { save(); throw new ApiError(e.message, e.status || 500, e.code); }
  }
  const { path, rest } = buildPath(route, args);
  const hasBody = !['GET', 'DELETE'].includes(route.method);
  const qs = !hasBody && Object.keys(rest).length ? `?${new URLSearchParams(rest)}` : '';
  const res = await fetch(`/api${path}${qs}`, {
    method: route.method,
    headers: { ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: hasBody ? JSON.stringify(rest) : undefined,
  }).catch(() => { throw new ApiError('Cannot reach the Ticketo server. Is `npm run dev` running?', 0, 'network'); });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error?.message || `Request failed (${res.status})`, res.status, data?.error?.code);
  return data;
}

export const api = new Proxy({}, { get: (_, name) => (args) => call(name, args) });

export async function uploadFile(file) {
  const meta = { name: file.name, type: file.type, size: file.size };
  if (MODE === 'local') return { ...meta, fileId: null };
  if (file.size > 5 * 1024 * 1024) throw new ApiError('Max 5 MB per file', 400);
  const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const res = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...meta, dataUrl }) });
  const d = await res.json();
  if (!res.ok) throw new ApiError(d?.error?.message || 'Upload failed', res.status);
  return d;
}
