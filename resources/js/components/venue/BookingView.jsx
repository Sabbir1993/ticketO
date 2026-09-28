// The ticket-selection experience. Picks a view from the template's viewType:
//   map  (stadium-cricket / stadium-football / open-field) → click a block on the map → seat grid or quantity
//   rows (hall / cinema)                                    → full seat plan with stage / screen
//   list (ga-list)                                          → ticket categories with quantities
import { useEffect, useMemo, useState } from 'react';
import VenueMap, { TierLegend } from './VenueMap';
import SeatGrid, { SeatLegend, blockPick } from './SeatGrid';
import Icon from '../Icon';
import Modal from '../Modal';
import { useStore } from '@/lib/store';
import { bdt, cx } from '@/lib/utils';

// A layout is drawn as a map whenever every sellable block has a shape — so a hall or cinema
// drawn in the Layout designer also becomes a zoomable map. Shape-less halls fall back to rows.
function kindOf(viewType, spec) {
  if (viewType === 'ga-list') return 'list';
  const sellable = (spec?.blocks || []).filter((b) => b.sell !== 'none');
  if (sellable.length && sellable.every((b) => b.shape)) return 'map';
  if (sellable.some((b) => b.sell === 'seated')) return 'rows';
  return 'list';
}

function Stepper({ value, max, onChange, disabled }) {
  return (
    <div className="flex items-center overflow-hidden rounded-lg border border-brand-500 text-brand-500">
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} disabled={disabled || value <= 0} className="h-10 w-10 hover:bg-brand-50 disabled:opacity-40" aria-label="Decrease"><Icon name="Minus" size={16} className="mx-auto" /></button>
      <span className="w-9 text-center font-semibold tabular-nums">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={disabled || value >= max} className="h-10 w-10 hover:bg-brand-50 disabled:opacity-40" aria-label="Increase"><Icon name="Plus" size={16} className="mx-auto" /></button>
    </div>
  );
}

export default function BookingView({ data, onProceed, busy, mode = 'customer', proceedLabel }) {
  const { toast } = useStore();
  const { template, blocks, soldSeats, bookingLimit } = data;
  const spec = template.spec;
  const kind = kindOf(template.viewType, spec);
  const tiers = data.tiers;
  const [seats, setSeats] = useState({}); // key blockId:seat → true
  const [zones, setZones] = useState({}); // blockId → qty
  const [active, setActive] = useState(null); // block id (map view)
  const [seatModalId, setSeatModal] = useState(null);
  const [focus, setFocus] = useState(null); // seated block zoomed in on the map
  const [qty, setQty] = useState(kind === 'rows' ? 2 : null); // rows view: BMS-style "how many seats"

  const B = useMemo(() => Object.fromEntries(blocks.map((b) => [b.id, b])), [blocks]);
  const seatList = Object.keys(seats).map((k) => { const [blockId, seat] = k.split(':'); return { blockId, seat }; });
  const count = seatList.length + Object.values(zones).reduce((a, b) => a + b, 0);
  const total = seatList.reduce((a, s) => a + (B[s.blockId]?.price || 0), 0) + Object.entries(zones).reduce((a, [b, q]) => a + (B[b]?.price || 0) * q, 0);
  const cartByBlock = {}; seatList.forEach((s) => { cartByBlock[s.blockId] = (cartByBlock[s.blockId] || 0) + 1; }); Object.entries(zones).forEach(([b, q]) => { if (q) cartByBlock[b] = (cartByBlock[b] || 0) + q; });
  const left = bookingLimit - count;

  // Real-time: drop seats that became unavailable after a refresh.
  useEffect(() => {
    const lost = seatList.filter((s) => soldSeats[s.blockId]?.includes(s.seat));
    if (lost.length) { setSeats((cur) => { const n = { ...cur }; lost.forEach((s) => delete n[`${s.blockId}:${s.seat}`]); return n; }); toast(`${lost.map((s) => s.seat).join(', ')} just got booked by someone else`, 'err'); }
  }, [soldSeats]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSeat = (b, row, n, id) => {
    const key = `${b.id}:${id}`;
    if (seats[key]) { const nx = { ...seats }; delete nx[key]; return setSeats(nx); }
    if (kind === 'rows' && qty) {
      const selectedHere = new Set(seatList.filter((s) => s.blockId === b.id).map((s) => s.seat));
      const base = count >= qty ? {} : seats;
      const need = qty - Object.keys(base).length;
      const pick = blockPick(b, soldSeats[b.id] || [], count >= qty ? new Set() : selectedHere, row, n, need);
      const nx = { ...base }; pick.forEach((s) => { nx[`${b.id}:${s}`] = true; });
      return setSeats(nx);
    }
    if (left <= 0) return toast(`Maximum ${bookingLimit} tickets per order`, 'err');
    setSeats({ ...seats, [key]: true });
  };
  const setZone = (b, q) => {
    const others = count - (zones[b.id] || 0);
    if (others + q > bookingLimit) return toast(`Maximum ${bookingLimit} tickets per order`, 'err');
    if (b.tier && tiers.find((t) => t.id === b.tier)?.limit && q > tiers.find((t) => t.id === b.tier).limit) return toast(`Max ${tiers.find((t) => t.id === b.tier).limit} × ${b.tierName}`, 'err');
    setZones({ ...zones, [b.id]: q });
  };
  const proceed = () => {
    if (kind === 'rows' && qty && seatList.length && seatList.length !== qty) return toast(`Select ${qty - seatList.length} more seat(s)`, 'err');
    onProceed({ seats: seatList, zones: Object.entries(zones).filter(([, q]) => q > 0).map(([blockId, q]) => ({ blockId, qty: q })) });
  };
  const clear = () => { setSeats({}); setZones({}); };
  const ab = active ? B[active] : null;

  const summary = (
    <div className="space-y-2 text-sm">
      {Object.entries(cartByBlock).map(([bid, n]) => (
        <div key={bid} className="flex items-center justify-between gap-2">
          <div className="min-w-0"><div className="truncate font-medium">{B[bid]?.name}</div><div className="truncate text-xs text-ink-500">{B[bid]?.sell === 'seated' ? seatList.filter((s) => s.blockId === bid).map((s) => s.seat).join(', ') : `${n} × ${bdt(B[bid]?.price)}`}</div></div>
          <span className="shrink-0 font-medium">{bdt((B[bid]?.price || 0) * n)}</span>
        </div>
      ))}
      {!count && <p className="text-ink-500">{kind === 'map' ? 'Tap a block on the map to choose seats or passes.' : 'Nothing selected yet.'}</p>}
    </div>
  );

  return (
    <div className="pb-28">
      {kind === 'map' && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="card min-w-0 p-3 sm:p-5">
            {focus && B[focus] && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <button onClick={() => setFocus(null)} className="btn-outline h-9 px-3 text-sm"><Icon name="ArrowLeft" size={16} />All blocks</button>
                <span className="text-sm text-ink-500"><b className="text-ink-900">{B[focus].name}</b> · row {(B[focus].rowLabels || ['A'])[0]} faces the {spec.field?.type === 'stage' || template.viewType === 'open-field' || template.viewType === 'hall' || template.viewType === 'cinema' ? 'stage' : 'field'}</span>
                <button onClick={() => setSeatModal(focus)} className="text-sm font-medium text-brand-600 hover:underline">List view</button>
              </div>
            )}
            <VenueMap viewType={template.viewType} spec={spec} blocks={blocks} selectedId={active} cart={cartByBlock} focusId={focus} soldSeats={soldSeats}
              selectedSeats={focus ? new Set(seatList.filter((s) => s.blockId === focus).map((s) => s.seat)) : undefined}
              onSeat={(b, r, n, id) => toggleSeat(b, r, n, id)}
              onSelect={(b) => { setActive(b.id); if (b.sell === 'seated') setFocus(b.id); }} />
            <div className="mt-4 border-t border-ink-100 pt-3">{focus ? <SeatLegend /> : <TierLegend tiers={tiers} blocks={blocks} />}</div>
          </div>
          <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
            <div className="card p-5">
              {ab ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div><div className="text-xs font-semibold uppercase tracking-wider" style={{ color: ab.color }}>{ab.tierName}</div><h3 className="text-lg font-bold">{ab.name}</h3><p className="text-sm text-ink-500">{ab.level ? `${ab.level} · ` : ''}{ab.sell === 'ga' ? 'Free seating / standing' : `${(ab.rowLabels || []).length || ab.rows} rows · numbered seats`}</p></div>
                    <div className="text-right"><div className="text-lg font-bold">{bdt(ab.price)}</div>{ab.earlyBird && <div className="text-xs text-ink-500 line-through">{bdt(ab.original)}</div>}</div>
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-sm"><span className="text-ink-500">Available</span><b className={cx(ab.available < ab.capacity * 0.15 && 'text-brand-600')}>{ab.available} / {ab.capacity}</b></div>
                  {ab.sell === 'ga' ? (
                    <div className="mt-4 flex items-center justify-between"><span className="text-sm font-medium">Tickets</span><Stepper value={zones[ab.id] || 0} max={Math.min(ab.available, (zones[ab.id] || 0) + left)} onChange={(q) => setZone(ab, q)} /></div>
                  ) : (
                    focus === ab.id
                      ? <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700"><Icon name="MousePointerClick" size={15} className="mr-1 inline" />Tap seats on the map · {left} more allowed</p>
                      : <button onClick={() => setFocus(ab.id)} className="btn-dark mt-4 h-11 w-full"><Icon name="Armchair" size={17} />Choose seats in {ab.id}</button>
                  )}
                </>
              ) : (
                <div className="text-sm text-ink-500"><Icon name="Map" className="mb-2 text-ink-300" />Select a stand, block or zone on the map. Colours show the price category; paler blocks are filling up.</div>
              )}
            </div>
            <div className="card p-5"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Your selection</h3>{count > 0 && <button onClick={clear} className="text-xs text-ink-500 hover:text-brand-600">Clear</button>}</div>{summary}</div>
          </aside>
        </div>
      )}

      {kind === 'rows' && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-center gap-2 border-b border-ink-100 bg-ink-50 px-4 py-3 text-sm">
            How many seats?
            {Array.from({ length: bookingLimit }, (_, i) => i + 1).map((n) => <button key={n} onClick={() => { setQty(n); setSeats({}); }} className={cx('h-8 w-8 rounded-full', n === qty ? 'bg-brand-500 text-white' : 'bg-white hover:bg-ink-100')}>{n}</button>)}
          </div>
          <div className="overflow-x-auto px-4 py-6">
            <div className="mx-auto w-fit min-w-full">
              {spec.stage === 'top' && <div className="mx-auto mb-8 max-w-xl text-center"><div className="h-9 rounded-b-[45%] bg-gradient-to-b from-ink-300 to-ink-100" /><div className="mt-1 text-xs tracking-[.3em] text-ink-500">{spec.stageLabel || 'STAGE'}</div></div>}
              {[...new Set(blocks.map((b) => b.level || ''))].map((level) => (
                <div key={level} className={cx(level && level !== 'Ground floor' && 'mt-6 rounded-2xl border border-dashed border-ink-300 pt-3')}>
                  {level && level !== 'Ground floor' && <div className="mb-2 text-center text-xs font-semibold uppercase tracking-widest text-ink-500">{level}</div>}
                  {blocks.filter((b) => (b.level || '') === level).map((b) => (
                    <div key={b.id} className={cx('mb-4', !b.enabled && 'opacity-40')}>
                      <div className="mb-2 flex items-center justify-center gap-2 border-b border-ink-100 pb-1 text-xs uppercase tracking-wide text-ink-500"><span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />{b.name} — {b.enabled ? bdt(b.price) : 'not on sale'}</div>
                      <SeatGrid block={b} aisles={b.aisles || spec.aisles || []} sold={soldSeats[b.id] || []} selected={new Set(seatList.filter((s) => s.blockId === b.id).map((s) => s.seat))} onSeat={(r, n, id) => toggleSeat(b, r, n, id)} disabled={!b.enabled} />
                    </div>
                  ))}
                </div>
              ))}
              {spec.stage === 'bottom' && <div className="mx-auto mt-8 max-w-xl text-center"><div className="h-3 rounded-[50%] border-t-4 border-sky-300/70" /><div className="mt-1 text-xs text-ink-500">{spec.stageLabel || 'Screen'}</div></div>}
              <div className="mt-6"><SeatLegend /></div>
            </div>
          </div>
        </div>
      )}

      {kind === 'list' && (
        <div className="mx-auto max-w-3xl space-y-3">
          {blocks.filter((b) => b.sell !== 'none').map((b) => {
            const t = tiers.find((x) => x.id === b.tier);
            return (
              <div key={b.id} className={cx('card flex items-center gap-4 p-5', (!b.enabled || !b.available) && 'opacity-60')}>
                <span className="h-12 w-1.5 shrink-0 rounded-full" style={{ background: b.color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><b className="text-lg">{t?.name || b.name}</b>{b.earlyBird && <span className="badge bg-amber-100 text-amber-700">Early bird</span>}{b.enabled && b.available > 0 && b.available < b.capacity * 0.15 && <span className="badge bg-brand-50 text-brand-600">{b.available} left</span>}</div>
                  <div className="mt-1 font-semibold">{b.enabled ? bdt(b.price) : '—'} {b.earlyBird && <span className="text-sm font-normal text-ink-500 line-through">{bdt(b.original)}</span>}</div>
                </div>
                {!b.enabled ? <span className="rounded-lg bg-ink-100 px-3 py-2 text-sm text-ink-500">Not on sale</span> : !b.available ? <span className="rounded-lg bg-ink-100 px-3 py-2 text-sm font-medium text-ink-500">Sold out</span>
                  : (zones[b.id] || 0) === 0 ? <button onClick={() => setZone(b, 1)} className="btn-outline h-10 border-brand-500 px-6 text-brand-500">Add</button>
                  : <Stepper value={zones[b.id]} max={Math.min(b.available, zones[b.id] + left)} onChange={(q) => setZone(b, q)} />}
              </div>
            );
          })}
        </div>
      )}

      {seatModalId && B[seatModalId] && (() => {
        const block = B[seatModalId];
        const selectedHere = new Set(seatList.filter((s) => s.blockId === block.id).map((s) => s.seat));
        return (
          <Modal open onClose={() => setSeatModal(null)} wide="xl" title={`${block.name} · ${bdt(block.price)} per seat`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="flex items-center gap-2 text-ink-500"><Icon name="ChevronUp" size={16} />{template.viewType === 'open-field' ? 'Stage' : 'Field'} this way · row {(block.rowLabels || ['A'])[0]} is closest</span><span>{selectedHere.size} selected · {left} more allowed</span></div>
            <SeatGrid block={block} sold={soldSeats[block.id] || []} selected={selectedHere} onSeat={(r, n, id) => toggleSeat(block, r, n, id)} size={24} aisles={block.aisles || []} />
            <div className="mt-4"><SeatLegend /></div>
            <button onClick={() => setSeatModal(null)} className="btn-primary mt-5 h-11 w-full">Done</button>
          </Modal>
        );
      })()}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-white/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="container-x flex items-center justify-between gap-4 py-3">
          <div className="min-w-0"><div className="text-lg font-bold">{bdt(total)}</div><div className="truncate text-sm text-ink-500">{count} ticket{count === 1 ? '' : 's'}{count ? ` · max ${bookingLimit}` : ''}</div></div>
          <button onClick={proceed} disabled={!count || busy} className="btn-primary h-12 min-w-[180px] px-8 text-base">{busy ? 'Reserving…' : proceedLabel || (mode === 'pos' ? 'Continue to payment' : 'Proceed')}</button>
        </div>
      </div>
    </div>
  );

}
