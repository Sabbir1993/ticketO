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
const lin = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const contrastWhite = ([r, g, b]) => 1.05 / (0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) + 0.05);
/** Darkens a light brand colour (same hue) until white text on it reaches WCAG 3:1; returns a hex string. */
export function readableOnWhite(h) {
  let c = hex(h);
  for (let i = 0; i < 40 && contrastWhite(c) < 3; i++) c = c.map((x) => Math.round(x * 0.94));
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}
/** CSS variables for a merchant theme, to put on a wrapper element (scoped — never touches <html>). */
export function themeStyle(t) {
  const style = {};
  [['brand', t?.primary], ['accent', t?.accent]].forEach(([name, color]) => {
    if (!/^#[0-9a-f]{6}$/i.test(color || '')) return;
    Object.entries(colorScale(readableOnWhite(color))).forEach(([k, v]) => { style[`--${name}-${k}`] = v.join(' '); });
  });
  return style;
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
