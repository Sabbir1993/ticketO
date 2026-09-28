import { blockRows, seatsInRow } from '@shared/geometry.mjs';
import { cx } from '@/lib/utils';

// Seat grid for one seated block. `selected` is a Set of seat ids in this block.
export default function SeatGrid({ block, aisles = [], sold = [], selected, onSeat, size = 26, disabled }) {
  const soldSet = new Set(sold);
  const rows = blockRows(block);
  const removed = new Set(block.removed || []);
  return (
    <div className="overflow-x-auto pb-1">
      <div className="mx-auto w-fit">
        {rows.map((r) => (
          <div key={r} className="flex items-center justify-center gap-1 py-[3px]">
            <span className="w-7 text-center text-[11px] text-ink-500">{r}</span>
            {Array.from({ length: seatsInRow(block, r) }, (_, i) => {
              const n = i + 1; const id = `${r}${n}`;
              if (removed.has(id)) return <span key={id} className={cx('flex', aisles.includes(i) && i > 0 && 'ml-4')} style={{ width: size, height: size }} />;
              const on = selected?.has(id); const taken = soldSet.has(id);
              return (
                <span key={id} className={cx('flex', aisles.includes(i) && i > 0 && 'ml-4')}>
                  <button type="button" disabled={taken || disabled} onClick={() => onSeat?.(r, n, id)} title={`${block.name} · ${id}`} aria-label={`Seat ${id}${taken ? ' sold' : on ? ' selected' : ''}`} aria-pressed={!!on}
                    style={{ width: size, height: size }}
                    className={cx('rounded-t-md rounded-b-sm border text-[10px] transition',
                      on ? 'border-brand-600 bg-brand-600 text-white' : taken ? 'cursor-not-allowed border-ink-100 bg-ink-100 text-transparent' : 'border-emerald-500 text-emerald-700 hover:bg-emerald-500 hover:text-white')}>{n}</button>
                </span>
              );
            })}
            <span className="w-7 text-center text-[11px] text-ink-500">{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SeatLegend() {
  return (
    <div className="flex justify-center gap-5 text-xs text-ink-500">
      <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded-sm border border-emerald-500" />Available</span>
      <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded-sm bg-brand-600" />Selected</span>
      <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded-sm bg-ink-100" />Sold</span>
    </div>
  );
}

// BookMyShow-style: pick the clicked seat + free neighbours to the right, up to `need`.
export function blockPick(block, soldArr, selectedSet, row, n, need) {
  const sold = new Set(soldArr); const out = [];
  const removed = new Set(block.removed || []);
  for (let i = n; i <= seatsInRow(block, row) && out.length < need; i++) { const id = `${row}${i}`; if (sold.has(id) || selectedSet.has(id) || removed.has(id)) break; out.push(id); }
  return out;
}
