import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Icon from '@/components/Icon';
import HoldTimer from '@/components/HoldTimer';
import OrderSummary from '@/components/OrderSummary';
import { Loading, ErrorState } from '@/components/States';
import { api, MODE } from '@/lib/api';
import { useApi, useStore } from '@/lib/store';
import { bdt, cx } from '@/lib/utils';

export default function Payment() {
  const { orderId } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { config, toast } = useStore();
  const { data: o, error, loading } = useApi(() => api.getOrder({ orderId }), [orderId]);
  const hold = useApi(() => (o ? api.getHold({ holdId: o.holdId }).catch(() => null) : null), [o?.id]);
  const [method, setMethod] = useState(sp.get('m') || 'sslcommerz');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (o?.status === 'paid') nav(`/booking/${o.id}`, { replace: true }); }, [o, nav]);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  const m = config.paymentMethods.find((x) => x.id === method) || config.paymentMethods[0];
  const failed = sp.get('failed');
  const pay = async () => {
    setBusy(true);
    try {
      const r = await api.startPayment({ orderId, method: m.id });
      if (r.alreadyPaid) return nav(`/booking/${orderId}`);
      if (r.warning) toast(`Gateway unreachable — using sandbox simulator`, 'err');
      const url = r.redirectUrl;
      if (url.startsWith('/') ) nav(url);
      else if (url.startsWith(window.location.origin)) nav(url.slice(window.location.origin.length));
      else window.location.assign(url); // real gateway page (SSLCOMMERZ / bKash)
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  };
  if (o.status !== 'pending_payment') return <ErrorState error={{ message: `This booking is ${o.status.replace('_', ' ')}. Please book again.` }} />;
  return (
    <div className="bg-ink-50/70 py-6 md:py-10">
      <div className="container-x">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Payment options</h1>{hold.data && <HoldTimer expiresAt={hold.data.expiresAt} onExpire={() => toast('Seat hold expired', 'err')} />}</div>
        {failed && <div className="mb-5 flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-700"><Icon name="AlertTriangle" size={18} className="mt-0.5 shrink-0" /><div><b>Payment {failed === 'cancel' ? 'cancelled' : 'not completed'}.</b> No money was taken. Your seats are still held — try again with the same or another method.{o.payment?.lastError && <div className="mt-1 text-xs opacity-80">Gateway said: {o.payment.lastError}</div>}</div></div>}
        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          <div className="card grid overflow-hidden md:grid-cols-[240px_1fr]">
            <div className="border-b border-ink-100 bg-ink-50 md:border-b-0 md:border-r">
              {config.paymentMethods.map((p) => <button key={p.id} onClick={() => setMethod(p.id)} className={cx('flex w-full items-center gap-3 border-l-4 px-4 py-4 text-left text-sm', method === p.id ? 'border-brand-500 bg-white font-semibold' : 'border-transparent hover:bg-white/60')}><span className="flex h-8 w-8 items-center justify-center rounded-md text-white" style={{ background: p.color }}><Icon name={p.icon} size={16} /></span>{p.name}</button>)}
            </div>
            <div className="p-6">
              <h2 className="text-lg font-semibold">{m.name}</h2><p className="text-sm text-ink-500">{m.sub}</p>
              <div className="mt-5 rounded-xl bg-ink-50 p-4 text-sm text-ink-700">You&apos;ll be redirected to the secure payment page to pay <b>{bdt(o.amounts.total)}</b>. Card and wallet details are entered on the gateway — never on Ticketo.{o.payment?.pgMode === 'direct' || o.event?.merchant ? <div className="mt-2 text-xs text-ink-500">Payment is collected {MODE === 'local' ? 'in sandbox mode' : 'through the organiser\'s connected gateway where configured'}.</div> : null}</div>
              <div className="mt-5 flex items-center gap-2 text-xs text-ink-500"><Icon name="Lock" size={14} />TLS encrypted · PCI-DSS compliant gateway · validated server-to-server</div>
            </div>
          </div>
          <div className="space-y-4 lg:sticky lg:top-28 lg:self-start">
            <OrderSummary event={o.event} venue={o.venue} showDate={o.showDate} items={o.items} pricing={o.amounts} />
            <button onClick={pay} disabled={busy} className="btn-primary h-12 w-full text-base">{busy ? 'Redirecting…' : `Pay ${bdt(o.amounts.total)} via ${m.name}`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
