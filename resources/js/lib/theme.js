// Runtime theming: turns two brand colours into full 50–900 scales (CSS variables).
const hex = (h) => { const s = String(h || '').replace('#', ''); const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0); };
const TINT = { 50: 0.94, 100: 0.86, 200: 0.72, 300: 0.55, 400: 0.28 };
const SHADE = { 600: 0.14, 700: 0.28, 800: 0.42, 900: 0.56 };
export function colorScale(h) {
  const c = hex(h); const out = { 500: c };
  Object.entries(TINT).forEach(([k, v]) => { out[k] = c.map((x) => Math.round(x + (255 - x) * v)); });
  Object.entries(SHADE).forEach(([k, v]) => { out[k] = c.map((x) => Math.round(x * (1 - v))); });
  return out;
}
export function applyTheme(b = {}) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement.style;
  [['brand', b.primary], ['accent', b.accent]].forEach(([name, color]) => {
    if (!color) return;
    Object.entries(colorScale(color)).forEach(([k, v]) => root.setProperty(`--${name}-${k}`, v.join(' ')));
  });
  if (b.dark) root.setProperty('--dark', hex(b.dark).join(' '));
  if (b.radius !== undefined) root.setProperty('--radius', `${b.radius}px`);
  if (b.name) document.title = `${b.name} — Movies, Cricket, Concerts & Events`;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta && b.primary) meta.setAttribute('content', b.primary);
}
// Readable text colour on top of a background
export function onColor(h) { const [r, g, b] = hex(h); return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0F172A' : '#FFFFFF'; }
