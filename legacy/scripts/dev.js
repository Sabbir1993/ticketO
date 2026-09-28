// Runs the API (port 4000) and the React dev server (port 5173) together.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const run = (name, args, cwd, color) => {
  const p = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd, shell: process.platform === 'win32' });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  p.stdout.on('data', (d) => process.stdout.write(d.toString().split('\n').filter(Boolean).map((l) => tag + l).join('\n') + '\n'));
  p.stderr.on('data', (d) => process.stderr.write(tag + d));
  p.on('exit', (c) => { console.log(`${tag}exited (${c})`); process.exit(c || 0); });
  return p;
};
const procs = [run('api', ['run', 'dev'], fileURLToPath(new URL('../server', import.meta.url)), 35), run('web', ['run', 'dev'], fileURLToPath(new URL('../client', import.meta.url)), 36)];
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { procs.forEach((p) => p.kill()); process.exit(0); });
