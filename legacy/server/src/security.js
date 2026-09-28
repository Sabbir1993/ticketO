import crypto from 'node:crypto';
import { env } from './env.js';

const key = crypto.createHash('sha256').update(env.appSecret).digest();

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
}
export function verifyPassword(pw, stored = '') {
  const [alg, salt, hash] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const h = crypto.scryptSync(pw, salt, 32);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
}
// AES-256-GCM for gateway secrets at rest
export function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `enc:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}
export function decrypt(blob) {
  if (!blob || !String(blob).startsWith('enc:')) return blob || '';
  const [, iv, tag, data] = blob.split(':');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}
export const token = () => crypto.randomBytes(24).toString('base64url');
let seq = 0;
export const newId = (prefix) => `${prefix}-${Date.now().toString(36).slice(-5).toUpperCase()}${(seq++ % 1296).toString(36).padStart(2, '0').toUpperCase()}${crypto.randomBytes(1).toString('hex').toUpperCase()}`;
