// Visual venue layout designer. Produces the same JSON the booking map reads, so every
// venue can be unique: draw stands, sections, tables and standing zones; generate stadium
// rings, hall sections or zone grids; tune seats row by row; preview every seat.
//
// Canvas: V select/move · R rectangle · C circle · P polygon (click points, Enter / click
// first point to close) · F facility. Arc blocks rotate around the field when dragged
// (hold Shift to move instead). Delete, Ctrl+D duplicate, arrows nudge (Shift = 10),
// Ctrl+Z / Ctrl+Shift+Z undo / redo.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { MapDefs, Background, Field, Features, ShapeEl, FIELD_TYPES, FEATURE_STYLE } from './VenueMap';
import Icon from '../Icon';
import { shapeBBox, shapeCenter, translateShape, seatPositions, blockCapacity, rowLabels } from '@shared/geometry.mjs';
import { cx } from '@/lib/utils';

const PALETTE = ['#2D499A', '#EE3240', '#0F766E', '#B45309', '#7C3AED', '#0369A1', '#BE123C', '#15803D', '#9333EA', '#EA580C'];
const clone = (o) => JSON.parse(JSON.stringify(o));
const r1 = (n) => Math.round(n * 10) / 10;
const deg = (r) => (r * 180) / Math.PI;
const listNum = (s) => String(s || '').split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n));
const listStr = (s) => String(s || '').split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);

export function checkSpec(spec) {
  const errs = [];
  const tiers = new Set((spec.tiers || []).map((t) => t.id));
  const ids = new Set();
  if (!spec.tiers?.length) errs.push('Add at least one price tier');
  if (!spec.blocks?.length) errs.push('Add at least one block');
  (spec.blocks || []).forEach((b) => {
    if (!b.id) errs.push('A block has no id');
    if (ids.has(b.id)) errs.push(`Duplicate block id ${b.id}`); ids.add(b.id);
    if (b.sell !== 'none' && !tiers.has(b.tier)) errs.push(`${b.id}: unknown tier "${b.tier}"`);
    if (b.sell === 'seated' && blockCapacity(b) < 1) errs.push(`${b.id}: no seats`);
    if (b.sell === 'ga' && !(Number(b.capacity) > 0)) errs.push(`${b.id}: set a capacity`);
    if (b.shape?.type === 'polygon' && (b.shape.points || []).length < 3) errs.push(`${b.id}: polygon needs 3+ points`);
  });
  return errs;
}

// ------------------------------------------------------------------ generators
function genStadium(o, spec) {
  const [W, H] = spec.viewBox || [1000, 760];
  const cxp = W / 2; const cyp = H / 2;
  const fx = Number(o.fieldRx); const fy = o.shape === 'circle' ? fx : Number(o.fieldRy);
  const open = Number(o.openEnd) || 0; const total = 360 - open; const start = 90 + open / 2;
  const tiers = []; const blocks = [];
  let rIn = fx + 26;
  o.rings.forEach((ring, ri) => {
    const depth = Number(ring.depth); const n = Math.max(1, Number(ring.blocks)); const gap = Number(o.gap) || 0;
    const k = fy / fx; const tierId = ring.tier || `t${ri + 1}`;
    if (!tiers.some((t) => t.id === tierId)) tiers.push({ id: tierId, name: ring.name || `Tier ${ri + 1}`, color: PALETTE[ri % PALETTE.length] });
    for (let i = 0; i < n; i++) {
      const a0 = start + (total * i) / n + gap / 2; const a1 = start + (total * (i + 1)) / n - gap / 2;
      blocks.push({ id: `${ring.prefix || String.fromCharCode(65 + ri)}${i + 1}`, name: `${ring.name || `Tier ${ri + 1}`} ${i + 1}`, tier: tierId, sell: ring.sell, level: ring.name,
        ...(ring.sell === 'seated' ? { rows: Number(ring.rows), seatsPerRow: Number(ring.seats) } : { capacity: Number(ring.capacity) }),
        shape: { type: 'arc', cx: cxp, cy: cyp, rx1: r1(rIn), ry1: r1(rIn * k), rx2: r1(rIn + depth), ry2: r1((rIn + depth) * k), a0: r1(a0 - 360 * (a0 > 270 ? 1 : 0)), a1: r1(a1 - 360 * (a0 > 270 ? 1 : 0)) } });
    }
    rIn += depth + 14;
  });
  const field = o.field === 'ring' ? { type: 'ring', cx: cxp, cy: cyp, size: Math.min(fx, fy) * 1.2, label: 'Ring' }
    : o.field === 'court' || o.field === 'pitch' ? { type: o.field, x: r1(cxp - fx * 0.75), y: r1(cyp - fy * 0.62), w: r1(fx * 1.5), h: r1(fy * 1.24) }
    : { type: o.shape === 'circle' ? 'round' : 'oval', cx: cxp, cy: cyp, rx: fx, ry: fy, label: 'Ground' };
  const features = open ? [{ kind: 'stage', x: cxp - fx * 0.6, y: cyp + fy + 40, w: fx * 1.2, h: 60, label: 'STAGE' }] : [];
  return { ...spec, background: o.field === 'ring' || o.field === 'court' ? 'plain' : spec.background, field, features, tiers, blocks, pitch: o.field === 'oval' ? { w: 26, h: 110 } : { w: 0, h: 0 } };
}
function genHall(o, spec) {
  const W = 1000; const secs = Math.max(1, Number(o.sections)); const gap = 30; const margin = 60;
  const width = (W - margin * 2 - gap * (secs - 1)) / secs;
  const rows = Number(o.rows); const seats = Number(o.seats); const rh = 20;
  const top = 150; const tiers = [{ id: 'prime', name: 'Prime', color: PALETTE[0] }, { id: 'classic', name: 'Classic', color: PALETTE[2] }];
  const blocks = []; const primeRows = Math.ceil(rows * 0.4);
  for (let i = 0; i < secs; i++) {
    const x = margin + i * (width + gap); const name = secs === 3 ? ['Left', 'Centre', 'Right'][i] : `Section ${i + 1}`;
    const tilt = o.curve && secs > 1 ? (i - (secs - 1) / 2) * -8 : 0;
    blocks.push({ id: `P${i + 1}`, name: `${name} front`, tier: 'prime', sell: 'seated', rowLabels: rowLabels(primeRows), seatsPerRow: seats, shape: { type: 'rect', x: r1(x), y: top, w: r1(width), h: primeRows * rh, rotate: tilt, front: 'top' } });
    blocks.push({ id: `C${i + 1}`, name: `${name} rear`, tier: 'classic', sell: 'seated', rowLabels: rowLabels(rows - primeRows, primeRows), seatsPerRow: seats, shape: { type: 'rect', x: r1(x), y: top + primeRows * rh + 26, w: r1(width), h: (rows - primeRows) * rh, rotate: tilt, front: 'top' } });
  }
  let H = top + rows * rh + 26 + 60;
  if (Number(o.balconyRows) > 0) {
    tiers.push({ id: 'balcony', name: 'Balcony', color: PALETTE[4] });
    const bh = Number(o.balconyRows) * rh;
    blocks.push({ id: 'BAL', name: 'Balcony', tier: 'balcony', sell: 'seated', level: 'Balcony', rows: Number(o.balconyRows), seatsPerRow: Math.round(seats * secs * 0.9), shape: { type: 'rect', x: margin, y: H, w: W - margin * 2, h: bh, front: 'top' } });
    H += bh + 50;
  }
  return { ...spec, viewBox: [W, Math.round(H)], background: 'plain', field: { type: o.screen ? 'screen' : 'stage', x: 250, y: 40, w: 500, h: o.screen ? 22 : 70, label: o.screen ? 'Screen' : 'Stage' }, features: [], tiers, blocks, stage: o.screen ? 'bottom' : 'top' };
}
function genZones(o, spec) {
  const W = 1000; const cols = Number(o.cols); const rows = Number(o.rows); const gap = 18; const top = 170; const side = 60;
  const w = (W - side * 2 - gap * (cols - 1)) / cols; const h = 110;
  const tiers = [{ id: 'front', name: 'Front zone', color: PALETTE[1] }, { id: 'ga', name: 'General', color: PALETTE[0] }];
  const blocks = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) blocks.push({ id: `Z${r + 1}${String.fromCharCode(65 + c)}`, name: `Zone ${r + 1}${String.fromCharCode(65 + c)}`, tier: r === 0 ? 'front' : 'ga', sell: 'ga', capacity: Number(o.capacity), shape: { type: 'rect', x: r1(side + c * (w + gap)), y: top + r * (h + gap), w: r1(w), h } });
  const H = top + rows * (h + gap) + 70;
  return { ...spec, viewBox: [W, H], background: 'grass', field: { type: 'none' }, tiers, blocks, features: [{ kind: 'stage', x: 300, y: 40, w: 400, h: 90, label: 'STAGE' }, { kind: 'gate', x: 440, y: H - 44, w: 120, h: 30, label: 'ENTRY' }, { kind: 'food', x: 20, y: H - 44, w: 140, h: 30, label: 'FOOD COURT' }, { kind: 'wc', x: W - 120, y: H - 44, w: 100, h: 30, label: 'WC' }] };
}

// ------------------------------------------------------------------ small inputs
function Num({ label, value, onChange, step = 1, min, w }) {
  return <label className={cx('block', w)}><span className="mb-0.5 block text-[11px] font-medium text-ink-500">{label}</span><input type="number" step={step} min={min} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} className="h-8 w-full rounded-md border border-ink-100 px-2 text-sm outline-none focus:border-brand-400" /></label>;
}
function Txt({ label, value, onChange, placeholder, mono }) {
  return <label className="block"><span className="mb-0.5 block text-[11px] font-medium text-ink-500">{label}</span><input value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cx('h-8 w-full rounded-md border border-ink-100 px-2 text-sm outline-none focus:border-brand-400', mono && 'font-mono')} /></label>;
}
function Sel({ label, value, onChange, options }) {
  return <label className="block"><span className="mb-0.5 block text-[11px] font-medium text-ink-500">{label}</span><select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="h-8 w-full rounded-md border border-ink-100 bg-white px-1.5 text-sm outline-none focus:border-brand-400">{options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}</select></label>;
}
// Text inputs for lists keep their own draft so typing "A1, " isn't reformatted mid-edit.
function ListInput({ label, value, onCommit, placeholder, parse = listStr }) {
  const [draft, setDraft] = useState(value.join(', '));
  useEffect(() => { setDraft(value.join(', ')); }, [value.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Txt label={label} value={draft} placeholder={placeholder} mono onChange={(v) => { setDraft(v); onCommit(parse(v)); }} />;
}

const TOOLS = [['select', 'MousePointer2', 'Select / move (V)'], ['rect', 'Square', 'Rectangle block (R)'], ['circle', 'Circle', 'Round zone / table (C)'], ['polygon', 'Pentagon', 'Free-form zone (P)'], ['feature', 'Store', 'Facility: stage, food, gate… (F)']];

export default function LayoutDesigner({ value, onChange, viewTypes = [], lockMeta = false, height = '70vh' }) {
  const uid = useId().replace(/:/g, '');
  const init = useMemo(() => { const t = clone(value); t.spec.viewBox ||= [1000, 700]; t.spec.tiers ||= []; t.spec.blocks ||= []; t.spec.features ||= []; return t; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [hist, setHist] = useState({ past: [], present: init, future: [] });
  const tpl = hist.present; const spec = tpl.spec;
  const [sel, setSel] = useState(null); // { kind: 'block'|'feature', i }
  const [tool, setTool] = useState('select');
  const [tab, setTab] = useState('item');
  const [snap, setSnap] = useState(true);
  const [showSeats, setShowSeats] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [draft, setDraft] = useState(null); // shape being drawn
  const [json, setJson] = useState(null);
  const [jsonErr, setJsonErr] = useState('');
  const svg = useRef(null); const drag = useRef(null);
  const [W, H] = spec.viewBox;
  const G = snap ? 10 : 1; const sn = (v) => Math.round(v / G) * G;

  useEffect(() => { onChange?.(tpl); }, [tpl]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = useCallback((fn, record = true) => setHist((h) => {
    const next = typeof fn === 'function' ? fn(clone(h.present)) : fn;
    return record ? { past: [...h.past.slice(-60), h.present], present: next, future: [] } : { ...h, present: next };
  }), []);
  const undo = () => setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1), future: [h.present, ...h.future] } : h));
  const redo = () => setHist((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h));
  const setSpec = (patch, record = true) => commit((t) => { t.spec = { ...t.spec, ...(typeof patch === 'function' ? patch(t.spec) : patch) }; return t; }, record);
  const updBlock = (i, patch, record = true) => commit((t) => { t.spec.blocks[i] = { ...t.spec.blocks[i], ...patch }; return t; }, record);
  const updShape = (i, patch, record = true) => commit((t) => { t.spec.blocks[i].shape = { ...t.spec.blocks[i].shape, ...patch }; return t; }, record);
  const updFeature = (i, patch, record = true) => commit((t) => { t.spec.features[i] = { ...t.spec.features[i], ...patch }; return t; }, record);

  const pt = (e) => { const s = svg.current; const p = s.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(s.getScreenCTM().inverse()); return [q.x, q.y]; };
  const nextId = (prefix) => { let n = 1; const ids = new Set(spec.blocks.map((b) => b.id)); while (ids.has(`${prefix}${n}`)) n++; return `${prefix}${n}`; };
  const defaultTier = () => spec.tiers[0]?.id || 'std';
  const ensureTier = (t) => { if (!t.spec.tiers.length) t.spec.tiers.push({ id: 'std', name: 'Standard', color: PALETTE[0] }); };
  const selBlock = sel?.kind === 'block' ? spec.blocks[sel.i] : null;
  const selFeature = sel?.kind === 'feature' ? spec.features[sel.i] : null;

  const del = () => { if (!sel) return; commit((t) => { (sel.kind === 'block' ? t.spec.blocks : t.spec.features).splice(sel.i, 1); return t; }); setSel(null); };
  const dup = () => {
    if (!sel) return;
    commit((t) => {
      if (sel.kind === 'feature') { const f = clone(t.spec.features[sel.i]); t.spec.features.push({ ...f, x: f.x + 20, y: f.y + 20 }); return t; }
      const b = clone(t.spec.blocks[sel.i]); const pre = b.id.replace(/\d+$/, '') || 'B';
      let n = 1; const ids = new Set(t.spec.blocks.map((x) => x.id)); while (ids.has(`${pre}${n}`)) n++;
      b.id = `${pre}${n}`; b.name = `${b.name.replace(/\s*\d+$/, '')} ${n}`;
      if (b.shape) b.shape = b.shape.type === 'arc' ? { ...b.shape, a0: b.shape.a1 + 2, a1: b.shape.a1 + 2 + (b.shape.a1 - b.shape.a0) } : translateShape(b.shape, 24, 24);
      t.spec.blocks.push(b); return t;
    });
    setSel({ kind: sel.kind, i: sel.kind === 'block' ? spec.blocks.length : spec.features.length });
  };
  const nudge = (dx, dy) => {
    if (!sel) return;
    if (sel.kind === 'feature') return updFeature(sel.i, { x: selFeature.x + dx, y: selFeature.y + dy });
    if (selBlock?.shape) updBlock(sel.i, { shape: translateShape(selBlock.shape, dx, dy) });
  };

  useEffect(() => {
    const k = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); return redo(); }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); return dup(); }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (sel) { e.preventDefault(); del(); } return; }
      if (e.key === 'Escape') { setDraft(null); setSel(null); return; }
      if (e.key === 'Enter' && draft?.type === 'polygon') return finishPolygon();
      const step = e.shiftKey ? 10 : 1;
      const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (arrows[e.key] && sel) { e.preventDefault(); return nudge(...arrows[e.key]); }
      if (!mod) { const t = { v: 'select', r: 'rect', c: 'circle', p: 'polygon', f: 'feature' }[e.key.toLowerCase()]; if (t) { setTool(t); setDraft(null); } }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  // ------------------------------------------------------------ pointer logic
  const finishPolygon = () => {
    if (!draft || draft.points.length < 3) return setDraft(null);
    const id = nextId('Z');
    commit((t) => { ensureTier(t); t.spec.blocks.push({ id, name: `Zone ${id}`, tier: t.spec.tiers[0].id, sell: 'ga', capacity: 300, shape: { type: 'polygon', points: draft.points.map(([x, y]) => [r1(x), r1(y)]) } }); return t; });
    setSel({ kind: 'block', i: spec.blocks.length }); setDraft(null); setTool('select'); setTab('item');
  };
  const onDown = (e) => {
    if (e.button !== 0) return;
    const [x, y] = pt(e);
    if (tool === 'polygon') {
      const p = [sn(x), sn(y)];
      if (draft?.points?.length >= 3) { const [fx, fy] = draft.points[0]; if (Math.hypot(fx - p[0], fy - p[1]) < 14) return finishPolygon(); }
      return setDraft({ type: 'polygon', points: [...(draft?.points || []), p], cursor: p });
    }
    if (tool === 'rect' || tool === 'feature' || tool === 'circle') { svg.current.setPointerCapture(e.pointerId); return setDraft({ type: tool, x0: sn(x), y0: sn(y), x1: sn(x), y1: sn(y) }); }
    setSel(null); // click on empty canvas
  };
  const onMove = (e) => {
    const [x, y] = pt(e);
    if (draft) { if (draft.type === 'polygon') setDraft({ ...draft, cursor: [sn(x), sn(y)] }); else setDraft({ ...draft, x1: sn(x), y1: sn(y) }); return; }
    const d = drag.current; if (!d) return;
    const dx = x - d.x0; const dy = y - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < 2) return;
    if (!d.moved) { d.moved = true; commit((t) => t); } // snapshot once for undo
    const o = d.orig;
    if (d.kind === 'feature') {
      if (d.handle === 'se') updFeature(d.i, { w: Math.max(10, sn(o.x + o.w + dx) - o.x), h: Math.max(10, sn(o.y + o.h + dy) - o.y) }, false);
      else updFeature(d.i, { x: sn(o.x + dx), y: sn(o.y + dy) }, false);
      return;
    }
    const s = o.shape;
    if (d.handle === 'se' && s.type === 'rect') return updShape(d.i, { w: Math.max(10, sn(s.w + dx)), h: Math.max(10, sn(s.h + dy)) }, false);
    if (d.handle === 'r' && s.type === 'circle') return updShape(d.i, { r: Math.max(6, sn(Math.hypot(x - s.cx, y - s.cy))) }, false);
    if (d.handle?.startsWith('v') && s.type === 'polygon') { const k = Number(d.handle.slice(1)); const pts = s.points.map((p, j) => (j === k ? [sn(x), sn(y)] : p)); return updShape(d.i, { points: pts }, false); }
    if (s.type === 'arc' && d.handle) {
      const a = deg(Math.atan2((y - s.cy) / s.ry2, (x - s.cx) / s.rx2));
      const norm = (v, ref) => { let t = v; while (t - ref > 180) t -= 360; while (ref - t > 180) t += 360; return Math.round(t); };
      if (d.handle === 'a0') return updShape(d.i, { a0: Math.min(norm(a, s.a0), s.a1 - 2) }, false);
      if (d.handle === 'a1') return updShape(d.i, { a1: Math.max(norm(a, s.a1), s.a0 + 2) }, false);
      if (d.handle === 'out') { const k = s.ry2 / s.rx2; const rx = Math.max(s.rx1 + 10, Math.hypot(x - s.cx, (y - s.cy) / k)); return updShape(d.i, { rx2: r1(rx), ry2: r1(rx * k) }, false); }
    }
    if (s.type === 'arc' && !e.shiftKey) {
      const ang = (px, py) => deg(Math.atan2((py - s.cy) / s.ry2, (px - s.cx) / s.rx2));
      let da = ang(x, y) - ang(d.x0, d.y0); if (da > 180) da -= 360; if (da < -180) da += 360; da = Math.round(da);
      return updShape(d.i, { a0: s.a0 + da, a1: s.a1 + da }, false);
    }
    const moved = translateShape(s, dx, dy);
    if (moved.type === 'rect') { moved.x = sn(moved.x); moved.y = sn(moved.y); }
    if (moved.type === 'circle' || moved.type === 'arc') { moved.cx = sn(moved.cx); moved.cy = sn(moved.cy); }
    updShape(d.i, moved, false);
  };
  const onUp = () => {
    drag.current = null;
    if (!draft || draft.type === 'polygon') return;
    const x = Math.min(draft.x0, draft.x1); const y = Math.min(draft.y0, draft.y1); const w = Math.abs(draft.x1 - draft.x0); const h = Math.abs(draft.y1 - draft.y0);
    setDraft(null);
    if (draft.type === 'circle') {
      const r = Math.hypot(draft.x1 - draft.x0, draft.y1 - draft.y0); if (r < 8) return;
      const id = nextId('T'); commit((t) => { ensureTier(t); t.spec.blocks.push({ id, name: `Table ${id}`, tier: t.spec.tiers[0].id, sell: 'ga', capacity: 10, shape: { type: 'circle', cx: draft.x0, cy: draft.y0, r: r1(r) } }); return t; });
      setSel({ kind: 'block', i: spec.blocks.length });
    } else if (w >= 10 && h >= 10) {
      if (draft.type === 'feature') { commit((t) => { t.spec.features.push({ kind: 'food', x, y, w, h, label: 'FOOD' }); return t; }); setSel({ kind: 'feature', i: spec.features.length }); }
      else { const id = nextId('S'); const rows = Math.max(1, Math.round(h / 16)); const seats = Math.max(1, Math.round(w / 14)); commit((t) => { ensureTier(t); t.spec.blocks.push({ id, name: `Section ${id}`, tier: t.spec.tiers[0].id, sell: 'seated', rows, seatsPerRow: seats, shape: { type: 'rect', x, y, w, h, front: 'auto' } }); return t; }); setSel({ kind: 'block', i: spec.blocks.length }); }
    } else return;
    setTool('select'); setTab('item');
  };
  const grab = (e, kind, i, handle) => {
    if (tool !== 'select') return;
    e.stopPropagation(); svg.current.setPointerCapture(e.pointerId);
    const [x, y] = pt(e);
    drag.current = { kind, i, handle, x0: x, y0: y, orig: clone(kind === 'block' ? spec.blocks[i] : spec.features[i]) };
    setSel({ kind, i }); setTab('item');
  };

  const tierColor = (id) => spec.tiers.find((t) => t.id === id)?.color || '#94a3b8';
  const totalCap = spec.blocks.reduce((a, b) => a + blockCapacity(b), 0);
  const errs = checkSpec(spec);
  const shapeless = spec.blocks.map((b, i) => [b, i]).filter(([b]) => !b.shape);
  const hs = Math.max(W, H) / 130; // handle size

  // ------------------------------------------------------------ render
  const handles = () => {
    if (selFeature) return <rect x={selFeature.x + selFeature.w - hs} y={selFeature.y + selFeature.h - hs} width={hs * 2} height={hs * 2} className="cursor-nwse-resize" fill="#fff" stroke="rgb(var(--brand-500))" strokeWidth="2" onPointerDown={(e) => grab(e, 'feature', sel.i, 'se')} />;
    const s = selBlock?.shape; if (!s) return null;
    const H_ = (x, y, h, cur = 'cursor-move') => <circle key={h} cx={x} cy={y} r={hs} className={cur} fill="#fff" stroke="rgb(var(--brand-500))" strokeWidth="2" onPointerDown={(e) => grab(e, 'block', sel.i, h)} />;
    if (s.type === 'rect' && !s.rotate) return H_(s.x + s.w, s.y + s.h, 'se', 'cursor-nwse-resize');
    if (s.type === 'circle') return H_(s.cx + s.r, s.cy, 'r', 'cursor-ew-resize');
    if (s.type === 'polygon') return s.points.map(([x, y], k) => H_(x, y, `v${k}`));
    if (s.type === 'arc') {
      const P = (rx, ry, a) => [s.cx + rx * Math.cos((a * Math.PI) / 180), s.cy + ry * Math.sin((a * Math.PI) / 180)];
      const mid = (s.a0 + s.a1) / 2;
      return [H_(...P((s.rx1 + s.rx2) / 2, (s.ry1 + s.ry2) / 2, s.a0), 'a0'), H_(...P((s.rx1 + s.rx2) / 2, (s.ry1 + s.ry2) / 2, s.a1), 'a1'), H_(...P(s.rx2, s.ry2, mid), 'out')];
    }
    return null;
  };

  const TABS = [['item', 'Item'], ['canvas', 'Canvas'], ['tiers', 'Tiers'], ['gen', 'Generate'], ['json', 'JSON']];

  return (
    <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_330px]" data-testid="layout-designer">
      <div className="flex min-w-0 flex-col rounded-xl border border-ink-100 bg-white">
        <div className="flex flex-wrap items-center gap-1 border-b border-ink-100 p-2">
          {TOOLS.map(([id, icon, title]) => <button key={id} type="button" title={title} aria-label={title} aria-pressed={tool === id} onClick={() => { setTool(id); setDraft(null); }} className={cx('flex h-8 w-8 items-center justify-center rounded-md', tool === id ? 'bg-brand-500 text-white' : 'text-ink-700 hover:bg-ink-50')}><Icon name={icon} size={16} /></button>)}
          <span className="mx-1 h-5 w-px bg-ink-100" />
          <button type="button" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undo} disabled={!hist.past.length} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-ink-50 disabled:opacity-30"><Icon name="Undo2" size={16} /></button>
          <button type="button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" onClick={redo} disabled={!hist.future.length} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-ink-50 disabled:opacity-30"><Icon name="Redo2" size={16} /></button>
          <button type="button" title="Duplicate (Ctrl+D)" aria-label="Duplicate" onClick={dup} disabled={!sel} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-ink-50 disabled:opacity-30"><Icon name="Copy" size={16} /></button>
          <button type="button" title="Delete (Del)" aria-label="Delete selected" onClick={del} disabled={!sel} className="flex h-8 w-8 items-center justify-center rounded-md text-accent-600 hover:bg-accent-50 disabled:opacity-30"><Icon name="Trash2" size={16} /></button>
          <span className="mx-1 h-5 w-px bg-ink-100" />
          <label className="flex items-center gap-1 text-xs text-ink-700"><input type="checkbox" className="accent-brand-500" checked={snap} onChange={(e) => setSnap(e.target.checked)} />Snap</label>
          <label className="ml-2 flex items-center gap-1 text-xs text-ink-700"><input type="checkbox" className="accent-brand-500" checked={showSeats} onChange={(e) => setShowSeats(e.target.checked)} />Seats</label>
          <div className="ml-auto flex items-center gap-1 text-xs">
            <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-ink-50"><Icon name="ZoomOut" size={15} /></button>
            <span className="w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-ink-50"><Icon name="ZoomIn" size={15} /></button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-[linear-gradient(45deg,#f8fafc_25%,transparent_25%,transparent_75%,#f8fafc_75%),linear-gradient(45deg,#f8fafc_25%,transparent_25%,transparent_75%,#f8fafc_75%)] bg-[length:20px_20px] bg-[position:0_0,10px_10px]" style={{ maxHeight: height }}>
          <svg ref={svg} viewBox={`0 0 ${W} ${H}`} style={{ width: `${zoom * 100}%`, cursor: tool === 'select' ? 'default' : 'crosshair', touchAction: 'none' }} className="block select-none"
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={() => draft?.type === 'polygon' && finishPolygon()} aria-label="Layout canvas">
            <MapDefs uid={uid} />
            <rect width={W} height={H} fill="#fff" />
            <Background spec={spec} uid={uid} viewType={tpl.viewType} />
            {snap && <g pointerEvents="none" opacity=".35">{Array.from({ length: Math.floor(W / 50) + 1 }, (_, i) => <line key={`x${i}`} x1={i * 50} x2={i * 50} y1="0" y2={H} stroke="#cbd5e1" strokeWidth=".6" />)}{Array.from({ length: Math.floor(H / 50) + 1 }, (_, i) => <line key={`y${i}`} y1={i * 50} y2={i * 50} x1="0" x2={W} stroke="#cbd5e1" strokeWidth=".6" />)}</g>}
            <Field spec={spec} uid={uid} />
            <g>{spec.features.map((ft, i) => {
              const st = FEATURE_STYLE[ft.kind] || ['#e2e8f0', '#0F172A']; const on = sel?.kind === 'feature' && sel.i === i;
              return <g key={`f${i}`} onPointerDown={(e) => grab(e, 'feature', i)} className={tool === 'select' ? 'cursor-move' : ''}>
                <rect x={ft.x} y={ft.y} width={ft.w} height={ft.h} rx="6" fill={st[0] === 'transparent' ? '#fff' : st[0]} fillOpacity={st[0] === 'transparent' ? 0.01 : 1} stroke={on ? 'rgb(var(--brand-500))' : 'none'} strokeWidth="3" strokeDasharray={on ? '8 5' : undefined} />
                <text x={ft.x + ft.w / 2} y={ft.y + ft.h / 2 + 5} textAnchor="middle" fontSize={ft.kind === 'stage' ? 18 : 12} fontWeight="700" fill={st[1]} pointerEvents="none">{ft.label}</text></g>;
            })}</g>
            {spec.blocks.map((b, i) => {
              if (!b.shape) return null;
              const on = sel?.kind === 'block' && sel.i === i; const [lx, ly] = shapeCenter(b.shape); const bb = shapeBBox(b.shape);
              return (
                <g key={`${b.id}-${i}`} onPointerDown={(e) => grab(e, 'block', i)} className={tool === 'select' ? 'cursor-move' : ''} data-block={b.id}>
                  <ShapeEl s={b.shape} fill={b.sell === 'none' ? '#e2e8f0' : tierColor(b.tier)} fillOpacity={showSeats && b.sell === 'seated' ? 0.18 : 0.78} stroke={on ? '#0F172A' : '#fff'} strokeWidth={on ? 3 : 1.5} strokeDasharray={on ? '7 4' : undefined} />
                  {!(showSeats && b.sell === 'seated') && <text x={lx} y={ly + 4} textAnchor="middle" fontSize={Math.max(9, Math.min(14, bb.w / 5, bb.h / 2))} fontWeight="700" fill={b.sell === 'none' ? '#64748B' : '#fff'} pointerEvents="none">{b.id}</text>}
                  {showSeats && b.sell === 'seated' && seatPositions(b, spec).map((p) => (p.gap ? null : <circle key={p.id} cx={p.x} cy={p.y} r={p.r} fill={tierColor(b.tier)} pointerEvents="none" />))}
                </g>
              );
            })}
            {handles()}
            {draft?.type === 'polygon' && <polyline points={[...draft.points, draft.cursor].filter(Boolean).map((p) => p.join(',')).join(' ')} fill="rgb(var(--brand-500) / .15)" stroke="rgb(var(--brand-500))" strokeWidth="2" strokeDasharray="6 4" pointerEvents="none" />}
            {draft?.type === 'polygon' && draft.points.map(([x, y], k) => <circle key={k} cx={x} cy={y} r={k === 0 ? hs * 1.2 : hs * 0.7} fill={k === 0 ? 'rgb(var(--accent-500))' : 'rgb(var(--brand-500))'} pointerEvents="none" />)}
            {draft && draft.type !== 'polygon' && (draft.type === 'circle'
              ? <circle cx={draft.x0} cy={draft.y0} r={Math.hypot(draft.x1 - draft.x0, draft.y1 - draft.y0)} fill="rgb(var(--brand-500) / .15)" stroke="rgb(var(--brand-500))" strokeWidth="2" strokeDasharray="6 4" pointerEvents="none" />
              : <rect x={Math.min(draft.x0, draft.x1)} y={Math.min(draft.y0, draft.y1)} width={Math.abs(draft.x1 - draft.x0)} height={Math.abs(draft.y1 - draft.y0)} fill="rgb(var(--brand-500) / .15)" stroke="rgb(var(--brand-500))" strokeWidth="2" strokeDasharray="6 4" pointerEvents="none" />)}
          </svg>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-100 px-3 py-2 text-xs text-ink-500">
          <span><b className="text-ink-900">{spec.blocks.length}</b> blocks</span>
          <span><b className="text-ink-900">{totalCap.toLocaleString()}</b> capacity</span>
          <span>{spec.blocks.filter((b) => b.sell === 'seated').length} seated · {spec.blocks.filter((b) => b.sell === 'ga').length} GA</span>
          {errs.length ? <span className="text-accent-600" title={errs.join('\n')}><Icon name="AlertTriangle" size={13} className="mr-1 inline" />{errs[0]}{errs.length > 1 ? ` (+${errs.length - 1})` : ''}</span> : <span className="text-emerald-600"><Icon name="CheckCircle2" size={13} className="mr-1 inline" />Layout valid</span>}
          <span className="ml-auto hidden sm:inline">{tool === 'polygon' ? 'Click to add points · Enter or click the first point to finish' : tool === 'select' ? 'Drag to move · arcs rotate (Shift = move)' : 'Drag on the canvas to draw'}</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-col rounded-xl border border-ink-100 bg-white">
        <div className="flex overflow-x-auto border-b border-ink-100 text-xs">{TABS.map(([id, l]) => <button key={id} type="button" onClick={() => { setTab(id); if (id === 'json') setJson(JSON.stringify(tpl, null, 2)); }} className={cx('flex-1 whitespace-nowrap px-2 py-2.5 font-medium', tab === id ? 'border-b-2 border-brand-500 text-brand-600' : 'text-ink-500 hover:text-ink-900')}>{l}</button>)}</div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" style={{ maxHeight: height }}>
          {tab === 'item' && !selBlock && !selFeature && (
            <div className="space-y-3 text-sm text-ink-500">
              <p>Select a block on the canvas, or draw a new one with the tools above. Use <b>Generate</b> to start from a stadium ring, hall or zone grid.</p>
              {shapeless.length > 0 && <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800"><b>{shapeless.length} block(s) have no shape</b> and show as a row plan. Place them on the canvas to turn this into a zoomable seat map.
                <div className="mt-2 flex flex-wrap gap-1">{shapeless.map(([b, i], k) => <button key={b.id} type="button" onClick={() => { updBlock(i, { shape: { type: 'rect', x: 80 + (k % 3) * 290, y: 150 + Math.floor(k / 3) * 150, w: 260, h: 120, front: 'top' } }); setSel({ kind: 'block', i }); }} className="rounded bg-white px-2 py-1 font-medium text-amber-900 shadow-sm">Place {b.id}</button>)}</div></div>}
              <div className="divide-y divide-ink-100 rounded-lg border border-ink-100">{spec.blocks.map((b, i) => <button key={`${b.id}-${i}`} type="button" onClick={() => setSel({ kind: 'block', i })} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-ink-50"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: tierColor(b.tier) }} /><b className="w-12 text-ink-900">{b.id}</b><span className="flex-1 truncate">{b.name}</span><span>{blockCapacity(b)}</span></button>)}</div>
            </div>
          )}
          {tab === 'item' && selBlock && (() => {
            const b = selBlock; const i = sel.i; const s = b.shape || {};
            const rowsList = b.rowLabels ? b.rowLabels : rowLabels(Number(b.rows) || 0, Number(b.rowStart) || 0);
            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Block</h4><span className="text-xs text-ink-500">{blockCapacity(b)} {b.sell === 'ga' ? 'spots' : 'seats'}</span></div>
                <div className="grid grid-cols-2 gap-2">
                  <Txt label="ID (unique)" value={b.id} onChange={(v) => updBlock(i, { id: v.toUpperCase().replace(/[^A-Z0-9-]/g, '') })} mono />
                  <Sel label="Sell as" value={b.sell} onChange={(v) => updBlock(i, { sell: v, ...(v === 'ga' && !b.capacity ? { capacity: 200 } : {}), ...(v === 'seated' && !b.rows && !b.rowLabels ? { rows: 5, seatsPerRow: 10 } : {}) })} options={[['seated', 'Numbered seats'], ['ga', 'Standing / GA'], ['none', 'Not sold (display)']]} />
                </div>
                <Txt label="Name" value={b.name} onChange={(v) => updBlock(i, { name: v })} />
                <div className="grid grid-cols-2 gap-2">
                  <Sel label="Price tier" value={b.tier} onChange={(v) => updBlock(i, { tier: v })} options={spec.tiers.map((t) => [t.id, t.name])} />
                  <Txt label="Level (optional)" value={b.level} onChange={(v) => updBlock(i, { level: v || undefined })} placeholder="Upper tier" />
                </div>
                {b.sell === 'ga' && <Num label="Capacity" value={b.capacity} min={1} onChange={(v) => updBlock(i, { capacity: v })} />}
                {b.sell === 'seated' && (
                  <div className="space-y-2 rounded-lg bg-ink-50 p-2.5">
                    <div className="grid grid-cols-3 gap-2">
                      <Num label="Rows" value={rowsList.length} min={1} onChange={(v) => updBlock(i, { rows: v, rowLabels: undefined, rowStart: b.rowLabels ? rowLabels(1).indexOf(b.rowLabels[0]) : b.rowStart })} />
                      <Num label="Seats / row" value={b.seatsPerRow} min={1} onChange={(v) => updBlock(i, { seatsPerRow: v })} />
                      <Sel label="First row" value={rowsList[0] || 'A'} onChange={(v) => updBlock(i, { rowLabels: undefined, rows: rowsList.length, rowStart: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(v) })} options={'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')} />
                    </div>
                    <details className="text-xs"><summary className="cursor-pointer font-medium text-ink-700">Seats per row (curved / tapered sections)</summary>
                      <div className="mt-2 grid grid-cols-4 gap-1.5">{rowsList.map((r) => <Num key={r} label={`Row ${r}`} value={b.rowSeats?.[r] ?? ''} min={0} onChange={(v) => { const rs = { ...(b.rowSeats || {}) }; if (v === '') delete rs[r]; else rs[r] = v; updBlock(i, { rowSeats: Object.keys(rs).length ? rs : undefined }); }} />)}</div>
                      <button type="button" className="mt-1.5 text-brand-600" onClick={() => { const rs = {}; rowsList.forEach((r, k) => { rs[r] = Math.max(1, (Number(b.seatsPerRow) || 10) - (rowsList.length - 1 - k)); }); updBlock(i, { rowSeats: rs }); }}>Taper (front rows shorter)</button>
                    </details>
                    <ListInput label="Aisles after seat # (e.g. 4, 12)" value={(b.aisles || []).map(String)} parse={listNum} onCommit={(v) => updBlock(i, { aisles: v.length ? v : undefined })} />
                    <ListInput label="Removed seats (pillars, wheelchair space)" value={b.removed || []} placeholder="A1, A2, F10" onCommit={(v) => updBlock(i, { removed: v.length ? v : undefined })} />
                  </div>
                )}
                <div className="space-y-2 border-t border-ink-100 pt-3">
                  <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Shape</h4>
                    <select value={s.type || ''} onChange={(e) => { const t = e.target.value; const [ccx, ccy] = b.shape ? shapeCenter(b.shape) : [W / 2, H / 2]; const shapes = { rect: { type: 'rect', x: ccx - 80, y: ccy - 50, w: 160, h: 100, front: 'auto' }, circle: { type: 'circle', cx: ccx, cy: ccy, r: 50 }, polygon: { type: 'polygon', points: [[ccx - 80, ccy - 50], [ccx + 80, ccy - 50], [ccx + 100, ccy + 50], [ccx - 100, ccy + 50]] }, arc: { type: 'arc', cx: W / 2, cy: H / 2, rx1: 300, ry1: 230, rx2: 370, ry2: 285, a0: -100, a1: -80 } }; updBlock(i, { shape: t ? shapes[t] : undefined }); }} className="h-7 rounded-md border border-ink-100 px-1 text-xs" aria-label="Shape type"><option value="">None (row plan)</option><option value="rect">Rectangle</option><option value="arc">Ring segment</option><option value="circle">Circle</option><option value="polygon">Polygon</option></select></div>
                  {s.type === 'rect' && <div className="grid grid-cols-4 gap-1.5">{['x', 'y', 'w', 'h'].map((k) => <Num key={k} label={k} value={s[k]} onChange={(v) => updShape(i, { [k]: v })} />)}<Num label="rotate°" value={s.rotate || 0} onChange={(v) => updShape(i, { rotate: v || undefined })} /><div className="col-span-3"><Sel label="Row A faces" value={s.front || 'auto'} onChange={(v) => updShape(i, { front: v })} options={[['auto', 'Field / stage (auto)'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']]} /></div></div>}
                  {s.type === 'arc' && <div className="grid grid-cols-4 gap-1.5">{['cx', 'cy', 'a0', 'a1', 'rx1', 'ry1', 'rx2', 'ry2'].map((k) => <Num key={k} label={k} value={s[k]} onChange={(v) => updShape(i, { [k]: v })} />)}</div>}
                  {s.type === 'circle' && <div className="grid grid-cols-3 gap-1.5">{['cx', 'cy', 'r'].map((k) => <Num key={k} label={k} value={s[k]} onChange={(v) => updShape(i, { [k]: v })} />)}</div>}
                  {s.type === 'polygon' && <p className="text-xs text-ink-500">{s.points.length} points — drag the handles on the canvas.</p>}
                </div>
              </div>
            );
          })()}
          {tab === 'item' && selFeature && (() => {
            const f = selFeature; const i = sel.i;
            return (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Facility / label</h4>
                <div className="grid grid-cols-2 gap-2"><Sel label="Kind" value={f.kind} onChange={(v) => updFeature(i, { kind: v })} options={Object.keys(FEATURE_STYLE)} /><Txt label="Label" value={f.label} onChange={(v) => updFeature(i, { label: v })} /></div>
                <div className="grid grid-cols-4 gap-1.5">{['x', 'y', 'w', 'h'].map((k) => <Num key={k} label={k} value={f[k]} onChange={(v) => updFeature(i, { [k]: v })} />)}</div>
              </div>
            );
          })()}

          {tab === 'canvas' && (
            <div className="space-y-3">
              {!lockMeta && <div className="grid grid-cols-2 gap-2"><Txt label="Layout name" value={tpl.name} onChange={(v) => commit((t) => ({ ...t, name: v }))} /><Txt label="ID" value={tpl.id} onChange={(v) => commit((t) => ({ ...t, id: v.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} mono /></div>}
              {!lockMeta && <Sel label="Booking view type" value={tpl.viewType} onChange={(v) => commit((t) => ({ ...t, viewType: v }))} options={viewTypes.map((v) => [v.id, v.name])} />}
              <div className="grid grid-cols-3 gap-2"><Num label="Width" value={W} min={200} onChange={(v) => setSpec({ viewBox: [v || W, H] })} /><Num label="Height" value={H} min={200} onChange={(v) => setSpec({ viewBox: [W, v || H] })} /><Sel label="Background" value={spec.background || (tpl.viewType === 'open-field' ? 'grass' : 'none')} onChange={(v) => setSpec({ background: v })} options={['none', 'plain', 'dots', 'grass']} /></div>
              <div className="rounded-lg bg-ink-50 p-2.5">
                <Sel label="Field / focal point (row A faces this)" value={spec.field?.type || 'none'} onChange={(v) => { const d = { none: { type: 'none' }, oval: { type: 'oval', cx: W / 2, cy: H / 2, rx: W * 0.27, ry: H * 0.27 }, round: { type: 'round', cx: W / 2, cy: H / 2, r: Math.min(W, H) * 0.27 }, pitch: { type: 'pitch', x: W * 0.25, y: H * 0.25, w: W * 0.5, h: H * 0.5 }, court: { type: 'court', x: W * 0.32, y: H * 0.34, w: W * 0.36, h: H * 0.32 }, ring: { type: 'ring', cx: W / 2, cy: H / 2, size: 150 }, stage: { type: 'stage', x: W * 0.3, y: 30, w: W * 0.4, h: 70 }, screen: { type: 'screen', x: W * 0.2, y: H - 60, w: W * 0.6, h: 20 } }; setSpec({ field: { ...d[v], label: spec.field?.label } }); }} options={FIELD_TYPES} />
                {spec.field && spec.field.type !== 'none' && <div className="mt-2 grid grid-cols-4 gap-1.5">{Object.keys(spec.field).filter((k) => !['type', 'label'].includes(k)).map((k) => <Num key={k} label={k} value={spec.field[k]} onChange={(v) => setSpec((sp) => ({ field: { ...sp.field, [k]: v } }))} />)}<div className="col-span-4"><Txt label="Label" value={spec.field.label} onChange={(v) => setSpec((sp) => ({ field: { ...sp.field, label: v } }))} /></div></div>}
                {(spec.field?.type === 'oval' || spec.field?.type === 'round') && <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" className="accent-brand-500" checked={(spec.pitch?.w ?? (spec.field.type === 'oval' ? 26 : 0)) > 0} onChange={(e) => setSpec({ pitch: e.target.checked ? { w: 26, h: 110 } : { w: 0, h: 0 } })} />Cricket pitch strip</label>}
              </div>
              <Sel label="Row-plan stage position (for blocks without shapes)" value={spec.stage || 'top'} onChange={(v) => setSpec({ stage: v })} options={['top', 'bottom']} />
              <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Facilities ({spec.features.length})</h4><button type="button" onClick={() => { setSpec((sp) => ({ features: [...sp.features, { kind: 'gate', x: 20, y: 20, w: 100, h: 30, label: 'GATE' }] })); setSel({ kind: 'feature', i: spec.features.length }); setTab('item'); }} className="text-xs font-medium text-brand-600">+ Add</button></div>
              <div className="divide-y divide-ink-100 rounded-lg border border-ink-100">{spec.features.map((f, i) => <button key={i} type="button" onClick={() => { setSel({ kind: 'feature', i }); setTab('item'); }} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-ink-50"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: (FEATURE_STYLE[f.kind] || [])[0] }} /><span className="flex-1">{f.label}</span><span className="text-ink-500">{f.kind}</span></button>)}{!spec.features.length && <p className="px-2.5 py-2 text-xs text-ink-500">Stages, food courts, gates, washrooms…</p>}</div>
            </div>
          )}

          {tab === 'tiers' && (
            <div className="space-y-2">
              <p className="text-xs text-ink-500">Price categories. Merchants set the actual price per tier for each event.</p>
              {spec.tiers.map((t, k) => (
                <div key={k} className="flex items-end gap-1.5">
                  <label className="block"><span className="mb-0.5 block text-[11px] text-ink-500">Colour</span><input type="color" value={t.color} onChange={(e) => setSpec((sp) => ({ tiers: sp.tiers.map((x, j) => (j === k ? { ...x, color: e.target.value } : x)) }))} className="h-8 w-9 cursor-pointer rounded border border-ink-100" aria-label={`${t.name} colour`} /></label>
                  <div className="w-20"><Txt label="ID" mono value={t.id} onChange={(v) => { const id = v.toLowerCase().replace(/[^a-z0-9-]/g, ''); commit((tp) => { tp.spec.blocks.forEach((b) => { if (b.tier === t.id) b.tier = id; }); tp.spec.tiers[k].id = id; return tp; }); }} /></div>
                  <div className="flex-1"><Txt label="Name" value={t.name} onChange={(v) => setSpec((sp) => ({ tiers: sp.tiers.map((x, j) => (j === k ? { ...x, name: v } : x)) }))} /></div>
                  <button type="button" aria-label={`Remove ${t.name}`} disabled={spec.blocks.some((b) => b.tier === t.id)} title={spec.blocks.some((b) => b.tier === t.id) ? 'In use by blocks' : 'Remove'} onClick={() => setSpec((sp) => ({ tiers: sp.tiers.filter((_, j) => j !== k) }))} className="mb-0.5 flex h-8 w-8 items-center justify-center rounded-md text-ink-500 hover:bg-accent-50 hover:text-accent-600 disabled:opacity-30"><Icon name="X" size={15} /></button>
                </div>
              ))}
              <button type="button" onClick={() => setSpec((sp) => { let n = sp.tiers.length + 1; while (sp.tiers.some((t) => t.id === `tier${n}`)) n++; return { tiers: [...sp.tiers, { id: `tier${n}`, name: `Tier ${n}`, color: PALETTE[sp.tiers.length % PALETTE.length] }] }; })} className="btn-outline h-8 w-full text-xs"><Icon name="Plus" size={14} />Add tier</button>
            </div>
          )}

          {tab === 'gen' && <Generators spec={spec} onApply={(next) => { commit((t) => { t.spec = next; return t; }); setSel(null); }} />}

          {tab === 'json' && json !== null && (
            <div className="space-y-2">
              <textarea value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} className="h-[46vh] w-full rounded-lg border border-ink-100 bg-ink-50 p-2 font-mono text-[11px] outline-none focus:border-brand-400" aria-label="Layout JSON" />
              <button type="button" onClick={() => { try { const t = JSON.parse(json); if (!t.spec?.blocks) throw new Error('spec.blocks missing'); t.spec.features ||= []; t.spec.tiers ||= []; t.spec.viewBox ||= [1000, 700]; commit(t); setSel(null); setJsonErr(''); } catch (err) { setJsonErr(`Invalid JSON: ${err.message}`); } }} className="btn-dark h-9 w-full text-sm">Apply JSON</button>
              {jsonErr && <p className="text-xs text-accent-600">{jsonErr}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Generators({ spec, onApply }) {
  const [kind, setKind] = useState('stadium');
  const [st, setSt] = useState({ shape: 'oval', field: 'oval', fieldRx: 250, fieldRy: 190, gap: 2, openEnd: 0, rings: [{ name: 'Lower', prefix: 'L', tier: 'lower', blocks: 12, depth: 60, sell: 'seated', rows: 10, seats: 24, capacity: 500 }, { name: 'Upper', prefix: 'U', tier: 'upper', blocks: 8, depth: 50, sell: 'ga', rows: 8, seats: 30, capacity: 900 }] });
  const [hall, setHall] = useState({ sections: 3, rows: 14, seats: 12, balconyRows: 4, curve: true, screen: false });
  const [zones, setZones] = useState({ rows: 3, cols: 3, capacity: 400 });
  const [pending, setPending] = useState(null);
  const ring = (k, patch) => setSt({ ...st, rings: st.rings.map((r, j) => (j === k ? { ...r, ...patch } : r)) });
  const apply = (next) => { if (!spec.blocks.length) onApply(next); else setPending(next); };
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-ink-50 p-1 text-xs">{[['stadium', 'Stadium / arena'], ['hall', 'Hall / cinema'], ['zones', 'Zone grid']].map(([id, l]) => <button key={id} type="button" onClick={() => setKind(id)} className={cx('rounded-md px-2 py-1.5 font-medium', kind === id ? 'bg-white shadow-sm' : 'text-ink-500')}>{l}</button>)}</div>
      {kind === 'stadium' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2"><Sel label="Bowl shape" value={st.shape} onChange={(v) => setSt({ ...st, shape: v, field: v === 'circle' && st.field === 'oval' ? 'round' : st.field })} options={[['oval', 'Oval'], ['circle', 'Circle']]} /><Sel label="Centre" value={st.field} onChange={(v) => setSt({ ...st, field: v })} options={[['oval', 'Cricket oval'], ['round', 'Round ground'], ['pitch', 'Football pitch'], ['court', 'Court'], ['ring', 'Ring']]} /></div>
          <div className="grid grid-cols-4 gap-1.5"><Num label="Field rx" value={st.fieldRx} onChange={(v) => setSt({ ...st, fieldRx: v })} /><Num label="Field ry" value={st.fieldRy} onChange={(v) => setSt({ ...st, fieldRy: v })} /><Num label="Gap°" value={st.gap} onChange={(v) => setSt({ ...st, gap: v })} /><Num label="Open end°" value={st.openEnd} onChange={(v) => setSt({ ...st, openEnd: v })} /></div>
          {st.rings.map((r, k) => (
            <div key={k} className="rounded-lg border border-ink-100 p-2">
              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">Ring {k + 1} {k === 0 ? '(inner)' : ''}<button type="button" onClick={() => setSt({ ...st, rings: st.rings.filter((_, j) => j !== k) })} disabled={st.rings.length < 2} className="text-ink-500 hover:text-accent-600 disabled:opacity-30" aria-label="Remove ring"><Icon name="X" size={14} /></button></div>
              <div className="grid grid-cols-3 gap-1.5"><Txt label="Name" value={r.name} onChange={(v) => ring(k, { name: v })} /><Txt label="ID prefix" value={r.prefix} onChange={(v) => ring(k, { prefix: v.toUpperCase() })} /><Txt label="Tier id" value={r.tier} onChange={(v) => ring(k, { tier: v })} /><Num label="Blocks" value={r.blocks} min={1} onChange={(v) => ring(k, { blocks: v })} /><Num label="Depth" value={r.depth} onChange={(v) => ring(k, { depth: v })} /><Sel label="Sell" value={r.sell} onChange={(v) => ring(k, { sell: v })} options={[['seated', 'Seats'], ['ga', 'GA']]} />
                {r.sell === 'seated' ? <><Num label="Rows" value={r.rows} onChange={(v) => ring(k, { rows: v })} /><Num label="Seats/row" value={r.seats} onChange={(v) => ring(k, { seats: v })} /></> : <Num label="Capacity" value={r.capacity} onChange={(v) => ring(k, { capacity: v })} />}</div>
            </div>
          ))}
          <button type="button" onClick={() => setSt({ ...st, rings: [...st.rings, { name: `Ring ${st.rings.length + 1}`, prefix: String.fromCharCode(65 + st.rings.length), tier: `ring${st.rings.length + 1}`, blocks: 10, depth: 50, sell: 'ga', rows: 8, seats: 30, capacity: 800 }] })} className="text-xs font-medium text-brand-600">+ Add ring</button>
          <button type="button" onClick={() => apply(genStadium(st, spec))} className="btn-primary h-9 w-full text-sm"><Icon name="Sparkles" size={15} />Generate stadium</button>
        </div>
      )}
      {kind === 'hall' && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1.5"><Num label="Sections" value={hall.sections} min={1} onChange={(v) => setHall({ ...hall, sections: v })} /><Num label="Rows" value={hall.rows} min={2} onChange={(v) => setHall({ ...hall, rows: v })} /><Num label="Seats/row" value={hall.seats} min={1} onChange={(v) => setHall({ ...hall, seats: v })} /><Num label="Balcony rows" value={hall.balconyRows} min={0} onChange={(v) => setHall({ ...hall, balconyRows: v })} /></div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-brand-500" checked={hall.curve} onChange={(e) => setHall({ ...hall, curve: e.target.checked })} />Angle side sections towards the stage</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-brand-500" checked={hall.screen} onChange={(e) => setHall({ ...hall, screen: e.target.checked })} />Cinema screen instead of stage</label>
          <button type="button" onClick={() => apply(genHall(hall, spec))} className="btn-primary h-9 w-full text-sm"><Icon name="Sparkles" size={15} />Generate hall</button>
        </div>
      )}
      {kind === 'zones' && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1.5"><Num label="Rows" value={zones.rows} min={1} onChange={(v) => setZones({ ...zones, rows: v })} /><Num label="Columns" value={zones.cols} min={1} onChange={(v) => setZones({ ...zones, cols: v })} /><Num label="Capacity each" value={zones.capacity} min={1} onChange={(v) => setZones({ ...zones, capacity: v })} /></div>
          <button type="button" onClick={() => apply(genZones(zones, spec))} className="btn-primary h-9 w-full text-sm"><Icon name="Sparkles" size={15} />Generate open ground</button>
        </div>
      )}
      {pending && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Replace the current {spec.blocks.length} blocks and tiers? You can undo afterwards.
        <div className="mt-2 flex gap-2"><button type="button" onClick={() => { onApply(pending); setPending(null); }} className="btn-primary h-8 px-3 text-xs">Replace layout</button><button type="button" onClick={() => setPending(null)} className="btn-outline h-8 px-3 text-xs">Cancel</button></div></div>}
      <p className="text-xs text-ink-500">Generated layouts are a starting point — move, reshape and fine-tune every block afterwards.</p>
    </div>
  );
}
