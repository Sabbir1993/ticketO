import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { env } from './env.js';
import { buildSeed } from '../../shared/seed.js';
import { encrypt, hashPassword, verifyPassword } from './security.js';

// JSON-file persistence (zero setup). The core only needs a plain object, so this
// module is the single place to swap in PostgreSQL later (see README → Production).
export function seedDb() {
  const db = buildSeed({ hash: hashPassword, verify: verifyPassword, encrypt });
  // Platform gateway credentials come from .env
  if (env.sslcz.storeId) Object.assign(db.config.payment.gateways.sslcommerz, { storeId: env.sslcz.storeId, storePassword: env.sslcz.storePassword, sandbox: env.sslcz.sandbox });
  return db;
}

export function loadDb() {
  mkdirSync(path.dirname(env.dataFile), { recursive: true });
  if (!existsSync(env.dataFile)) { const db = seedDb(); saveNow(db); console.log(`[db] seeded ${env.dataFile}`); return db; }
  return JSON.parse(readFileSync(env.dataFile, 'utf8'));
}

function saveNow(db) {
  const tmp = `${env.dataFile}.tmp`;
  writeFileSync(tmp, JSON.stringify(db));
  renameSync(tmp, env.dataFile);
}
let timer = null;
export function scheduleSave(db) {
  clearTimeout(timer);
  timer = setTimeout(() => saveNow(db), 80);
}
export function flush(db) { clearTimeout(timer); saveNow(db); }
