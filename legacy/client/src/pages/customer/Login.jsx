import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Link from '@/components/Link';
import Icon from '@/components/Icon';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';

export default function Login() {
  const { signIn, toast } = useStore();
  const nav = useNavigate();
  const next = useSearchParams()[0].get('next') || '/';
  const [step, setStep] = useState(0);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(null);
  const send = async () => { setBusy(true); try { const r = await api.requestOtp({ phone }); setStep(1); toast(r.demo ? 'OTP sent (demo code: 123456)' : 'OTP sent by SMS'); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); } };
  const verify = async () => {
    setBusy(true);
    try { const r = await api.verifyOtp({ phone, otp }); if (r.isNew) { pending.current = r; setStep(2); } else { signIn(r); nav(next, { replace: true }); } }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const finish = async () => { signIn(pending.current); await api.updateProfile({ name }); signIn({ ...pending.current, user: { ...pending.current.user, name } }); nav(next, { replace: true }); };
  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-ink-50/70 px-4 py-10">
      <div className="card w-full max-w-md p-7">
        {step === 0 && (<>
          <h1 className="text-center text-xl font-bold">Sign in with your mobile</h1>
          <p className="mt-1 text-center text-sm text-ink-500">We&apos;ll send a one-time password by SMS</p>
          <div className="mt-6 flex items-center gap-2 border-b-2 border-ink-100 pb-2 focus-within:border-brand-500"><span className="text-ink-700">+880</span><input autoFocus value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="01XXXXXXXXX" inputMode="numeric" className="w-full text-lg outline-none" aria-label="Mobile number" /></div>
          <button onClick={send} disabled={!/^01[3-9]\d{8}$/.test(phone) || busy} className="btn-primary mt-6 h-12 w-full">Continue</button>
          <button onClick={() => nav(next)} className="btn-ghost mt-2 h-10 w-full text-sm">Skip — continue as guest</button>
          <div className="mt-6 border-t border-ink-100 pt-4 text-center text-sm text-ink-500">Organiser or staff? <Link href="/partner/login" className="font-medium text-brand-500">Partner login</Link></div>
        </>)}
        {step === 1 && (<>
          <button onClick={() => setStep(0)} className="mb-3 flex items-center gap-1 text-sm text-ink-500"><Icon name="ArrowLeft" size={15} />Back</button>
          <h1 className="text-xl font-bold">Enter the 6-digit code</h1><p className="mt-1 text-sm text-ink-500">Sent to +880 {phone}</p>
          <input autoFocus value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={(e) => e.key === 'Enter' && otp.length === 6 && verify()} inputMode="numeric" className="input mt-6 h-14 text-center text-2xl tracking-[.6em]" aria-label="OTP" />
          <button onClick={verify} disabled={otp.length < 6 || busy} className="btn-primary mt-6 h-12 w-full">Verify</button>
        </>)}
        {step === 2 && (<>
          <h1 className="text-xl font-bold">Almost there!</h1><p className="mt-1 text-sm text-ink-500">What should we print on your tickets?</p>
          <label className="label mt-5" htmlFor="nm">Full name</label><input id="nm" autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} />
          <button onClick={finish} disabled={name.trim().length < 2} className="btn-primary mt-6 h-12 w-full">Create account</button>
        </>)}
      </div>
    </div>
  );
}
