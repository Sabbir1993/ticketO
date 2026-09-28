// Box-office POS: same seat maps as online, sells straight into the shared inventory.
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import Link from '@/components/Link';
import Logo from '@/components/Logo';
import Icon from '@/components/Icon';
import Modal from '@/components/Modal';
import QR from '@/components/QR';
import BookingView from '@/components/venue/BookingView';
import { Loading } from '@/components/States';
import { api } from '@/lib/api';
import { useApi, useStore } from '@/lib/store';
import { bdtPlain, cx, fmtDate, fmtTime } from '@/lib/utils';

const METHODS = [['cash', 'Cash', 'Banknote'], ['card', 'Card terminal', 'CreditCard'], ['bkash', 'bKash QR', 'Smartphone'], ['nagad', 'Nagad QR', 'Smartphone']];

export default function POS() {
  const { user, merchant, checked, toast } = useStore();
  const events = useApi(() => (user?.role === 'merchant' ? api.merchantEvents() : null), [user?.id]);
  const [eventId, setEventId] = useState('');
  const [showId, setShowId] = useState('');
  const avail = useApi(() => (showId ? api.getAvailability({ showId }) : null), [showId]);
  const [sel, setSel] = useState(null);
  const [method, setMethod] = useState('cash');
  const [tendered, setTendered] = useState('');
  const [phone, setPhone] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!checked) return <Loading />;
  if (!user || user.role !== 'merchant') return <Navigate to="/partner/login?next=/pos" replace />;
  const live = (events.data || []).filter((e) => e.status === 'published');
  const ev = live.find((e) => e.id === eventId);
  const total = sel ? sel.total : 0;
  const complete = async () => {
    if (method === 'cash' && Number(tendered || 0) < total) return toast('Cash tendered is less than the total', 'err');
    setBusy(true);
    try {
      const o = await api.posSale({ showId, seats: sel.seats, zones: sel.zones, method, phone });
      setReceipt({ ...o, tendered: Number(tendered || total) }); setSel(null); setTendered(''); setPhone(''); avail.reload();
    } catch (e) { toast(e.message, 'err'); avail.reload(); } finally { setBusy(false); }
  };
  const blockPrice = (id) => avail.data?.blocks.find((b) => b.id === id)?.price || 0;
  return (
    <div className="min-h-screen bg-ink-50">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 bg-ink-900 px-4 text-white">
        <Logo light href="/pos" /><span className="rounded bg-white/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider">Box office</span>
        <span className="hidden text-xs text-emerald-300 sm:inline">● Live inventory — shared with online sales</span>
        <div className="ml-auto flex items-center gap-2 text-sm"><span className="hidden text-white/70 md:inline">{merchant?.name}</span><Link href="/merchant" className="btn h-8 bg-white/10 px-3 text-xs hover:bg-white/20">Merchant portal</Link></div>
      </header>
      <div className="container-x py-5">
        <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1"><label className="label" htmlFor="pos-ev">Event</label><select id="pos-ev" className="input" value={eventId} onChange={(e) => { setEventId(e.target.value); setShowId(''); }}><option value="">Select event</option>{live.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select></div>
          {ev && <PosShows slug={ev.slug} showId={showId} setShowId={setShowId} />}
          {!live.length && !events.loading && <p className="text-sm text-ink-500">No live events. Publish one from the merchant portal.</p>}
        </div>
        {avail.loading && showId && <Loading />}
        {avail.data && <BookingView key={showId + (receipt?.id || '')} data={avail.data} mode="pos" proceedLabel="Charge" onProceed={(s) => setSel({ ...s, total: s.seats.reduce((a, x) => a + blockPrice(x.blockId), 0) + s.zones.reduce((a, z) => a + blockPrice(z.blockId) * z.qty, 0) })} />}
      </div>
      <Modal open={!!sel} onClose={() => setSel(null)} title={`Charge ${bdtPlain(total)}`}>
        {sel && (<div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">{METHODS.map(([k, l, i]) => <button key={k} onClick={() => setMethod(k)} className={cx('flex items-center gap-2 rounded-lg border p-3 text-sm font-medium', method === k ? 'border-brand-500 bg-brand-50' : 'border-ink-100')}><Icon name={i} size={16} />{l}</button>)}</div>
          {method === 'cash' && <div><label className="label" htmlFor="tend">Cash tendered</label><input id="tend" className="input text-lg" inputMode="numeric" value={tendered} onChange={(e) => setTendered(e.target.value.replace(/\D/g, ''))} />
            <div className="mt-2 flex flex-wrap gap-1.5">{[total, 500, 1000, 2000, 5000].filter((v, i, a) => v && a.indexOf(v) === i).map((v) => <button key={v} onClick={() => setTendered(String(v))} className="rounded border border-ink-100 px-2 py-1 text-xs">{bdtPlain(v)}</button>)}</div>
            {Number(tendered) >= total && <div className="mt-2 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">Change due: <b>{bdtPlain(Number(tendered) - total)}</b></div>}</div>}
          <div><label className="label" htmlFor="pos-ph">Customer mobile (optional — SMS e-ticket)</label><input id="pos-ph" className="input" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="01XXXXXXXXX" /></div>
          <button onClick={complete} disabled={busy} className="btn-primary h-12 w-full"><Icon name="Receipt" size={18} />{busy ? 'Processing…' : 'Complete sale'}</button>
        </div>)}
      </Modal>
      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Receipt">
        {receipt && (<>
          <div className="print-area font-mono text-xs">
            <div className="text-center"><b className="text-base">{merchant?.name?.toUpperCase()}</b><div>{receipt.venue?.name}</div><div>{fmtDate(receipt.createdAt)} {fmtTime(receipt.createdAt)}</div></div>
            <div className="my-2 border-t border-dashed border-ink-300" /><b>{receipt.event.title}</b><div>{fmtDate(receipt.showDate)} {fmtTime(receipt.showDate)}</div><div className="my-2 border-t border-dashed border-ink-300" />
            {receipt.items.map((i, k) => <div key={k} className="flex justify-between"><span>{i.blockName}{i.type === 'seat' ? ` ${i.seat}` : ` x${i.qty}`}</span><span>{bdtPlain(i.price * i.qty)}</span></div>)}
            <div className="my-2 border-t border-dashed border-ink-300" /><div className="flex justify-between font-bold"><span>TOTAL</span><span>{bdtPlain(receipt.amounts.total)}</span></div>
            {receipt.payment.method === 'cash' && <div className="flex justify-between"><span>Change</span><span>{bdtPlain(receipt.tendered - receipt.amounts.total)}</span></div>}
            <div className="mt-1">Booking {receipt.id}</div>
            <div className="mt-3 grid grid-cols-2 gap-3">{receipt.tickets.map((t) => <div key={t.code} className="text-center"><QR value={t.code} size={90} className="mx-auto" /><div className="mt-1 text-[10px]">{t.label}</div><div className="text-[10px]">{t.code}</div></div>)}</div>
          </div>
          <div className="no-print mt-4 flex gap-2"><button onClick={() => window.print()} className="btn-primary h-11 flex-1"><Icon name="Printer" size={17} />Print</button><button onClick={() => setReceipt(null)} className="btn-outline h-11 flex-1">New sale</button></div>
        </>)}
      </Modal>
    </div>
  );
}

function PosShows({ slug, showId, setShowId }) {
  const { data } = useApi(() => api.getEvent({ slug }), [slug]);
  if (!data) return null;
  return (
    <div className="min-w-[220px] flex-1"><label className="label" htmlFor="pos-show">Show</label>
      <select id="pos-show" className="input" value={showId} onChange={(e) => setShowId(e.target.value)}><option value="">Select show</option>{data.shows.slice(0, 40).map((s) => <option key={s.id} value={s.id}>{fmtDate(s.date)} · {fmtTime(s.date)}{data.venues.length > 1 ? ` · ${data.venues.find((v) => v.id === s.venueId)?.name}` : ''}</option>)}</select></div>
  );
}
