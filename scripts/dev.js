// Starts LaraNode (APP_PORT, default 3333) and the Vite dev server (5173) together.
// Open http://localhost:3333 — the Edge shell loads the React app from Vite with HMR.
const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const run = (name, cmd, args, color) => {
    const p = spawn(cmd, args, { cwd: root, shell: process.platform === 'win32' });
    const tag = `\x1b[${color}m[${name}]\x1b[0m `;
    p.stdout.on('data', (d) => process.stdout.write(d.toString().split('\n').filter(Boolean).map((l) => tag + l).join('\n') + '\n'));
    p.stderr.on('data', (d) => process.stderr.write(tag + d));
    p.on('exit', (c) => { console.log(`${tag}exited (${c})`); process.exit(c || 0); });
    return p;
};

const procs = [
    run('app', 'npx', ['nodemon', '--quiet', '--watch', 'app', '--watch', 'routes', '--watch', 'config', 'server.js'], 35),
    run('web', 'npx', ['vite', '--config', 'vite.config.mjs'], 36),
];
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { procs.forEach((p) => p.kill()); process.exit(0); });
