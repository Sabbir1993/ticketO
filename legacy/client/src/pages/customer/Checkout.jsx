import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Link from '@/components/Link';
import Icon from '@/components/Icon';
import HoldTimer from '@/components/HoldTimer';
import OrderSummary from '@/components/OrderSummary';
import { Loading, ErrorState } from '@/components/States';
import { api } from '@/lib/api';
import { useApi, useStore } from '@/lib/store';
import { bdt, cx } from '@/lib/utils';

export default function Checkout() {
  const { holdId } = useParams();
  const nav = useNavigate();
  const { user, config, toast } = useStore();
  const { data: h, error, loading } = useApi(() => api.getHold({ holdId }), [holdId]);
  const [contact, setContact] = useState({ name: '', phone: '', email: '' });
  const [code, setCode] = useState('');
  const [pricing, setPricing] = useState(null);
  const [promoMsg, setPromoMsg] = useState('');
  const [agree, setAgree] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (h) setPricing(h.pricing); }, [h]);
  useEffect(() => { if (user?.role === 'customer') setContact((c) => ({ name: c.name || (user.name !== 'Guest' ? user.name : ''), phone: c.phone || user.phone?.replace('+88', ''), email: c.email || user.email || '' })); }, [user]);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={{ ...error, message: `${error.message}. Please choose your seats again.` }} />;
  const apply = async (c = code) => {
    const q = await api.quote({ holdId, promoCode: c });
    if (q.promoError) { setPromoMsg(q.promoError); return; }
    setPricing(q); setCode(q.promo); setPromoMsg(''); toast(`${q.promo} applied — you save ${bdt(q.discount)}`);
  };
  const remove = async () => { setPricing(await api.quote({ holdId })); setCode(''); };
  const submit = async (ev) => {
    ev.preventDefault();
    setBusy(true);
    try { const o = await api.createOrder({ holdId, contact, promoCode: pricing?.promo || undefined }); nav(o.status === 'paid' ? `/booking/${o.id}?new=1` : `/payment/${o.id}`); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const offers = [...(h.promos || []).map((p) => ({ code: p.code, desc: `${p.type === 'flat' ? bdt(p.value) : `${p.value}%`} off — organiser offer` })), ...config.promos.filter((p) => p.scope === 'all' || p.scope === h.event.category)];
  return (
    <form onSubmit={submit} className="bg-ink-50/70 py-6 md:py-10">
      <div className="container-x">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Review your booking</h1><HoldTimer expiresAt={h.expiresAt} onExpire={() => { toast('Time is up — your seats were released', 'err'); nav(`/events/${h.event.slug}`); }} /></div>
        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          <div className="space-y-5">
            <section className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Contact details</h2>{!user && <Link href={`/login?next=/checkout/${holdId}`} className="text-sm font-medium text-brand-500">Login for faster checkout ›</Link>}</div>
              {!user && <p className="mt-1 text-sm text-ink-500">Continuing as guest — tickets are sent to these details.</p>}
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div><label className="label" htmlFor="c-name">Full name</label><input id="c-name" required className="input" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></div>
                <div><label className="label" htmlFor="c-phone">Mobile number</label><input id="c-phone" required className="input" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="01XXXXXXXXX" inputMode="tel" /></div>
                <div><label className="label" htmlFor="c-email">Email</label><input id="c-email" required type="email" className="input" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} placeholder="you@example.com" /></div>
              </div>
            </section>
            <section className="card p-5">
              <h2 className="text-lg font-semibold">Offers & promo codes</h2>
              {pricing?.promo ? (
                <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span><Icon name="Tag" size={15} className="mr-1 inline" /><b>{pricing.promo}</b> applied · saved {bdt(pricing.discount)}</span><button type="button" onClick={remove} className="font-medium underline">Remove</button></div>
              ) : (
                <div className="mt-3 flex gap-2"><input className="input uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter promo code" aria-label="Promo code" /><button type="button" onClick={() => apply()} disabled={!code} className="btn-dark h-11 px-6">Apply</button></div>
              )}
              {promoMsg && <p className="mt-2 text-sm text-brand-600">{promoMsg}</p>}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">{offers.map((p) => <button type="button" key={p.code} onClick={() => apply(p.code)} className={cx('rounded-xl border border-dashed p-3 text-left hover:border-brand-400', pricing?.promo === p.code ? 'border-emerald-500 bg-emerald-50' : 'border-ink-300')}><div className="font-mono text-sm font-bold">{p.code}</div><div className="text-xs text-ink-500">{p.desc}</div></button>)}</div>
            </section>
          </div>
          <div className="space-y-4 lg:sticky lg:top-28 lg:self-start">
            <OrderSummary event={h.event} venue={h.venue} showDate={h.showDate} items={h.items} pricing={pricing} />
            <label className="flex items-start gap-2 text-xs text-ink-500"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-brand-500" />I agree to the terms and the organiser&apos;s cancellation & refund policy.</label>
            <button disabled={!agree || busy} className="btn-primary h-12 w-full text-base">{busy ? 'Please wait…' : pricing?.total === 0 ? 'Confirm free booking' : `Proceed to pay ${bdt(pricing?.total)}`}</button>
            <button type="button" onClick={async () => { await api.releaseHold({ holdId }); nav(`/events/${h.event.slug}`); }} className="btn-ghost h-10 w-full text-sm">Cancel & release seats</button>
          </div>
        </div>
      </div>
    </form>
  );
}
