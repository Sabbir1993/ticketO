'use client';
import { useState } from 'react';
import { fmtDate } from '@/lib/utils';

// Single-series column chart with hover tooltip. Brand color identifies the one series; text stays in ink tokens.
export default function BarChart({ data, valueKey = 'revenue', format = (v) => v, height = 220, label }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...data.map((d) => d[valueKey])) * 1.1 || 1;
  const W = 700; const H = height; const pad = { l: 44, r: 8, t: 12, b: 26 };
  const bw = (W - pad.l - pad.r) / data.length;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const short = (v) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}K` : Math.round(v));
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
        {ticks.map((t, i) => {
          const y = pad.t + (H - pad.t - pad.b) * (1 - t / max);
          return <g key={i}><line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="#eceef3" /><text x={pad.l - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#6b6d80">{short(t)}</text></g>;
        })}
        {data.map((d, i) => {
          const h = (H - pad.t - pad.b) * (d[valueKey] / max);
          const x = pad.l + i * bw + bw * 0.18; const w = bw * 0.64; const y = H - pad.b - h;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              <path d={`M${x},${H - pad.b} V${y + 4} Q${x},${y} ${x + 4},${y} H${x + w - 4} Q${x + w},${y} ${x + w},${y + 4} V${H - pad.b} Z`} fill={hover === i ? 'rgb(var(--brand-700))' : 'rgb(var(--brand-500))'} opacity={hover === null || hover === i ? 1 : 0.55} />
              {(i % 2 === 0 || data.length < 10) && <text x={pad.l + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="10.5" fill="#6b6d80">{fmtDate(d.date, { weekday: false })}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute -translate-x-1/2 rounded-lg bg-ink-900 px-3 py-2 text-xs text-white shadow-pop" style={{ left: `${((pad.l + hover * bw + bw / 2) / W) * 100}%`, top: 0 }}>
          <div className="text-white/70">{fmtDate(data[hover].date)}</div><div className="font-semibold">{format(data[hover][valueKey])}</div>
        </div>
      )}
    </div>
  );
}

export function HBars({ rows, format = (v) => v }) {
  const max = Math.max(...rows.map((r) => r.value)) || 1;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate text-ink-700">{r.label}</span><span className="font-medium tabular-nums">{format(r.value)}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
