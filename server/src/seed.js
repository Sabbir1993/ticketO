import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { env } from './env.js';
import { seedDb } from './db.js';

mkdirSync(path.dirname(env.dataFile), { recursive: true });
writeFileSync(env.dataFile, JSON.stringify(seedDb()));
console.log(`Seeded fresh database → ${env.dataFile}`);
