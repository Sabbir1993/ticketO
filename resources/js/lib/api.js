// HTTP client for the LaraNode JSON API (/api).
// Auth is the HttpOnly session cookie (never readable here); mutating requests echo the
// XSRF-TOKEN cookie as X-XSRF-TOKEN (double-submit CSRF). No tokens are kept in JS storage.
import { ROUTES, buildPath } from './endpoints.js';

const BY_NAME = Object.fromEntries(ROUTES.map((r) => [r.name, r]));
const readCookie = (n) => document.cookie.split('; ').find((c) => c.startsWith(`${n}=`))?.slice(n.length + 1);
const deviceId = () => {
  try { let d = localStorage.getItem('ticketo:device'); if (!d) { d = crypto.randomUUID(); localStorage.setItem('ticketo:device', d); } return d; } catch { return ''; }
};

export class ApiError extends Error { constructor(message, status, code, fields) { super(message); this.status = status; this.code = code; this.fields = fields; } }

async function request(method, url, body) {
  const mutating = !['GET', 'HEAD'].includes(method);
  const xsrf = readCookie('XSRF-TOKEN');
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'X-Device-Id': deviceId(),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(mutating && xsrf ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrf) } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).catch(() => { throw new ApiError('Cannot reach the Ticketo server.', 0, 'network'); });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error?.message || `Request failed (${res.status})`, res.status, data?.error?.code, data?.error?.fields);
  return data;
}

async function call(name, args = {}) {
  const route = BY_NAME[name];
  if (!route) throw new Error(`Unknown API ${name}`);
  const { path, rest } = buildPath(route, args);
  const hasBody = !['GET', 'DELETE'].includes(route.method);
  const qs = !hasBody && Object.keys(rest).length ? `?${new URLSearchParams(rest)}` : '';
  return request(route.method, `/api${path}${qs}`, hasBody ? rest : undefined);
}

export const api = new Proxy({}, { get: (_, name) => (args) => call(name, args) });

export async function uploadFile(file) {
  if (file.size > 5 * 1024 * 1024) throw new ApiError('Max 5 MB per file', 400);
  const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  return request('POST', '/api/uploads', { name: file.name, type: file.type, size: file.size, dataUrl });
}
