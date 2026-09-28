// Staff choose their own password from the one-time invite / reset link (/partner/set-password?token=…).
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Link from '@/components/Link';
import Logo from '@/components/Logo';
import Icon from '@/components/Icon';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';

export default function SetPassword() {
  const { toast } = useStore();
  const token = useSearchParams()[0].get('token') || '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const rules = [[pw.length >= 12, 'At least 12 characters'], [new Set(pw).size >= 6, 'Not a simple repeat'], [pw.length > 0 && pw === pw2, 'Both entries match']];
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const r = await api.setStaffPassword({ token, password: pw }); setPw(''); setPw2(''); setDone(r.email); }
    catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="flex min-h-[75vh] items-center justify-center bg-ink-50/70 px-4 py-10">
      <div className="card w-full max-w-md p-7">
        <Logo />
        {done ? (<>
          <h1 className="mt-5 text-xl font-bold">Password set</h1>
          <p className="mt-1 text-sm text-ink-500">Sign in as <b>{done}</b>. On first sign-in you’ll set up an authenticator app for two-step verification.</p>
          <Link href="/partner/login" className="btn-primary mt-5 h-12 w-full">Go to sign in</Link>
        </>) : !token ? (<>
          <h1 className="mt-5 text-xl font-bold">Link missing</h1>
          <p className="mt-1 text-sm text-ink-500">Open the full link your administrator sent you, or ask them for a new one.</p>
        </>) : (
          <form onSubmit={submit}>
            <h1 className="mt-5 text-xl font-bold">Choose your password</h1>
            <p className="text-sm text-ink-500">For your Ticketo staff account. Nobody else — including admins — will know it.</p>
            <label className="label mt-5" htmlFor="sp1">New password</label><input id="sp1" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
            <label className="label mt-3" htmlFor="sp2">Repeat password</label><input id="sp2" type="password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required />
            <ul className="mt-3 space-y-1 text-xs">{rules.map(([ok, l]) => <li key={l} className={ok ? 'flex items-center gap-1.5 text-emerald-700' : 'flex items-center gap-1.5 text-ink-500'}><Icon name={ok ? 'CheckCircle2' : 'Circle'} size={13} />{l}</li>)}</ul>
            <button disabled={busy || !rules.every(([ok]) => ok)} className="btn-primary mt-5 h-12 w-full">{busy ? 'Saving…' : 'Set password'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
