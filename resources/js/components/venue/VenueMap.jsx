// Generic SVG venue renderer — everything comes from the layout JSON, so a new stadium,
// arena, hall or ground needs no code:
//   spec.background  'grass' | 'plain' | 'dots' | 'none'
//   spec.field       { type: 'oval' | 'round' | 'pitch' | 'court' | 'ring' | 'stage' | 'screen' | 'none', … }
//   spec.features    [{ kind: stage|food|gate|wc|medical|tech|bar|text, x, y, w, h, label }]
//   spec.blocks[].shape  rect (rotate) | arc | polygon | circle   (see shared/geometry.js)
// With `focusId` the map zooms into that block and draws every seat (from seatPositions).
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { shapePath, shapeCenter, shapeBBox, seatPositions } from '@shared/geometry.mjs';
import { bdt, cx } from '@/lib/utils';

export const FIELD_TYPES = ['none', 'oval', 'round', 'pitch', 'court', 'ring', 'stage', 'screen'];
export const FEATURE_STYLE = { stage: ['#0F172A', '#fff'], screen: ['#cbd5e1', '#0F172A'], food: ['#fde68a', '#78350f'], bar: ['#fbcfe8', '#831843'], gate: ['#1E3A8A', '#fff'], wc: ['#dbeafe', '#1e3a8a'], medical: ['#fee2e2', '#991b1b'], tech: ['#cbd5e1', '#0F172A'], text: ['transparent', '#64748B'] };

export function MapDefs({ uid }) {
  return (
    <defs>
      <pattern id={`${uid}-grass`} width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(90)"><rect width="40" height="40" fill="#3f9b4b" /><rect width="20" height="40" fill="#46a653" /></pattern>
      <pattern id={`${uid}-grass-v`} width="50" height="50" patternUnits="userSpaceOnUse"><rect width="50" height="50" fill="#3f9b4b" /><rect width="25" height="50" fill="#46a653" /></pattern>
      <pattern id={`${uid}-wood`} width="60" height="14" patternUnits="userSpaceOnUse"><rect width="60" height="14" fill="#d9a066" /><rect width="60" height="1" fill="#c4874b" /><rect x="30" width="1" height="14" fill="#c4874b" /></pattern>
      <pattern id={`${uid}-hatch`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#e5e7eb" /><rect width="3" height="8" fill="#cbd0d8" /></pattern>
      <pattern id={`${uid}-dots`} width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="#c9d4bd" /></pattern>
      <pattern id={`${uid}-grid`} width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#cbd5e1" /></pattern>
    </defs>
  );
}

const label = (t, x, y, size = 14, extra = {}) => <text x={x} y={y} textAnchor="middle" fontSize={size} fontWeight="700" fill="#fff" opacity=".85" letterSpacing="4" pointerEvents="none" {...extra}>{String(t).toUpperCase()}</text>;

export function Background({ spec, uid, viewType }) {
  const [W, H] = spec.viewBox || [1000, 700];
  const bg = spec.background || (viewType === 'open-field' ? 'grass' : 'none');
  if (bg === 'none') return null;
  if (bg === 'plain') return <rect width={W} height={H} rx="18" fill="#F1F5F9" />;
  if (bg === 'dots') return <g><rect width={W} height={H} rx="18" fill="#F8FAFC" /><rect width={W} height={H} rx="18" fill={`url(#${uid}-grid)`} /></g>;
  return <g><rect width={W} height={H} rx="18" fill="#eef3e6" /><rect width={W} height={H} rx="18" fill={`url(#${uid}-dots)`} /></g>;
}

export function Field({ spec, uid }) {
  const f = spec.field; if (!f || f.type === 'none') return null;
  if (f.type === 'oval' || f.type === 'round') {
    const { cx: x, cy: y } = f; const rx = f.rx ?? f.r; const ry = f.ry ?? f.r;
    const pw = spec.pitch?.w ?? (f.type === 'oval' ? 26 : 0); const ph = spec.pitch?.h ?? 110;
    return (
      <g pointerEvents="none">
        <ellipse cx={x} cy={y} rx={rx + 22} ry={ry + 18} fill="#dfe5dc" />
        <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={`url(#${uid}-grass)`} />
        <ellipse cx={x} cy={y} rx={rx - 10} ry={ry - 8} fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth="2" />
        {f.type === 'oval' && <ellipse cx={x} cy={y} rx={rx * 0.5} ry={ry * 0.52} fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="1.5" strokeDasharray="6 6" />}
        {pw > 0 && <><rect x={x - pw / 2} y={y - ph / 2} width={pw} height={ph} rx="2" fill="#d9c79a" />
          <line x1={x - pw / 2 - 4} x2={x + pw / 2 + 4} y1={y - ph / 2 + 12} y2={y - ph / 2 + 12} stroke="#fff" strokeWidth="1.5" />
          <line x1={x - pw / 2 - 4} x2={x + pw / 2 + 4} y1={y + ph / 2 - 12} y2={y + ph / 2 - 12} stroke="#fff" strokeWidth="1.5" /></>}
        {label(f.label || 'Ground', x, y + ry * 0.75, 15)}
      </g>
    );
  }
  if (f.type === 'pitch' || f.type === 'court') {
    const { x, y, w, h } = f; const mid = x + w / 2; const court = f.type === 'court';
    const bw = Math.min(80, w * 0.16); const bh = Math.min(180, h * 0.52);
    const box = (left) => { const bx = left ? x : x + w - bw; return <g><rect x={bx} y={y + h / 2 - bh / 2} width={bw} height={bh} fill="none" stroke="#fff" strokeWidth="2" />{!court && <><rect x={left ? x : x + w - bw * 0.38} y={y + h / 2 - bh * 0.23} width={bw * 0.38} height={bh * 0.46} fill="none" stroke="#fff" strokeWidth="2" /><rect x={left ? x - 8 : x + w} y={y + h / 2 - bh * 0.12} width="8" height={bh * 0.24} fill="#fff" opacity=".9" /></>}</g>; };
    return (
      <g pointerEvents="none">
        <rect x={x - 18} y={y - 18} width={w + 36} height={h + 36} rx="8" fill={court ? '#e2e8f0' : '#dfe5dc'} />
        <rect x={x} y={y} width={w} height={h} fill={court ? `url(#${uid}-wood)` : `url(#${uid}-grass-v)`} />
        <rect x={x} y={y} width={w} height={h} fill="none" stroke="#fff" strokeWidth="2.5" />
        <line x1={mid} x2={mid} y1={y} y2={y + h} stroke="#fff" strokeWidth="2" />
        <circle cx={mid} cy={y + h / 2} r={Math.min(52, h * 0.15)} fill="none" stroke="#fff" strokeWidth="2" />
        {box(true)}{box(false)}
        {label(f.label || (court ? 'Court' : 'Pitch'), mid, y + h - 16)}
      </g>
    );
  }
  if (f.type === 'ring') {
    const s = f.size || 140; const x = f.cx - s / 2; const y = f.cy - s / 2;
    return (
      <g pointerEvents="none">
        <rect x={x - 14} y={y - 14} width={s + 28} height={s + 28} rx="4" fill="#0F172A" />
        <rect x={x} y={y} width={s} height={s} fill="#e2e8f0" />
        {[0, 6, 12].map((d) => <rect key={d} x={x + d} y={y + d} width={s - 2 * d} height={s - 2 * d} fill="none" stroke="rgb(var(--accent-500))" strokeWidth="1.8" />)}
        {[[x, y], [x + s, y], [x, y + s], [x + s, y + s]].map(([a, b], i) => <circle key={i} cx={a} cy={b} r="5" fill={i % 3 ? 'rgb(var(--brand-500))' : 'rgb(var(--accent-500))'} />)}
        {label(f.label || 'Ring', f.cx, f.cy + 5, 13, { fill: '#0F172A', opacity: 0.55 })}
      </g>
    );
  }
  if (f.type === 'stage') return <g pointerEvents="none"><rect x={f.x} y={f.y} width={f.w} height={f.h} rx="10" fill="#0F172A" />{label(f.label || 'Stage', f.x + f.w / 2, f.y + f.h / 2 + 6, 18)}</g>;
  if (f.type === 'screen') return <g pointerEvents="none"><path d={`M${f.x},${f.y + f.h} Q${f.x + f.w / 2},${f.y - f.h} ${f.x + f.w},${f.y + f.h}`} fill="none" stroke="#7dd3fc" strokeWidth="6" strokeLinecap="round" />{label(f.label || 'Screen', f.x + f.w / 2, f.y + f.h + 22, 12, { fill: '#64748B' })}</g>;
  return null;
}

export function Features({ spec }) {
  return (spec.features || []).map((ft, i) => {
    const st = FEATURE_STYLE[ft.kind] || ['#e2e8f0', '#0F172A'];
    const big = ft.kind === 'stage';
    return (
      <g key={i} pointerEvents="none">
        <rect x={ft.x} y={ft.y} width={ft.w} height={ft.h} rx={big ? 10 : 6} fill={st[0]} />
        <text x={ft.x + ft.w / 2} y={ft.y + ft.h / 2 + (big ? 7 : 4)} textAnchor="middle" fontSize={big ? 20 : 12} fontWeight="700" fill={st[1]} letterSpacing={big ? 3 : 0.5} style={ft.h > ft.w * 1.4 ? { writingMode: 'vertical-rl' } : undefined}>{ft.label}</text>
      </g>
    );
  });
}

export function ShapeEl({ s, ...rest }) {
  if (!s) return null;
  if (s.type === 'rect' && !s.rotate) return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={Math.min(8, s.w / 4, s.h / 4)} {...rest} />;
  if (s.type === 'circle') return <circle cx={s.cx} cy={s.cy} r={s.r} {...rest} />;
  return <path d={shapePath(s)} strokeLinejoin="round" {...rest} />;
}

function useTween(target) {
  const [vb, setVb] = useState(target); const cur = useRef(target); const key = target.join(',');
  useEffect(() => {
    const from = cur.current; const to = target; const t0 = performance.now(); let raf;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const step = (t) => { const k = reduce ? 1 : Math.min(1, (t - t0) / 380); const e = 1 - (1 - k) ** 3; const v = from.map((a, i) => a + (to[i] - a) * e); cur.current = v; setVb(v); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return vb;
}

export default function VenueMap({ viewType, spec, blocks, selectedId, onSelect, cart = {}, className, mode = 'book', focusId, soldSeats = {}, selectedSeats, onSeat }) {
  const uid = useId().replace(/:/g, '');
  const [hover, setHover] = useState(null);
  const [hoverSeat, setHoverSeat] = useState(null);
  const [W, H] = spec.viewBox || [1000, 700];
  const list = blocks || spec.blocks;
  const B = useMemo(() => Object.fromEntries(list.map((b) => [b.id, b])), [list]);
  const fb = focusId && B[focusId]?.shape ? B[focusId] : null;
  const seats = useMemo(() => (fb ? seatPositions(fb, spec) : []), [fb, spec]);
  const target = useMemo(() => {
    if (!fb) return [0, 0, W, H];
    const bb = shapeBBox(fb.shape); const pad = Math.max(bb.w, bb.h) * 0.12 + 12;
    let w = bb.w + pad * 2; let h = bb.h + pad * 2; const r = W / H;
    if (w / h > r) h = w / r; else w = h * r;
    return [bb.x + bb.w / 2 - w / 2, bb.y + bb.h / 2 - h / 2, w, h];
  }, [fb, W, H]);
  const vb = useTween(target);
  const hb = hover && B[hover];
  const soldSet = new Set(fb ? soldSeats[fb.id] || [] : []);

  return (
    <div className={cx('relative', className)}>
      <svg viewBox={vb.map((v) => v.toFixed(2)).join(' ')} className="h-auto w-full select-none" role="img" aria-label={fb ? `Seat map, ${fb.name}` : 'Venue map'} style={{ aspectRatio: `${W} / ${H}` }}>
        <MapDefs uid={uid} />
        <Background spec={spec} uid={uid} viewType={viewType} />
        <Field spec={spec} uid={uid} />
        <Features spec={spec} />
        {list.map((b) => {
          const s = b.shape; if (!s) return null;
          const disabled = b.enabled === false || b.sell === 'none';
          const soldOut = !disabled && b.available === 0;
          const sel = selectedId === b.id; const inCart = cart[b.id];
          const ratio = b.capacity ? (b.available ?? b.capacity) / b.capacity : 1;
          const clickable = mode === 'edit' ? b.sell !== 'none' : mode === 'preview' ? false : !disabled && !soldOut && !fb;
          const dim = fb && fb.id !== b.id;
          const [lx, ly] = shapeCenter(s); const bb = shapeBBox(s);
          const big = bb.w >= 130 && bb.h >= 56;
          return (
            <g key={b.id} opacity={dim ? 0.25 : 1} style={{ transition: 'opacity .3s' }}>
              <ShapeEl s={s} fill={disabled || soldOut ? `url(#${uid}-hatch)` : b.color || '#94a3b8'} fillOpacity={fb?.id === b.id ? 0.14 : disabled || soldOut ? 1 : 0.55 + ratio * 0.45}
                stroke={sel || inCart ? '#0F172A' : '#fff'} strokeWidth={fb ? 1 : sel ? 4 : inCart ? 3 : 2}
                className={cx('transition-[fill-opacity,stroke-width] duration-150', clickable ? 'vm-block cursor-pointer' : !fb && mode === 'book' && 'cursor-not-allowed')}
                onMouseEnter={() => setHover(b.id)} onMouseLeave={() => setHover(null)} onClick={() => clickable && onSelect?.(b)}
                role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}
                aria-label={`${b.name}${b.price != null ? `, ${bdt(b.price)}` : ''}${disabled ? ', not on sale' : soldOut ? ', sold out' : `, ${b.available ?? b.capacity} available`}`}
                onKeyDown={(e) => { if (clickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect?.(b); } }} />
              {!fb && <>
                <text x={lx} y={ly + (big ? -4 : 4)} textAnchor="middle" fontSize={big ? 14 : 12} fontWeight="700" fill={disabled || soldOut ? '#64748B' : '#fff'} pointerEvents="none" style={{ paintOrder: 'stroke', stroke: disabled || soldOut ? 'none' : 'rgba(0,0,0,.25)', strokeWidth: 3 }}>{big ? b.name : b.id}</text>
                {big && b.price != null && !disabled && <text x={lx} y={ly + 14} textAnchor="middle" fontSize="12" fontWeight="600" fill="#fff" pointerEvents="none" style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,.25)', strokeWidth: 3 }}>{soldOut ? 'SOLD OUT' : bdt(b.price)}</text>}
                {inCart ? <g pointerEvents="none"><circle cx={lx} cy={ly - (big ? 28 : 20)} r="11" fill="#0F172A" /><text x={lx} y={ly - (big ? 24 : 16)} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">{inCart}</text></g> : null}
              </>}
            </g>
          );
        })}
        {fb && seats.map((p) => {
          if (p.gap) return null;
          const taken = soldSet.has(p.id); const on = selectedSeats?.has(p.id);
          return (
            <circle key={p.id} cx={p.x} cy={p.y} r={p.r} data-seat={p.id}
              fill={on ? 'rgb(var(--brand-600))' : taken ? '#CBD5E1' : '#fff'} stroke={on ? 'rgb(var(--brand-800))' : taken ? '#CBD5E1' : fb.color || '#10b981'} strokeWidth={p.r * 0.32}
              className={taken ? 'cursor-not-allowed' : 'cursor-pointer'} role="button" aria-label={`Seat ${p.id}${taken ? ' sold' : on ? ' selected' : ''}`} aria-pressed={!!on}
              onMouseEnter={() => setHoverSeat(p.id)} onMouseLeave={() => setHoverSeat(null)} onClick={() => !taken && onSeat?.(fb, p.row, p.n, p.id)} />
          );
        })}
        {fb && (() => { const rows = {}; seats.forEach((p) => { (rows[p.row] ||= []).push(p); }); return Object.entries(rows).map(([r, ps]) => { const a = ps[0]; const b = ps[1] || { x: a.x + 1, y: a.y }; const d = Math.hypot(b.x - a.x, b.y - a.y) || 1; const k = (a.r * 2.4) / d; return <text key={r} x={a.x - (b.x - a.x) * k} y={a.y - (b.y - a.y) * k + a.r * 0.45} textAnchor="middle" fontSize={a.r * 1.3} fontWeight="600" fill="#64748B" pointerEvents="none">{r}</text>; }); })()}
        {!fb && (spec.gates || []).map((g) => <text key={g.label} x={g.x} y={g.y} textAnchor="middle" fontSize="12" fontWeight="600" fill="#64748B">{g.label}</text>)}
      </svg>
      {fb && hoverSeat && <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-ink-900/95 px-3 py-1.5 text-xs font-semibold text-white">{fb.name} · Seat {hoverSeat}{fb.price != null && ` · ${bdt(fb.price)}`}</div>}
      {!fb && hb && (
        <div className="pointer-events-none absolute left-3 top-3 max-w-[240px] rounded-xl bg-ink-900/95 px-3 py-2 text-xs text-white shadow-pop">
          <div className="font-semibold">{hb.name}</div>
          <div className="text-white/70">{hb.tierName || hb.tier}{hb.level ? ` · ${hb.level}` : ''}</div>
          {hb.sell === 'none' || hb.enabled === false ? <div className="mt-1 text-white/70">Not on sale</div> : (
            <div className="mt-1 flex gap-3"><span className="font-semibold">{hb.price != null ? bdt(hb.price) : '—'}</span><span className="text-white/70">{hb.available ?? hb.capacity} {hb.sell === 'ga' ? 'spots' : 'seats'} left</span></div>
          )}
          {hb.sell === 'ga' && hb.enabled !== false && <div className="text-white/60">Free seating / standing</div>}
        </div>
      )}
    </div>
  );
}

export function TierLegend({ tiers = [], blocks = [] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-700">
      {tiers.filter((t) => t && blocks.some((b) => b.tier === t.id && b.enabled !== false)).map((t) => (
        <span key={t.id} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: t.color }} />{t.name}{t.price != null && <b className="font-semibold">{bdt(t.price)}</b>}</span>
      ))}
      <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: 'repeating-linear-gradient(45deg,#e5e7eb 0 3px,#cbd0d8 3px 6px)' }} />Sold out / not on sale</span>
    </div>
  );
}
