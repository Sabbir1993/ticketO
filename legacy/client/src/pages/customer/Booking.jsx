import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import Link from '@/components/Link';
import Icon from '@/components/Icon';
import QR from '@/components/QR';
import Poster from '@/components/Poster';
import { Loading, ErrorState } from '@/components/States';
import { api } from '@/lib/api';
import { useApi, useStore } from '@/lib/store';
import { downloadIcs, downloadTicketPdf } from '@/lib/ticketPdf';
import { bdt, cx, fmtDate, fmtTime, STATUS_LABEL } from '@/lib/utils';

export default function Booking() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const { toast, prefs, setPrefs, earnPoints } = useStore();
  const { data: o, error, loading, reload } = useApi(() => api.getOrder({ orderId: id }), [id]);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { // loyalty points (client-side demo)
    if (o?.status === 'paid' && !(prefs.awarded || []).includes(o.id)) { earnPoints(Math.floor(o.amounts.total / 100)); setPrefs((p) => ({ awarded: [...(p.awarded || []), o.id] })); }
  }, [o?.status]); // eslint-disable-line
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (o.status === 'pending_payment') return <div className="container-x py-16 text-center"><p className="text-lg font-medium">Payment not completed yet</p><Link href={`/payment/${o.id}`} className="btn-primary mt-4 h-11 px-6">Complete payment</Link></div>;
  const e = o.event; const t = o.tickets[idx] || {}; const voided = o.status !== 'paid';
  const pdf = async () => { setBusy(true); try { await downloadTicketPdf(o); } finally { setBusy(false); } };
  return (
    <div className="bg-ink-50/70 py-8">
      <div className="container-x max-w-4xl">
        {sp.get('new') && o.status === 'paid' && (
          <div className="mb-6 flex items-center gap-4 rounded-2xl bg-emerald-600 p-5 text-white">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20"><Icon name="Check" size={28} /></span>
            <div><div className="text-xl font-bold">Your booking is confirmed!</div><div className="text-sm text-white/85">Confirmation sent to {o.contact.email || o.contact.phone}. Paid via {o.payment?.gateway === 'simulator' ? 'sandbox' : o.payment?.gateway} · ref {o.payment?.ref}</div></div>
          </div>
        )}
        <div className="grid gap-6 md:grid-cols-[1fr_320px]">
          <div className="card overflow-hidden">
            <div className="flex gap-4 p-5" style={{ background: `linear-gradient(120deg, ${e.palette[0]}, ${e.palette[1]})` }}>
              <Poster event={e} className="h-32 w-24 shrink-0 rounded-lg ring-2 ring-white/40" showTitle={false} size="sm" />
              <div className="text-white"><div className="text-xs uppercase tracking-widest opacity-80">{e.subCategory || e.category}</div><h1 className="text-2xl font-bold leading-tight">{e.title}</h1><div className="mt-2 text-sm opacity-90">{fmtDate(o.showDate)} | {fmtTime(o.showDate)}</div><div className="text-sm opacity-90">{o.venue?.name}</div></div>
            </div>
            <div className="flex flex-col items-center gap-6 border-t-2 border-dashed border-ink-100 p-6 sm:flex-row">
              <div className="relative"><QR value={t.code || 'NA'} size={170} className={cx('rounded-lg', (voided || t.scanned) && 'opacity-20')} />
                {voided && <span className="absolute inset-0 flex items-center justify-center text-center text-lg font-bold uppercase text-brand-600">{STATUS_LABEL[o.status]}</span>}
                {!voided && t.scanned && <span className="absolute inset-0 flex items-center justify-center font-bold text-emerald-700">Checked in</span>}</div>
              <div className="flex-1 text-sm">
                <div className="text-ink-500">Ticket {idx + 1} of {o.tickets.length} · {t.tier}</div>
                <div className="text-lg font-semibold">{t.label}</div>
                <div className="mt-2 font-mono text-base tracking-wider">{t.code}</div>
                <div className="mt-3 text-ink-500">Booking ID <b className="text-ink-900">{o.id}</b></div>
                {o.tickets.length > 1 && <div className="mt-4 flex items-center gap-2"><button onClick={() => setIdx((idx - 1 + o.tickets.length) % o.tickets.length)} className="btn-outline h-8 w-8 p-0" aria-label="Previous ticket"><Icon name="ChevronLeft" size={16} /></button><div className="flex gap-1">{o.tickets.map((_, k) => <span key={k} className={cx('h-1.5 w-1.5 rounded-full', k === idx ? 'bg-brand-500' : 'bg-ink-300')} />)}</div><button onClick={() => setIdx((idx + 1) % o.tickets.length)} className="btn-outline h-8 w-8 p-0" aria-label="Next ticket"><Icon name="ChevronRight" size={16} /></button></div>}
              </div>
            </div>
            <div className="bg-ink-50 px-6 py-3 text-xs text-ink-500">Show this M-ticket at the gate. Each QR admits one person once — duplicates are blocked.</div>
          </div>
          <div className="space-y-4">
            <div className="card p-5 text-sm"><h3 className="font-semibold">Payment details</h3>
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between"><span className="text-ink-500">Tickets</span><span>{bdt(o.amounts.subtotal)}</span></div>
                {o.amounts.discount > 0 && <div className="flex justify-between text-emerald-700"><span>Promo {o.promo}</span><span>− {bdt(o.amounts.discount)}</span></div>}
                <div className="flex justify-between"><span className="text-ink-500">Convenience fee</span><span>{bdt(o.amounts.fee || 0)}</span></div>
                <div className="flex justify-between border-t border-ink-100 pt-2 font-bold"><span>Total paid</span><span>{o.amounts.total ? bdt(o.amounts.total) : '৳0'}</span></div>
                <div className="flex justify-between pt-1 text-xs text-ink-500"><span className="capitalize">{o.payment?.method} · {o.payment?.gateway}</span><span className="font-mono">{o.payment?.ref}</span></div>
              </div>
            </div>
            <div className="card divide-y divide-ink-100 text-sm">
              <button onClick={pdf} disabled={busy} className="flex w-full items-center gap-3 px-5 py-3.5 hover:bg-ink-50"><Icon name="Download" size={18} className="text-brand-500" />{busy ? 'Preparing PDF…' : 'Download tickets & receipt (PDF)'}</button>
              <button onClick={() => toast(`Tickets re-sent to ${o.contact.email}`)} className="flex w-full items-center gap-3 px-5 py-3.5 hover:bg-ink-50"><Icon name="Mail" size={18} className="text-brand-500" />Resend via email</button>
              <button onClick={() => toast(`SMS sent to ${o.contact.phone}`)} className="flex w-full items-center gap-3 px-5 py-3.5 hover:bg-ink-50"><Icon name="MessageSquare" size={18} className="text-brand-500" />Resend via SMS</button>
              <button onClick={() => downloadIcs(o)} className="flex w-full items-center gap-3 px-5 py-3.5 hover:bg-ink-50"><Icon name="CalendarPlus" size={18} className="text-brand-500" />Add to calendar</button>
              <Link href="/profile?tab=bookings" className="flex w-full items-center gap-3 px-5 py-3.5 hover:bg-ink-50"><Icon name="Settings" size={18} className="text-brand-500" />Manage booking</Link>
            </div>
            <Link href="/" className="btn-dark h-11 w-full">Continue browsing</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
