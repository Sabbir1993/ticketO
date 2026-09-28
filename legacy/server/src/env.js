import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile) && typeof process.loadEnvFile === 'function') process.loadEnvFile(envFile);

const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));
export const env = {
  port: Number(process.env.PORT || 4000),
  serverUrl: (process.env.SERVER_URL || 'http://localhost:4000').replace(/\/$/, ''),
  clientUrl: (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, ''),
  ipnBaseUrl: (process.env.IPN_BASE_URL || '').replace(/\/$/, ''),
  appSecret: process.env.APP_SECRET || 'dev-secret-change-me',
  dataFile: path.resolve(ROOT, process.env.DATA_FILE || './data/db.json'),
  uploadsDir: path.join(ROOT, 'uploads'),
  fallbackToSimulator: bool(process.env.PG_FALLBACK_SIMULATOR, process.env.NODE_ENV !== 'production'),
  sslcz: { storeId: process.env.SSLCZ_STORE_ID, storePassword: process.env.SSLCZ_STORE_PASSWORD, sandbox: bool(process.env.SSLCZ_SANDBOX, true) },
};
