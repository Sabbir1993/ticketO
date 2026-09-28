// ---------------------------------------------------------------------------
// Layout geometry — every block shape and every seat position is computed from
// the layout JSON, so any venue (stadium, hall, ground, arena, club…) can be
// described without code. Used by the server (inventory) and the client (maps).
//
// Shapes (all in the layout's SVG coordinate space):
//   { type: 'rect',    x, y, w, h, rotate?, front? }        front: 'top' | 'bottom' | 'left' | 'right' | 'auto'
//   { type: 'arc',     cx, cy, rx1, ry1, rx2, ry2, a0, a1 } elliptical ring segment, degrees (0° = east, clockwise)
//   { type: 'polygon', points: [[x,y], …] }                 free-form zone (standing / GA)
//   { type: 'circle',  cx, cy, r }                          round zone / table
// Seated blocks:
//   rows | rowLabels, seatsPerRow, rowSeats?: { A: 18, B: 20 }, removed?: ['A1'], aisles?: [4, 12]
// ---------------------------------------------------------------------------

const ROWS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
export const rowLabels = (n, start = 0) => Array.from({ length: n }, (_, i) => { const k = start + i; return k < 26 ? ROWS[k] : `${ROWS[Math.floor(k / 26) - 1]}${ROWS[k % 26]}`; });

// ------------------------------------------------------------------ seats
export function blockRows(b) { return b.rowLabels || rowLabels(Number(b.rows) || 0, Number(b.rowStart) || 0); }
export function seatsInRow(b, label) { const v = b.rowSeats?.[label]; return v === undefined || v === '' || v === null ? Number(b.seatsPerRow) || 0 : Number(v); }
export function maxSeats(b) { return Math.max(0, ...blockRows(b).map((r) => seatsInRow(b, r))); }
export function blockSeatIds(b) {
  if (b.sell !== 'seated') return [];
  const removed = new Set(b.removed || []);
  const out = [];
  blockRows(b).forEach((r) => { for (let n = 1; n <= seatsInRow(b, r); n++) { const id = `${r}${n}`; if (!removed.has(id)) out.push(id); } });
  return out;
}
export function seatExists(b, seatId) {
  const row = seatId.replace(/\d+$/, ''); const n = Number(seatId.slice(row.length));
  return blockRows(b).includes(row) && n >= 1 && n <= seatsInRow(b, row) && !(b.removed || []).includes(seatId);
}
export function blockCapacity(b) {
  if (!b || b.sell === 'none') return 0;
  if (b.sell === 'ga') return Number(b.capacity) || 0;
  return blockSeatIds(b).length;
}

// ----------------------------------------------------------------- shapes
const rad = (d) => (d * Math.PI) / 180;
const rot = ([x, y], [cx, cy], deg) => { if (!deg) return [x, y]; const r = rad(deg); const dx = x - cx; const dy = y - cy; return [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)]; };

export function shapePoints(s) {
  if (!s) return [];
  if (s.type === 'rect') {
    const c = [s.x + s.w / 2, s.y + s.h / 2];
    return [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]].map((p) => rot(p, c, s.rotate || 0));
  }
  if (s.type === 'arc') {
    const steps = Math.max(6, Math.ceil(Math.abs(s.a1 - s.a0) / 3));
    const pt = (rx, ry, a) => [s.cx + rx * Math.cos(rad(a)), s.cy + ry * Math.sin(rad(a))];
    const outer = []; const inner = [];
    for (let i = 0; i <= steps; i++) { const a = s.a0 + ((s.a1 - s.a0) * i) / steps; outer.push(pt(s.rx2, s.ry2, a)); inner.unshift(pt(s.rx1, s.ry1, a)); }
    return [...outer, ...inner];
  }
  if (s.type === 'circle') return Array.from({ length: 36 }, (_, i) => [s.cx + s.r * Math.cos(rad(i * 10)), s.cy + s.r * Math.sin(rad(i * 10))]);
  if (s.type === 'polygon') return s.points || [];
  return [];
}
export function shapePath(s) {
  if (s?.type === 'rect' && !s.rotate) return null; // caller renders <rect> with rounded corners
  const p = shapePoints(s);
  return p.length ? `M${p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')} Z` : '';
}
export const arcPath = (s) => shapePath({ ...s, type: 'arc' });
export function shapeBBox(s) {
  const p = shapePoints(s);
  if (!p.length) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = p.map((q) => q[0]); const ys = p.map((q) => q[1]);
  const x = Math.min(...xs); const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
export function shapeCenter(s) {
  if (!s) return [0, 0];
  if (s.type === 'arc') { const a = rad((s.a0 + s.a1) / 2); return [s.cx + ((s.rx1 + s.rx2) / 2) * Math.cos(a), s.cy + ((s.ry1 + s.ry2) / 2) * Math.sin(a)]; }
  if (s.type === 'circle') return [s.cx, s.cy];
  if (s.type === 'rect') return [s.x + s.w / 2, s.y + s.h / 2];
  const b = shapeBBox(s); return [b.x + b.w / 2, b.y + b.h / 2];
}
export function translateShape(s, dx, dy) {
  if (s.type === 'rect') return { ...s, x: s.x + dx, y: s.y + dy };
  if (s.type === 'circle') return { ...s, cx: s.cx + dx, cy: s.cy + dy };
  if (s.type === 'polygon') return { ...s, points: s.points.map(([x, y]) => [x + dx, y + dy]) };
  if (s.type === 'arc') return { ...s, cx: s.cx + dx, cy: s.cy + dy };
  return s;
}
export function pointInShape(s, [x, y]) {
  const p = shapePoints(s); let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i]; const [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function fieldCenter(spec) {
  const f = spec?.field;
  if (!f || f.type === 'none') { const st = (spec?.features || []).find((x) => x.kind === 'stage'); if (st) return [st.x + st.w / 2, st.y + st.h / 2]; const [W, H] = spec?.viewBox || [1000, 700]; return [W / 2, H / 2]; }
  if (f.cx !== undefined) return [f.cx, f.cy];
  return [f.x + f.w / 2, f.y + (f.h || 0) / 2];
}

// Seat coordinates for the zoomed seat map. Row A is always the row facing the field / stage.
export function seatPositions(b, spec) {
  if (b.sell !== 'seated' || !b.shape) return [];
  const s = b.shape; const rows = blockRows(b); const R = rows.length; if (!R) return [];
  const M = maxSeats(b); const aisles = (b.aisles || []).map(Number).filter((n) => n > 0 && n < M);
  const slotOf = (j) => j + aisles.filter((a) => a <= j).length * 0.8; // extra gap after an aisle
  const slots = slotOf(M - 1) + 1;
  const removed = new Set(b.removed || []);
  const out = [];
  if (s.type === 'arc') {
    const span = s.a1 - s.a0; const pad = span * 0.04;
    rows.forEach((r, i) => {
      const t = (i + 0.5) / R; const rx = s.rx1 + (s.rx2 - s.rx1) * t; const ry = s.ry1 + (s.ry2 - s.ry1) * t;
      const n = seatsInRow(b, r); const off = (slots - (slotOf(n - 1) + 1)) / 2;
      for (let j = 0; j < n; j++) {
        const a = s.a0 + pad + ((span - 2 * pad) * (off + slotOf(j) + 0.5)) / slots;
        out.push({ id: `${r}${j + 1}`, row: r, n: j + 1, x: s.cx + rx * Math.cos(rad(a)), y: s.cy + ry * Math.sin(rad(a)), gap: removed.has(`${r}${j + 1}`) });
      }
    });
    const arcLen = (Math.abs(span) * Math.PI / 180) * ((s.rx1 + s.rx2) / 2);
    const size = Math.min(arcLen / slots, (s.rx2 - s.rx1) / R) * 0.42;
    return out.map((p) => ({ ...p, r: size }));
  }
  if (s.type === 'rect') {
    const c = [s.x + s.w / 2, s.y + s.h / 2];
    let front = s.front && s.front !== 'auto' ? s.front : null;
    if (!front) { const [fx, fy] = fieldCenter(spec); const dx = fx - c[0]; const dy = fy - c[1]; front = Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'bottom' : 'top') : (dx > 0 ? 'right' : 'left'); }
    const horiz = front === 'top' || front === 'bottom';
    const along = horiz ? s.w : s.h; const across = horiz ? s.h : s.w;
    const pa = along * 0.05; const pc = across * 0.08;
    const sp = (along - 2 * pa) / slots; const rp = (across - 2 * pc) / R;
    rows.forEach((r, i) => {
      const n = seatsInRow(b, r); const off = (slots - (slotOf(n - 1) + 1)) / 2;
      const ri = front === 'top' || front === 'left' ? i : R - 1 - i;
      for (let j = 0; j < n; j++) {
        const u = pa + (off + slotOf(j) + 0.5) * sp; const v = pc + (ri + 0.5) * rp;
        const local = horiz ? [s.x + u, s.y + v] : [s.x + v, s.y + u];
        const [x, y] = rot(local, c, s.rotate || 0);
        out.push({ id: `${r}${j + 1}`, row: r, n: j + 1, x, y, gap: removed.has(`${r}${j + 1}`) });
      }
    });
    const size = Math.min(sp, rp) * 0.42;
    return out.map((p) => ({ ...p, r: size }));
  }
  return [];
}
