// Sandbox payment page used when no real gateway is reachable (offline demo / local mode).
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Icon from '@/components/Icon';
import { Loading, ErrorState } from '@/components/States';
import { api } from '@/lib/api';
import { useApi, useStore } from '@/lib/store';
import { bdt } from '@/lib/utils';

export default function PaySimulate() {
  const { orderId } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { config } = useStore();
  const { data: o, error, loading } = useApi(() => api.getOrder({ orderId }), [orderId]);
  const [step, setStep] = useState(0);
  const [wallet, setWallet] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  const m = config.paymentMethods.find((x) => x.id === sp.get('m')) || config.paymentMethods[0];
  const mfs = ['bkash', 'nagad'].includes(m.id);
  const finish = async (outcome) => {
    setBusy(true);
    const r = await api.simulatePayment({ orderId, outcome });
    nav(r.status === 'paid' ? `/booking/${orderId}?new=1` : `/payment/${orderId}?failed=${outcome}&m=${m.id}`, { replace: true });
  };
  return (
    <div className="flex min-h-screen items-start justify-center bg-ink-100 px-4 py-10">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-pop">
        <div className="px-5 py-4 text-white" style={{ background: m.color }}>
          <div className="flex items-center justify-between"><span className="flex items-center gap-2 font-semibold"><Icon name={m.icon} size={18} />{m.name}</span><span className="rounded bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">Sandbox</span></div>
          <div className="mt-4 text-xs opacity-80">Merchant</div><div className="font-medium">{o.event?.merchant?.name} via Ticketo</div>
          <div className="mt-3 text-3xl font-bold">{bdt(o.amounts.total)}</div>
        </div>
        <div className="p-5">
          {sp.get('note') && <p className="mb-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{sp.get('note')}</p>}
          {busy ? <div className="flex flex-col items-center py-10"><span className="h-10 w-10 animate-spin rounded-full border-4 border-ink-100 border-t-brand-500" /><p className="mt-4 font-medium">Verifying payment…</p></div>
            : mfs ? (step === 0 ? (
              <><label className="label" htmlFor="w">Your {m.name} account number</label><input id="w" className="input" value={wallet} onChange={(e) => setWallet(e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="01XXXXXXXXX" inputMode="numeric" />
                <button onClick={() => setStep(1)} disabled={wallet.length < 11} className="btn mt-4 h-11 w-full text-white" style={{ background: m.color }}>Confirm</button></>
            ) : (
              <><p className="mb-3 text-sm text-ink-500">Verification code sent to {wallet}. <b>Use 123456 in sandbox.</b></p><label className="label" htmlFor="otp">Verification code</label><input id="otp" className="input tracking-[.5em]" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" />
                <button onClick={() => finish(otp === '123456' ? 'success' : 'failed')} disabled={otp.length < 6} className="btn mt-4 h-11 w-full text-white" style={{ background: m.color }}>Confirm payment</button></>
            )) : (
              <><p className="text-sm text-ink-600">Simulated hosted checkout. Choose an outcome:</p>
                <button onClick={() => finish('success')} className="btn mt-4 h-11 w-full bg-emerald-600 text-white hover:bg-emerald-700"><Icon name="CheckCircle2" size={17} />Successful payment</button>
                <button onClick={() => finish('failed')} className="btn-outline mt-2 h-11 w-full"><Icon name="XCircle" size={17} />Failed payment</button></>
            )}
          {!busy && <button onClick={() => finish('cancel')} className="mt-3 w-full text-center text-sm text-ink-500 hover:underline">Cancel and return to Ticketo</button>}
        </div>
      </div>
    </div>
  );
}
