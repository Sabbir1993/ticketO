import Poster from './Poster';
import { bdt, fmtDate, fmtTime } from '@/lib/utils';

export default function OrderSummary({ event, venue, showDate, items, pricing }) {
  const groups = {};
  items.forEach((it) => { const g = (groups[it.blockId] ||= { name: it.blockName, tier: it.tierName, seats: [], qty: 0, price: it.price }); if (it.type === 'seat') g.seats.push(it.seat); g.qty += it.qty; });
  return (
    <div className="card overflow-hidden">
      <div className="flex gap-3 p-4">
        <Poster event={event} className="h-24 w-16 shrink-0 rounded-md" showTitle={false} size="sm" />
        <div className="min-w-0 text-sm">
          <div className="text-base font-semibold">{event.title}</div>
          <div className="text-ink-500">{event.language}{event.certificate ? ` · ${event.certificate}` : ''}</div>
          <div className="mt-1 text-ink-700">{fmtDate(showDate)} · {fmtTime(showDate)}</div>
          <div className="text-ink-500">{venue?.name}</div>
        </div>
      </div>
      <div className="border-t border-dashed border-ink-100 px-4 py-3 text-sm">
        {Object.values(groups).map((g) => (
          <div key={g.name} className="flex justify-between gap-3 py-0.5"><span>{g.name}{g.seats.length ? ` — ${g.seats.join(', ')}` : ''} <span className="text-ink-500">× {g.qty}</span></span><span>{bdt(g.price * g.qty)}</span></div>
        ))}
        {pricing && (
          <div className="mt-3 space-y-1.5 border-t border-ink-100 pt-3">
            <div className="flex justify-between text-ink-500"><span>Sub-total</span><span>{bdt(pricing.subtotal)}</span></div>
            {pricing.discount > 0 && <div className="flex justify-between text-emerald-700"><span>Promo ({pricing.promo})</span><span>− {bdt(pricing.discount)}</span></div>}
            <div className="flex justify-between text-ink-500"><span>Convenience fee (incl. VAT)</span><span>{pricing.fee ? bdt(pricing.fee) : '৳0'}</span></div>
            <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-bold"><span>Amount payable</span><span>{pricing.total ? bdt(pricing.total) : '৳0'}</span></div>
          </div>
        )}
      </div>
    </div>
  );
}
